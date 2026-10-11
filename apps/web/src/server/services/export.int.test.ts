import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { exportTransactionsCsv } from './export'
import { createTransaction } from './transactions'

describe('exportTransactionsCsv', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
  })

  it('exports rupees with IST dates and neutralizes formula injection', async () => {
    const food = await builtinCategory('Food & Dining')
    await createTransaction('user_a', {
      type: 'expense', amount: 125_050, categoryId: food.id, method: 'card',
      occurredAt: new Date('2026-10-11T19:00:00Z'), note: '=HYPERLINK("http://x","y"), "quoted"',
    })
    const csv = await exportTransactionsCsv('user_a')
    const [header, row] = csv.trim().split('\n')
    expect(header).toBe('date,type,amount_inr,category,note,method,status,source')
    expect(row).toBe(`2026-10-12,expense,1250.50,Food & Dining,"'=HYPERLINK(""http://x"",""y""), ""quoted""",card,confirmed,manual`)
  })
})
