import { Webhook } from 'svix'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeUser, resetDb } from '@test/int/helpers'
import { getUser } from '@/server/services/users'
import { POST } from './route'

const SECRET = 'whsec_' + Buffer.from('coinflow-test-secret-32-bytes!!!').toString('base64')

function signed(body: object, secret = SECRET) {
  const payload = JSON.stringify(body)
  const id = 'msg_' + Math.random().toString(36).slice(2)
  const ts = new Date()
  const signature = new Webhook(secret).sign(id, ts, payload)
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(ts.getTime() / 1000)),
      'svix-signature': signature,
    },
  })
}

const clerkUser = (id: string, email: string) => ({
  id, first_name: 'Asha', last_name: 'K', image_url: null,
  primary_email_address_id: 'e1', email_addresses: [{ id: 'e1', email_address: email }],
})

describe('POST /api/webhooks/clerk', () => {
  beforeEach(async () => {
    await resetDb()
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET
  })

  it('creates users on user.created (idempotently)', async () => {
    const evt = { type: 'user.created', data: clerkUser('user_w', 'w@example.com'), object: 'event' }
    expect((await POST(signed(evt))).status).toBe(200)
    expect((await POST(signed(evt))).status).toBe(200)
    expect(await getUser('user_w')).toMatchObject({ email: 'w@example.com', name: 'Asha K' })
  })

  it('deletes users on user.deleted', async () => {
    await makeUser('user_d')
    const res = await POST(signed({ type: 'user.deleted', data: { id: 'user_d', deleted: true }, object: 'event' }))
    expect(res.status).toBe(200)
    expect(await getUser('user_d')).toBeNull()
  })

  it('rejects bad signatures with 400', async () => {
    const other = 'whsec_' + Buffer.from('a-different-secret-of-32-bytes!!').toString('base64')
    const res = await POST(signed({ type: 'user.created', data: clerkUser('x', 'x@example.com'), object: 'event' }, other))
    expect(res.status).toBe(400)
  })

  it('skips (200) a user.created whose email belongs to another account', async () => {
    await makeUser('user_old', { email: 'dup@example.com' })
    const evt = { type: 'user.created', data: clerkUser('user_new', 'dup@example.com'), object: 'event' }
    const res = await POST(signed(evt))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'email_in_use' })
    expect(await getUser('user_new')).toBeNull()
    expect(await getUser('user_old')).not.toBeNull()
  })

  it('ignores (200) a signed user.created with a malformed payload', async () => {
    const data = { ...clerkUser('user_bad', 'bad@example.com'), email_addresses: undefined }
    const res = await POST(signed({ type: 'user.created', data, object: 'event' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ignored: 'malformed' })
    expect(await getUser('user_bad')).toBeNull()
  })
})
