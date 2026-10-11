import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinCategory, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import { toISTDate } from '@/lib/dates'
import { createTransaction } from '@/server/services/transactions'

import * as me from './me/route'
import * as upiQr from './me/upi-qr/route'
import * as files from './files/[...key]/route'
import * as txns from './transactions/route'
import * as txn from './transactions/[id]/route'
import * as checkins from './checkins/route'
import * as sts from './summary/safe-to-spend/route'
import * as undoRoute from './undo/[auditId]/route'
import * as exportCsv from './export.csv/route'
import * as categories from './categories/route'
import * as confirm from './transactions/[id]/confirm/route'
import * as skip from './transactions/[id]/skip/route'
import * as recurring from './recurring/route'
import * as recurringItem from './recurring/[id]/route'
import * as latestCheckin from './checkins/latest/route'
import * as budgets from './budgets/route'
import * as budget from './budgets/[categoryId]/route'
import * as insights from './insights/route'

const url = (p: string) => `http://localhost/api/v1${p}`
const json = (method: string, body: unknown) =>
  ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const params = <P>(p: P) => ({ params: Promise.resolve(p) })
// Each test user needs a distinct email, or lazy user creation hits the unique-email constraint.
const as = (userId: string | null) => {
  clerkState.userId = userId
  if (userId) clerkState.email = `${userId}@example.com`
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

describe('/api/v1', () => {
  let foodId: string
  let uploadsDir: string
  let previousUploadsDir: string | undefined

  beforeAll(async () => {
    previousUploadsDir = process.env.UPLOADS_DIR
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'coinflow-uploads-'))
    process.env.UPLOADS_DIR = uploadsDir
  })

  afterAll(async () => {
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR
    else process.env.UPLOADS_DIR = previousUploadsDir
    await rm(uploadsDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await resetDb()
    foodId = (await builtinCategory('Food & Dining')).id
    as('user_a')
  })

  it('401s when signed out, with the standard error shape', async () => {
    as(null)
    const res = await me.GET(new Request(url('/me')))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' }, requestId: expect.any(String) })
  })

  it('GET /me lazily creates the user; PATCH validates', async () => {
    const res = await me.GET(new Request(url('/me')))
    expect((await res.json()).data).toMatchObject({ id: 'user_a', paydayDay: 1 })
    const bad = await me.PATCH(new Request(url('/me'), json('PATCH', { paydayDay: 40 })))
    expect(bad.status).toBe(422)
    expect((await bad.json()).error.field).toBe('paydayDay')
  })

  it('create → list → delete → undo round-trip', async () => {
    await me.GET(new Request(url('/me')))
    const created = await txns.POST(new Request(url('/transactions'), json('POST', { type: 'expense', amount: 45000, categoryId: foodId })))
    expect(created.status).toBe(201)
    const { data, auditId } = await created.json()
    expect(auditId).toEqual(expect.any(String))

    const del = await txn.DELETE(new Request(url(`/transactions/${data.id}`), { method: 'DELETE' }), params({ id: data.id }))
    const { auditId: delAudit } = await del.json()
    expect((await (await txns.GET(new Request(url('/transactions')))).json()).data).toHaveLength(0)

    const un = await undoRoute.POST(new Request(url(`/undo/${delAudit}`), { method: 'POST' }), params({ auditId: delAudit }))
    expect(un.status).toBe(200)
    expect((await (await txns.GET(new Request(url('/transactions')))).json()).data).toHaveLength(1)
  })

  it('user B gets 404 for user A’s transaction and audit ids', async () => {
    await me.GET(new Request(url('/me')))
    const { data, auditId } = await (await txns.POST(new Request(url('/transactions'), json('POST', { type: 'expense', amount: 1000, categoryId: foodId })))).json()
    as('user_b')
    await me.GET(new Request(url('/me')))
    const patch = await txn.PATCH(new Request(url(`/transactions/${data.id}`), json('PATCH', { amount: 1 })), params({ id: data.id }))
    expect(patch.status).toBe(404)
    const un = await undoRoute.POST(new Request(url(`/undo/${auditId}`), { method: 'POST' }), params({ auditId }))
    expect(un.status).toBe(404)
  })

  it('safe-to-spend goes from unknown to ok after a check-in', async () => {
    await me.GET(new Request(url('/me')))
    expect((await (await sts.GET(new Request(url('/summary/safe-to-spend')))).json()).data.status).toBe('unknown')
    expect((await checkins.POST(new Request(url('/checkins'), json('POST', { amount: 5_000_000 })))).status).toBe(201)
    expect((await (await sts.GET(new Request(url('/summary/safe-to-spend')))).json()).data.status).toBe('ok')
  })

  it('UPI QR: accepts PNG, rejects non-images, serves only to its owner', async () => {
    await me.GET(new Request(url('/me')))
    const form = new FormData()
    form.set('file', new File([PNG], 'qr.png', { type: 'image/png' }))
    const up = await upiQr.POST(new Request(url('/me/upi-qr'), { method: 'POST', body: form }))
    expect(up.status).toBe(201)
    const { data } = await up.json()
    const key = (data.upiQrUrl as string).replace('/api/v1/files/', '')

    const own = await files.GET(new Request(url(`/files/${key}`)), params({ key: key.split('/') }))
    expect(own.status).toBe(200)
    expect(own.headers.get('content-type')).toBe('image/png')

    const svgForm = new FormData()
    svgForm.set('file', new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.png', { type: 'image/png' }))
    expect((await upiQr.POST(new Request(url('/me/upi-qr'), { method: 'POST', body: svgForm }))).status).toBe(422)

    as('user_b')
    await me.GET(new Request(url('/me')))
    expect((await files.GET(new Request(url(`/files/${key}`)), params({ key: key.split('/') }))).status).toBe(404)
  })

  it('export.csv returns a CSV attachment', async () => {
    await me.GET(new Request(url('/me')))
    const res = await exportCsv.GET(new Request(url('/export.csv')))
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('coinflow-transactions.csv')
  })

  it('rejects a malformed JSON body with 400 and a malformed id with 422', async () => {
    await me.GET(new Request(url('/me')))
    const badJson = await txns.POST(new Request(url('/transactions'), { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } }))
    expect(badJson.status).toBe(400)
    expect((await badJson.json()).error.code).toBe('invalid_json')
    const badId = await txn.DELETE(new Request(url('/transactions/not-a-uuid'), { method: 'DELETE' }), params({ id: 'not-a-uuid' }))
    expect(badId.status).toBe(422)
  })

  it('passes a null auditId through for a no-op edit', async () => {
    await me.GET(new Request(url('/me')))
    const { data } = await (await txns.POST(new Request(url('/transactions'), json('POST', { type: 'expense', amount: 1000, categoryId: foodId })))).json()
    const res = await txn.PATCH(new Request(url(`/transactions/${data.id}`), json('PATCH', {})), params({ id: data.id }))
    expect(res.status).toBe(200)
    expect((await res.json()).auditId).toBeNull()
  })

  it('categories: lists built-ins, creates a custom one with 201', async () => {
    await me.GET(new Request(url('/me')))
    const list = await (await categories.GET(new Request(url('/categories?kind=income')))).json()
    expect(list.data.length).toBeGreaterThan(0)
    expect(list.data.every((c: { kind: string }) => c.kind === 'income')).toBe(true)
    const created = await categories.POST(new Request(url('/categories'), json('POST', { name: 'Pets', kind: 'expense', emoji: '🐶', color: '#aabbcc' })))
    expect(created.status).toBe(201)
    expect((await categories.GET(new Request(url('/categories?kind=bogus')))).status).toBe(422)
  })

  it('drafts: confirm and skip work on drafts only, and only for the owner', async () => {
    await me.GET(new Request(url('/me')))
    const mk = async () => (await createTransaction('user_a', { type: 'expense', amount: 2000, categoryId: foodId, method: 'upi', occurredAt: new Date() }, { status: 'draft' })).data.id
    const [d1, d2] = [await mk(), await mk()]

    as('user_b')
    await me.GET(new Request(url('/me')))
    expect((await confirm.POST(new Request(url(`/transactions/${d1}/confirm`), { method: 'POST' }), params({ id: d1 }))).status).toBe(404)
    as('user_a')

    const ok = await confirm.POST(new Request(url(`/transactions/${d1}/confirm`), { method: 'POST' }), params({ id: d1 }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.status).toBe('confirmed')
    // a confirmed transaction is no longer a draft
    expect((await skip.POST(new Request(url(`/transactions/${d1}/skip`), { method: 'POST' }), params({ id: d1 }))).status).toBe(404)
    const skipped = await skip.POST(new Request(url(`/transactions/${d2}/skip`), { method: 'POST' }), params({ id: d2 }))
    expect(skipped.status).toBe(200)
    expect((await skipped.json()).auditId).toEqual(expect.any(String))
  })

  it('GET /transactions?status=draft materializes due recurring items first', async () => {
    await me.GET(new Request(url('/me')))
    const today = toISTDate(new Date())
    await recurring.POST(new Request(url('/recurring'), json('POST', {
      kind: 'bill', name: 'Wi-Fi', amount: 79_900, categoryId: foodId, cadence: 'monthly', nextDueOn: today,
    })))
    const res = await txns.GET(new Request(url('/transactions?status=draft')))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ note: 'Wi-Fi', amount: 79_900, status: 'draft', source: 'recurring' })
  })

  it('recurring: create 201, list, patch, delete; other users get 404', async () => {
    await me.GET(new Request(url('/me')))
    const created = await recurring.POST(new Request(url('/recurring'), json('POST', {
      kind: 'bill', name: 'Rent', amount: 1_200_000, categoryId: foodId, cadence: 'monthly', nextDueOn: '2030-01-05',
    })))
    expect(created.status).toBe(201)
    const { data, auditId } = await created.json()
    expect(auditId).toEqual(expect.any(String))
    expect((await (await recurring.GET(new Request(url('/recurring')))).json()).data).toHaveLength(1)

    const noop = await recurringItem.PATCH(new Request(url(`/recurring/${data.id}`), json('PATCH', {})), params({ id: data.id }))
    expect((await noop.json()).auditId).toBeNull()
    const patched = await recurringItem.PATCH(new Request(url(`/recurring/${data.id}`), json('PATCH', { active: false })), params({ id: data.id }))
    expect((await patched.json()).data.active).toBe(false)

    as('user_b')
    await me.GET(new Request(url('/me')))
    expect((await recurringItem.DELETE(new Request(url(`/recurring/${data.id}`), { method: 'DELETE' }), params({ id: data.id }))).status).toBe(404)
    as('user_a')
    expect((await recurringItem.DELETE(new Request(url(`/recurring/${data.id}`), { method: 'DELETE' }), params({ id: data.id }))).status).toBe(200)
  })

  it('checkins/latest is null, then the newest check-in', async () => {
    await me.GET(new Request(url('/me')))
    expect((await (await latestCheckin.GET(new Request(url('/checkins/latest')))).json()).data).toBeNull()
    await checkins.POST(new Request(url('/checkins'), json('POST', { amount: 123_00 })))
    expect((await (await latestCheckin.GET(new Request(url('/checkins/latest')))).json()).data.amount).toBe(12_300)
  })

  it('budgets: put, list, delete', async () => {
    await me.GET(new Request(url('/me')))
    const put = await budget.PUT(new Request(url(`/budgets/${foodId}`), json('PUT', { monthlyLimit: 500_000 })), params({ categoryId: foodId }))
    expect(put.status).toBe(200)
    expect((await put.json()).auditId).toEqual(expect.any(String))
    expect((await (await budgets.GET(new Request(url('/budgets')))).json()).data).toHaveLength(1)
    const del = await budget.DELETE(new Request(url(`/budgets/${foodId}`), { method: 'DELETE' }), params({ categoryId: foodId }))
    expect(del.status).toBe(200)
    expect((await budget.DELETE(new Request(url(`/budgets/${foodId}`), { method: 'DELETE' }), params({ categoryId: foodId }))).status).toBe(404)
  })

  it('insights validates the date range', async () => {
    await me.GET(new Request(url('/me')))
    expect((await insights.GET(new Request(url('/insights?from=2026-10-01&to=2026-10-31')))).status).toBe(200)
    const reversed = await insights.GET(new Request(url('/insights?from=2026-10-31&to=2026-10-01')))
    expect(reversed.status).toBe(422)
    expect((await reversed.json()).error.field).toBe('to')
    expect((await insights.GET(new Request(url('/insights?from=2020-01-01&to=2026-10-01')))).status).toBe(422)
    expect((await insights.GET(new Request(url('/insights')))).status).toBe(422)
  })

  it('files: refuses another user’s prefix, traversal and unknown keys', async () => {
    await me.GET(new Request(url('/me')))
    const other = await files.GET(new Request(url('/files/qr/user_b/x.png')), params({ key: ['qr', 'user_b', 'x.png'] }))
    expect(other.status).toBe(404)
    const traversal = await files.GET(new Request(url('/files/x')), params({ key: ['qr', 'user_a', '..', '..', 'secret'] }))
    expect(traversal.status).toBe(400)
    const missing = await files.GET(new Request(url('/files/x')), params({ key: ['qr', 'user_a', 'nope.png'] }))
    expect(missing.status).toBe(404)
  })

  it('UPI QR: replacing removes the old file; DELETE clears the url; oversize is 422', async () => {
    await me.GET(new Request(url('/me')))
    const send = async (bytes: Uint8Array) => {
      const form = new FormData()
      form.set('file', new File([bytes as BlobPart], 'qr.png', { type: 'image/png' }))
      return upiQr.POST(new Request(url('/me/upi-qr'), { method: 'POST', body: form }))
    }
    const first = (await (await send(PNG)).json()).data.upiQrUrl as string
    const second = (await (await send(PNG)).json()).data.upiQrUrl as string
    expect(second).not.toBe(first)
    const newKey = second.replace('/api/v1/files/', '')
    expect((await files.GET(new Request(url(`/files/${newKey}`)), params({ key: newKey.split('/') }))).status).toBe(200)
    const oldKey = first.replace('/api/v1/files/', '')
    expect((await files.GET(new Request(url(`/files/${oldKey}`)), params({ key: oldKey.split('/') }))).status).toBe(404)

    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    big.set(PNG)
    expect((await send(big)).status).toBe(422)

    // a declared body length far over the cap is rejected before the body is buffered
    const form = new FormData()
    form.set('file', new File([PNG as BlobPart], 'qr.png', { type: 'image/png' }))
    const declared = await upiQr.POST(new Request(url('/me/upi-qr'), { method: 'POST', body: form, headers: { 'content-length': String(10 * 1024 * 1024) } }))
    expect(declared.status).toBe(422)
    expect((await declared.json()).error.message).toContain('2 MB')

    const cleared = await upiQr.DELETE(new Request(url('/me/upi-qr'), { method: 'DELETE' }))
    expect((await cleared.json()).data.upiQrUrl).toBeNull()
    const newest = second.replace('/api/v1/files/', '')
    expect((await files.GET(new Request(url(`/files/${newest}`)), params({ key: newest.split('/') }))).status).toBe(404)
  })

  it('user B cannot delete, skip, patch or budget against user A’s records', async () => {
    await me.GET(new Request(url('/me')))
    const { data: txnA } = await (await txns.POST(new Request(url('/transactions'), json('POST', { type: 'expense', amount: 1000, categoryId: foodId })))).json()
    const draftId = (await createTransaction('user_a', { type: 'expense', amount: 2000, categoryId: foodId, method: 'upi', occurredAt: new Date() }, { status: 'draft' })).data.id
    const { data: recA } = await (await recurring.POST(new Request(url('/recurring'), json('POST', {
      kind: 'bill', name: 'Rent', amount: 1_200_000, categoryId: foodId, cadence: 'monthly', nextDueOn: '2030-01-05',
    })))).json()
    const { data: custom } = await (await categories.POST(new Request(url('/categories'), json('POST', { name: 'Pets', kind: 'expense', emoji: '🐶', color: '#aabbcc' })))).json()
    await budget.PUT(new Request(url(`/budgets/${custom.id}`), json('PUT', { monthlyLimit: 300_000 })), params({ categoryId: custom.id }))

    as('user_b')
    await me.GET(new Request(url('/me')))
    expect((await txn.DELETE(new Request(url(`/transactions/${txnA.id}`), { method: 'DELETE' }), params({ id: txnA.id }))).status).toBe(404)
    expect((await skip.POST(new Request(url(`/transactions/${draftId}/skip`), { method: 'POST' }), params({ id: draftId }))).status).toBe(404)
    expect((await recurringItem.PATCH(new Request(url(`/recurring/${recA.id}`), json('PATCH', { name: 'Hacked' })), params({ id: recA.id }))).status).toBe(404)
    const put = await budget.PUT(new Request(url(`/budgets/${custom.id}`), json('PUT', { monthlyLimit: 1 })), params({ categoryId: custom.id }))
    expect(put.status).toBe(422)
    expect((await put.json()).error.field).toBe('categoryId')
    expect((await budget.DELETE(new Request(url(`/budgets/${custom.id}`), { method: 'DELETE' }), params({ categoryId: custom.id }))).status).toBe(404)

    as('user_a')
    expect((await (await txns.GET(new Request(url('/transactions')))).json()).data).toHaveLength(1)
    expect((await (await recurring.GET(new Request(url('/recurring')))).json()).data[0].name).toBe('Rent')
    const mine = (await (await budgets.GET(new Request(url('/budgets')))).json()).data
    expect(mine).toHaveLength(1)
    expect(mine[0].monthlyLimit).toBe(300_000)
    const drafts = await (await txns.GET(new Request(url('/transactions?status=draft')))).json()
    expect(drafts.data).toHaveLength(1)
  })

  it('sets no-store and x-request-id on JSON, error and CSV responses', async () => {
    const signedOut = (as(null), await me.GET(new Request(url('/me'))))
    expect(signedOut.headers.get('cache-control')).toBe('no-store')
    expect(signedOut.headers.get('x-request-id')).toEqual(expect.any(String))
    as('user_a')
    const ok = await me.GET(new Request(url('/me')))
    expect(ok.headers.get('cache-control')).toBe('no-store')
    const csv = await exportCsv.GET(new Request(url('/export.csv')))
    expect(csv.headers.get('cache-control')).toBe('no-store')
    expect(csv.headers.get('x-request-id')).toEqual(expect.any(String))
  })
})
