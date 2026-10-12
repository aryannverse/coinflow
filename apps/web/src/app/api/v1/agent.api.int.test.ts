import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import { getDb } from '@/server/db/client'
import { recurringItems } from '@/server/db/schema'
import { addDays, dayOfMonth, toISTDate } from '@/lib/dates'
import { formatSSE } from '@/lib/sse'
import { AUD_SERVICE, SERVICE_SUB, signInternalToken, verifyInternalToken } from '@/server/internal-token'
import { createGroup } from '@/server/services/groups/groups'
import * as digest from '@/app/api/internal/coach/digest/route'
import * as coachPost from '@/app/api/internal/notifications/route'
import * as me from './me/route'
import * as txns from './transactions/route'
import * as txn from './transactions/[id]/route'
import * as chat from './agent/chat/route'
import * as health from './agent/health/route'
import * as receipt from './agent/receipt/route'
import * as stt from './agent/stt/route'

const KEY = 'coinflow-test-secret-0123456789abcdef'
const url = (p: string) => `http://localhost/api/v1${p}`
const withToken = (token: string, init: RequestInit = {}) => ({ ...init, headers: { ...(init.headers as object), authorization: `Bearer ${token}` } })
const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const sse = (events: [string, unknown][]) => events.map(([event, data]) => formatSSE({ event, data: JSON.stringify(data) })).join('')

describe('agent bridge', () => {
  let food: string
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a', { name: 'Yash' })
    food = (await builtinCategory('Food & Dining')).id
    process.env.AGENT_SHARED_SECRET = KEY
    process.env.AGENT_URL = 'http://agent.test'
    clerkState.userId = null
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.AGENT_SHARED_SECRET
    delete process.env.AGENT_URL
  })

  it('internal-token path: a valid token is the user; anything else is 401; a missing secret disables it', async () => {
    const ok = await me.GET(new Request(url('/me'), withToken(signInternalToken('user_a'))))
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.id).toBe('user_a')
    const now = Math.floor(Date.now() / 1000)
    for (const token of [
      signInternalToken('user_a', { nowSec: now - 601 }), // expired
      signInternalToken('user_a', { key: 'x'.repeat(40) }), // not our secret
      signInternalToken(SERVICE_SUB, { aud: AUD_SERVICE }), // a service token is not a user
      signInternalToken('user_nobody'), // no such Coinflow user
    ]) {
      expect((await me.GET(new Request(url('/me'), withToken(token)))).status).toBe(401)
    }
    const valid = signInternalToken('user_a')
    delete process.env.AGENT_SHARED_SECRET
    expect((await me.GET(new Request(url('/me'), withToken(valid)))).status).toBe(401)
  })

  it('the AI never writes: an internal token reads (GET 200) but every write is refused with 403 read_only', async () => {
    const token = signInternalToken('user_a')
    expect((await me.GET(new Request(url('/me'), withToken(token)))).status).toBe(200)
    expect((await txns.GET(new Request(url('/transactions'), withToken(token)))).status).toBe(200)
    const id = '99999999-9999-4999-8999-999999999999'
    const attempts = [
      txns.POST(new Request(url('/transactions'), withToken(token, json({ type: 'expense', amount: 100, categoryId: food })))),
      me.PATCH(new Request(url('/me'), withToken(token, { ...json({ name: 'Hacked' }), method: 'PATCH' }))),
      txn.DELETE(new Request(url(`/transactions/${id}`), withToken(token, { method: 'DELETE' })), { params: Promise.resolve({ id }) }),
    ]
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe('read_only')
    }
    expect((await (await me.GET(new Request(url('/me'), withToken(token)))).json()).data.name).toBe('Yash')
  })

  it('chat streams through and drops proposals that fail the API schemas or name a non-member', async () => {
    const { data: g } = await createGroup('user_a', { name: 'Goa', placeholders: [{ displayName: 'Asha' }] })
    const asha = g.members.find((m) => m.displayName === 'Asha')!.id
    const stranger = '99999999-9999-4999-8999-999999999999'
    const groupExpense = (memberIds: string[]) => ({
      id: crypto.randomUUID(), kind: 'group_expense', summary: 'Cab ₹300', groupId: g.id,
      payload: { description: 'Cab', amountPaise: 30_000, categoryId: food, payers: [{ memberId: g.myMemberId, paidPaise: 30_000 }], split: { mode: 'equal', memberIds } },
    })
    const body = sse([
      ['status', { state: 'thinking' }],
      ['proposal', { id: crypto.randomUUID(), kind: 'expense', summary: 'Expense ₹250', payload: { type: 'expense', amount: 25_000, categoryId: food, source: 'chat' } }],
      ['proposal', groupExpense([g.myMemberId, asha])],
      ['proposal', groupExpense([g.myMemberId, stranger])],
      ['proposal', { id: crypto.randomUUID(), kind: 'expense', summary: 'bad', payload: { type: 'expense', amount: 0, categoryId: food, source: 'chat' } }],
      ['token', { text: 'Drafted.' }],
      ['done', { threadId: 'main' }],
    ])
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://agent.test/chat')
      const auth = (init?.headers as Record<string, string>).authorization.slice(7)
      expect(verifyInternalToken(auth, 'agent')).toBe('user_a')
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    clerkState.userId = 'user_a'
    clerkState.email = 'user_a@example.com'
    const res = await chat.POST(new Request(url('/agent/chat'), json({ message: '250 lunch', context: { route: '/home' } })))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text.match(/event: proposal/g)).toHaveLength(2) // the expense and the members-only group expense
    expect(text.match(/"code":"invalid_proposal"/g)).toHaveLength(2) // the stranger and the ₹0 expense
    expect(text).toContain('event: done')
  })

  it('agent unreachable → 503 agent_offline; health says offline; unconfigured → offline without calling out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    clerkState.userId = 'user_a'
    clerkState.email = 'user_a@example.com'
    const res = await chat.POST(new Request(url('/agent/chat'), json({ message: 'hi', context: { route: '/home' } })))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('agent_offline')
    expect((await (await health.GET(new Request(url('/agent/health')))).json()).data).toEqual({ online: false, capabilities: null })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, capabilities: { chat: true, vision: false, stt: true, tts: false } })))
    expect((await (await health.GET(new Request(url('/agent/health')))).json()).data.online).toBe(true)
  })

  it('the agent refusing our token is "offline", never a sign-out; a split listing someone twice is dropped', async () => {
    clerkState.userId = 'user_a'
    clerkState.email = 'user_a@example.com'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'unauthorized', message: 'bad token' } }, { status: 401 })))
    const refused = await chat.POST(new Request(url('/agent/chat'), json({ message: 'hi', context: { route: '/home' } })))
    expect(refused.status).toBe(503)
    expect((await refused.json()).error.code).toBe('agent_offline')

    const { data: g } = await createGroup('user_a', { name: 'Goa', placeholders: [{ displayName: 'Asha' }] })
    const twice = {
      id: crypto.randomUUID(), kind: 'group_expense', summary: 'Cab', groupId: g.id,
      payload: { description: 'Cab', amountPaise: 30_000, categoryId: food, payers: [{ memberId: g.myMemberId, paidPaise: 30_000 }], split: { mode: 'equal', memberIds: [g.myMemberId, g.myMemberId] } },
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse([['proposal', twice], ['done', {}]]), { headers: { 'content-type': 'text/event-stream' } })))
    const text = await (await chat.POST(new Request(url('/agent/chat'), json({ message: 'cab', context: { route: `/groups/${g.id}`, groupId: g.id } })))).text()
    expect(text).not.toContain('event: proposal')
    expect(text).toContain('"code":"invalid_proposal"')
  })

  it('internal endpoints refuse a signed-in Clerk session; coach_off is honoured', async () => {
    clerkState.userId = 'user_a'
    clerkState.email = 'user_a@example.com'
    expect((await digest.GET(new Request('http://localhost/api/internal/coach/digest'))).status).toBe(401)
    await makeUser('user_quiet', { name: 'Quiet', coachEnabled: false })
    const service = signInternalToken(SERVICE_SUB, { aud: AUD_SERVICE })
    const res = await coachPost.POST(new Request('http://localhost/api/internal/notifications', withToken(service, json({
      userId: 'user_quiet', kind: 'coach_weekly', title: 'Your week', body: 'x', href: '/insights', dedupeKey: 'weekly:1',
    }))))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('coach_off')
  })

  it('coach endpoints: service token only; facts include a bill due tomorrow; cap of two and dedupe', async () => {
    const tomorrow = addDays(toISTDate(new Date()), 1)
    const bills = (await builtinCategory('Bills & Utilities')).id
    await getDb().insert(recurringItems).values({
      userId: 'user_a', kind: 'bill', name: 'Wi-Fi', amount: 70_000, cadence: 'monthly', nextDueOn: tomorrow, anchorDay: dayOfMonth(tomorrow), categoryId: bills,
    })
    const service = signInternalToken(SERVICE_SUB, { aud: AUD_SERVICE })
    expect((await digest.GET(new Request('http://localhost/api/internal/coach/digest'))).status).toBe(401)
    expect((await digest.GET(new Request('http://localhost/api/internal/coach/digest', withToken(signInternalToken('user_a'))))).status).toBe(401)
    const facts = (await (await digest.GET(new Request('http://localhost/api/internal/coach/digest', withToken(service)))).json()).data
    expect(facts[0]).toMatchObject({ userId: 'user_a', coachSentToday: 0, billsDueTomorrow: [{ name: 'Wi-Fi', amountPaise: 70_000, dueOn: tomorrow }] })

    const post = (key: string) => coachPost.POST(new Request('http://localhost/api/internal/notifications', withToken(service, json({
      userId: 'user_a', kind: 'coach_bill', title: 'Wi-Fi is due tomorrow', body: '₹700 is already set aside.', href: '/recurring', dedupeKey: key,
    }))))
    expect((await post('bill:1')).status).toBe(201)
    const dup = await post('bill:1')
    expect(dup.status).toBe(409)
    expect((await dup.json()).error.code).toBe('duplicate')
    expect((await post('bill:2')).status).toBe(201)
    const capped = await post('bill:3')
    expect(capped.status).toBe(409)
    expect((await capped.json()).error.code).toBe('coach_cap')
  })

  it('spec §10: long-running agent routes may use Vercel Hobby’s 300 s; uploads stop at 4 MB before reaching the agent', async () => {
    expect([chat.maxDuration, stt.maxDuration, receipt.maxDuration]).toEqual([300, 300, 300])
    const agent = vi.fn(async () => Response.json({ data: {} }))
    vi.stubGlobal('fetch', agent)
    clerkState.userId = 'user_a'
    clerkState.email = 'user_a@example.com'
    const tooBig = String(4 * 1024 * 1024 + 70 * 1024) // just over 4 MB plus multipart slack; under Vercel's 4.5 MB
    const declared = (path: string) => new Request(url(path), {
      method: 'POST', body: 'x', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': tooBig },
    })
    const photo = await receipt.POST(declared('/agent/receipt'))
    expect(photo.status).toBe(413)
    expect((await photo.json()).error).toEqual({ code: 'image_too_large', message: 'That photo is over 4 MB. Try a closer, smaller shot.' })
    const voice = await stt.POST(declared('/agent/stt'))
    expect(voice.status).toBe(413)
    expect((await voice.json()).error.code).toBe('audio_too_large')
    // An actual 4 MB + 1 byte file is refused too, even without a declared length.
    const form = new FormData()
    form.append('file', new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'r.jpg', { type: 'image/jpeg' }))
    expect((await receipt.POST(new Request(url('/agent/receipt'), { method: 'POST', body: form }))).status).toBe(413)
    expect(agent).not.toHaveBeenCalled()
  })
})
