import { count, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/server/db/client'
import { transactions as transactionsTable } from '@/server/db/schema'
import { makeUser, resetDb } from '@test/int/helpers'
import { seedDemoData } from './demo-seed'
import { getSafeToSpend } from './safe-to-spend'

const NOW = new Date('2026-10-11T06:30:00Z')

describe('seedDemoData', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_demo')
  })

  it('creates a realistic, Safe-to-Spend-ready dataset', async () => {
    const { transactions } = await seedDemoData('user_demo', NOW)
    expect(transactions).toBeGreaterThan(40)
    expect((await getSafeToSpend('user_demo', NOW)).status).toBe('ok')
  })

  it('never logs the same spend twice on one day', async () => {
    await seedDemoData('user_demo', NOW)
    const rows = await getDb().select({ note: transactionsTable.note, occurredAt: transactionsTable.occurredAt }).from(transactionsTable)
    const keys = rows.map((r) => `${r.occurredAt.toISOString().slice(0, 10)}|${r.note}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('refuses to run twice and leaves the data untouched', async () => {
    const { transactions } = await seedDemoData('user_demo', NOW)
    await expect(seedDemoData('user_demo', NOW)).rejects.toMatchObject({ status: 409, code: 'already_seeded' })
    const [{ total }] = await getDb().select({ total: count() }).from(transactionsTable).where(isNull(transactionsTable.deletedAt))
    expect(total).toBe(transactions)
  })
})
