import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeUser, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import * as friendsRoute from './friends/route'
import * as searchRoute from './friends/search/route'
import * as requestsRoute from './friends/requests/route'
import * as acceptRoute from './friends/requests/[id]/accept/route'
import * as unfriendRoute from './friends/[userId]/route'
import * as groupsRoute from './groups/route'
import * as friendMemberRoute from './groups/[id]/members/friends/route'
import * as linkRoute from './groups/[id]/members/[memberId]/link/route'

const url = (p: string) => `http://localhost/api/v1${p}`
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const params = <P>(p: P) => ({ params: Promise.resolve(p) })
const as = (userId: string) => {
  clerkState.userId = userId
  clerkState.email = `${userId}@example.com`
}

describe('/api/v1 friends', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a', { name: 'Yash' })
    await makeUser('user_b', { name: 'Asha' })
    as('user_a')
  })

  it('search → request → accept → add to a group → link → unfriend, over HTTP', async () => {
    const partial = await searchRoute.GET(new Request(url('/friends/search?email=user_b')))
    expect(partial.status).toBe(422)
    const miss = await (await searchRoute.GET(new Request(url('/friends/search?email=nobody%40example.com')))).json()
    expect(miss.data).toBeNull()
    const hit = await (await searchRoute.GET(new Request(url('/friends/search?email=USER_B%40example.com')))).json()
    expect(hit.data).toMatchObject({ userId: 'user_b', relation: 'none' })

    const sent = await requestsRoute.POST(new Request(url('/friends/requests'), json('POST', { email: 'user_b@example.com' })))
    expect(sent.status).toBe(201)
    const { data: req } = await sent.json()
    as('user_b')
    const accepted = await acceptRoute.POST(new Request(url(`/friends/requests/${req.requestId}/accept`), { method: 'POST' }), params({ id: req.requestId }))
    expect(accepted.status).toBe(200)
    expect((await (await friendsRoute.GET(new Request(url('/friends')))).json()).data.friends[0]).toMatchObject({ userId: 'user_a' })

    as('user_a')
    const created = await groupsRoute.POST(new Request(url('/groups'), json('POST', { name: 'Goa', placeholders: [{ displayName: 'Dev' }] })))
    const { data: g } = await created.json()
    const added = await friendMemberRoute.POST(new Request(url(`/groups/${g.id}/members/friends`), json('POST', { userId: 'user_b' })), params({ id: g.id }))
    expect(added.status).toBe(201)
    expect((await added.json()).data).toMatchObject({ displayName: 'Asha', claimed: true })
    const dev = g.members.find((m: { displayName: string }) => m.displayName === 'Dev')
    const linked = await linkRoute.POST(new Request(url(`/groups/${g.id}/members/${dev.id}/link`), json('POST', { userId: 'user_b' })), params({ id: g.id, memberId: dev.id }))
    expect(linked.status).toBe(409)
    expect((await linked.json()).error.code).toBe('already_member')

    const gone = await unfriendRoute.DELETE(new Request(url('/friends/user_b'), { method: 'DELETE' }), params({ userId: 'user_b' }))
    expect(gone.status).toBe(200)
    const again = await unfriendRoute.DELETE(new Request(url('/friends/user_b'), { method: 'DELETE' }), params({ userId: 'user_b' }))
    expect(again.status).toBe(404)
  })
})
