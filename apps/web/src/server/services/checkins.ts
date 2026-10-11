import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { balanceCheckins, type BalanceCheckin } from '@/server/db/schema'
import { recordAudit } from './audit'

export async function createCheckin(userId: string, amount: number, takenAt: Date = new Date()) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(balanceCheckins).values({ userId, amount, takenAt }).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'balance_checkin', entityId: row.id, action: 'create', before: null, after: row })
    return { data: row, auditId }
  })
}

export async function getLatestCheckin(userId: string): Promise<BalanceCheckin | null> {
  const [row] = await getDb().select().from(balanceCheckins)
    .where(eq(balanceCheckins.userId, userId)).orderBy(desc(balanceCheckins.takenAt)).limit(1)
  return row ?? null
}
