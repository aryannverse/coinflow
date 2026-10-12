import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { getStorage } from '@/server/storage'
import * as groupsRoute from './groups/route'
import * as groupRoute from './groups/[id]/route'
import * as expensesRoute from './groups/[id]/expenses/route'
import * as inviteRoute from './groups/[id]/invite/route'
import * as balancesRoute from './groups/[id]/balances/route'
import * as joinRoute from './join/[token]/route'
import * as txns from './transactions/route'
import * as txn from './transactions/[id]/route'
import * as files from './files/[...key]/route'

const url = (p: string) => `http://localhost/api/v1${p}`
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const params = <P>(p: P) => ({ params: Promise.resolve(p) })
const as = (userId: string) => {
  clerkState.userId = userId
  clerkState.email = `${userId}@example.com`
}

describe('/api/v1 groups', () => {
  let food: string
  beforeEach(async () => {
    await resetDb()
    for (const id of ['user_a', 'user_b', 'user_c']) await makeUser(id, { name: id })
    food = (await builtinCategory('Food & Dining')).id
    as('user_a')
  })

  async function makeGroup() {
    const res = await groupsRoute.POST(new Request(url('/groups'), json('POST', { name: 'Goa', kind: 'event', placeholders: [{ displayName: 'Asha' }] })))
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; myMemberId: string; members: { id: string; displayName: string }[] }
  }

  it('create → 404 not_member for a stranger → join over HTTP → 409 on a second join → invalid token 404', async () => {
    const g = await makeGroup()
    as('user_b')
    const hidden = await groupRoute.GET(new Request(url(`/groups/${g.id}`)), params({ id: g.id }))
    expect(hidden.status).toBe(404)
    expect((await hidden.json()).error.code).toBe('not_member')
    as('user_a')
    const { data: invite } = await (await inviteRoute.GET(new Request(url(`/groups/${g.id}/invite`)), params({ id: g.id }))).json()
    const token = String(invite.url).split('/join/')[1]
    as('user_b')
    const preview = await (await joinRoute.GET(new Request(url(`/join/${token}`)), params({ token }))).json()
    expect(preview.data.placeholders.map((p: { displayName: string }) => p.displayName)).toEqual(['Asha'])
    const asha = g.members.find((m) => m.displayName === 'Asha')!.id
    const claimed = await joinRoute.POST(new Request(url(`/join/${token}`), json('POST', { memberId: asha })), params({ token }))
    expect(claimed.status).toBe(201)
    const again = await joinRoute.POST(new Request(url(`/join/${token}`), json('POST', { newName: 'Me' })), params({ token }))
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('already_member')
    const bogus = 'x'.repeat(43)
    const bad = await joinRoute.GET(new Request(url(`/join/${bogus}`)), params({ token: bogus }))
    expect(bad.status).toBe(404)
    expect((await bad.json()).error.code).toBe('invite_invalid')
    expect((await groupRoute.GET(new Request(url(`/groups/${g.id}`)), params({ id: g.id }))).status).toBe(200)
  })

  it('split_mismatch is a 422 with the field and the remaining amount', async () => {
    const g = await makeGroup()
    const res = await expensesRoute.POST(new Request(url(`/groups/${g.id}/expenses`), json('POST', {
      description: 'Dinner', amountPaise: 90_000, categoryId: food,
      payers: [{ memberId: g.myMemberId, paidPaise: 90_000 }],
      split: { mode: 'exact', entries: [{ memberId: g.myMemberId, paise: 80_000 }] },
    })), params({ id: g.id }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatchObject({ code: 'split_mismatch', field: 'split.entries', message: '₹100 left to assign.' })
  })

  it('a mirror cannot be edited or deleted through /transactions, and shows its group', async () => {
    const g = await makeGroup()
    const created = await expensesRoute.POST(new Request(url(`/groups/${g.id}/expenses`), json('POST', {
      description: 'Dinner', amountPaise: 90_000, categoryId: food,
      payers: [{ memberId: g.myMemberId, paidPaise: 90_000 }], split: { mode: 'equal', memberIds: g.members.map((m) => m.id) },
    })), params({ id: g.id }))
    expect((await created.json()).auditId).toEqual(expect.any(String))
    const list = await (await txns.GET(new Request(url('/transactions')))).json()
    const mirror = list.data[0]
    expect(mirror).toMatchObject({ source: 'group', amount: 90_000, personalShare: 45_000, group: { id: g.id, name: 'Goa' } })
    const patch = await txn.PATCH(new Request(url(`/transactions/${mirror.id}`), json('PATCH', { amount: 1 })), params({ id: mirror.id }))
    expect(patch.status).toBe(409)
    expect((await patch.json()).error.code).toBe('mirror_readonly')
    expect((await txn.DELETE(new Request(url(`/transactions/${mirror.id}`), { method: 'DELETE' }), params({ id: mirror.id }))).status).toBe(409)
    expect((await balancesRoute.GET(new Request(url(`/groups/${g.id}/balances`)), params({ id: g.id }))).status).toBe(200)
  })

  it('co-members can read each other’s UPI QR; strangers cannot', async () => {
    const g = await makeGroup()
    await getStorage().put('qr/user_a/qr.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), 'image/png')
    await getDb().update(users).set({ upiQrUrl: '/api/v1/files/qr/user_a/qr.png' }).where(eq(users.id, 'user_a'))
    const { data: invite } = await (await inviteRoute.GET(new Request(url(`/groups/${g.id}/invite`)), params({ id: g.id }))).json()
    const token = String(invite.url).split('/join/')[1]
    as('user_b')
    await joinRoute.POST(new Request(url(`/join/${token}`), json('POST', { newName: 'B' })), params({ token }))
    const key = ['qr', 'user_a', 'qr.png']
    expect((await files.GET(new Request(url('/files/qr/user_a/qr.png')), params({ key }))).status).toBe(200)
    as('user_c')
    expect((await files.GET(new Request(url('/files/qr/user_a/qr.png')), params({ key }))).status).toBe(404)
  })
})
