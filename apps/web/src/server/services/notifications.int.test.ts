import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeUser, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import * as stream from '@/app/api/v1/notifications/stream/route'
import { getDb } from '@/server/db/client'
import { closeBus } from '@/server/notify-bus'
import { listNotifications, markAllRead, markRead, notify } from './notifications'

const send = (userId: string, title: string) =>
  getDb().transaction((tx) => notify(tx, [{ userId, kind: 'expense_added', title, body: '', href: '/groups/x', payload: {} }]))

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, acc: { text: string }, needle: string, ms = 5_000) {
  const dec = new TextDecoder()
  const deadline = Date.now() + ms
  while (!acc.text.includes(needle)) {
    const left = deadline - Date.now()
    if (left <= 0) throw new Error(`Timed out waiting for "${needle}". Got: ${acc.text}`)
    const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), left))])
    if (chunk && !chunk.done) acc.text += dec.decode(chunk.value)
  }
}

describe('notifications', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await makeUser('user_b')
    clerkState.userId = 'user_a'
    clerkState.email = 'user_a@example.com'
  })
  afterAll(async () => {
    await closeBus()
  })

  it('lists newest first with an unread count; read is per owner; read-all clears', async () => {
    await send('user_a', 'one')
    await send('user_a', 'two')
    const list = await listNotifications('user_a', { limit: 30 })
    expect(list.data.map((n) => n.title)).toEqual(['two', 'one'])
    expect(list.unreadCount).toBe(2)
    await expect(markRead('user_b', list.data[0].id)).rejects.toMatchObject({ status: 404 })
    await markRead('user_a', list.data[0].id)
    expect((await listNotifications('user_a', { limit: 30 })).unreadCount).toBe(1)
    await markAllRead('user_a')
    expect((await listNotifications('user_a', { limit: 30 })).unreadCount).toBe(0)
  })

  it('SSE smoke: ready, then a notification committed after connecting, then sync', async () => {
    const ctrl = new AbortController()
    const res = await stream.GET(new Request('http://localhost/api/v1/notifications/stream', { signal: ctrl.signal }))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const acc = { text: '' }
    await readUntil(reader, acc, 'event: ready')
    await send('user_a', 'Ravi added Bowling')
    await readUntil(reader, acc, 'Ravi added Bowling')
    expect(acc.text).toMatch(/id: \d+\nevent: notification\n/)
    await readUntil(reader, acc, 'event: sync')
    ctrl.abort()
  })

  it('SSE resumes after Last-Event-ID without replaying older rows', async () => {
    await send('user_a', 'first')
    await send('user_a', 'second')
    const { data } = await listNotifications('user_a', { limit: 30 })
    const firstSeq = data.find((n) => n.title === 'first')!.seq
    const ctrl = new AbortController()
    const res = await stream.GET(new Request('http://localhost/api/v1/notifications/stream', {
      signal: ctrl.signal, headers: { 'last-event-id': String(firstSeq) },
    }))
    const acc = { text: '' }
    await readUntil(res.body!.getReader(), acc, '"title":"second"')
    expect(acc.text).not.toContain('"title":"first"')
    ctrl.abort()
  })
})
