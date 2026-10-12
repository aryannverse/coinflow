import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { formatINR } from '@/lib/money'
import type { SettlementCreate } from '@/lib/schemas/groups'
import { getDb } from '@/server/db/client'
import { settlements, type Settlement } from '@/server/db/schema'
import { AppError, conflict, invalid, notFound } from '@/server/errors'
import { recordAudit } from '../audit'
import { markSettlementActed, notify } from '../notifications'
import { recordActivity } from './activity'
import { syncSettlementMirrors } from './mirrors'
import { requireMember } from './permissions'
import { byMemberId, listMemberRows } from './rows'

/**
 * Spec §3.5 settle up. You mark payments YOU made: pending until the payee confirms. The one exception (plan A7):
 * the payee may record cash received from an unclaimed placeholder, confirmed at once, because they ARE the confirmer.
 */
export async function markSettlement(userId: string, groupId: string, body: SettlementCreate): Promise<{ data: Settlement; auditId: string | null }> {
  return getDb().transaction(async (tx) => {
    const { group, me } = await requireMember(userId, groupId, tx, { lock: true })
    const members = byMemberId(await listMemberRows(tx, groupId))
    const from = members.get(body.fromMemberId)
    const to = members.get(body.toMemberId)
    if (!from || from.removedAt) throw invalid('fromMemberId', 'That person isn’t in this group.')
    if (!to || to.removedAt) throw invalid('toMemberId', 'That person isn’t in this group.')
    if (from.id === to.id) throw invalid('toMemberId', 'Pick someone other than the payer.')
    const recordingReceipt = to.id === me.id && from.userId === null
    if (from.id !== me.id && !recordingReceipt) {
      throw invalid('fromMemberId', 'You can mark payments you made, or record one you received from someone who hasn’t joined yet.')
    }
    const now = new Date()
    const [row] = await tx.insert(settlements).values({
      groupId, fromMember: from.id, toMember: to.id, amountPaise: body.amountPaise, note: body.note ?? null,
      status: recordingReceipt ? 'confirmed' : 'pending', markedAt: now, markedBy: userId,
      resolvedAt: recordingReceipt ? now : null, resolvedBy: recordingReceipt ? userId : null,
    }).returning()
    const amount = formatINR(body.amountPaise)
    if (recordingReceipt) {
      await syncSettlementMirrors(tx, row.id, now)
      await recordActivity(tx, { groupId, actorUserId: userId, kind: 'settlement_recorded', summary: `${me.displayName} recorded ${amount} from ${from.displayName}`, payload: { settlementId: row.id } })
      return { data: row, auditId: null }
    }
    await recordActivity(tx, { groupId, actorUserId: userId, kind: 'settlement_marked', summary: `${me.displayName} marked ${amount} paid to ${to.displayName}`, payload: { settlementId: row.id } })
    if (to.userId) {
      await notify(tx, [{
        userId: to.userId, kind: 'settlement_marked', title: `${me.displayName} says they paid you ${amount}`,
        body: `${group.name} · Did it arrive?`, href: `/groups/${groupId}?tab=balances`,
        payload: { settlementId: row.id, groupId, amountPaise: body.amountPaise },
      }])
    }
    const auditId = await recordAudit(tx, { userId, entity: 'settlement', entityId: row.id, action: 'create', before: null, after: row })
    return { data: row, auditId }
  })
}

/** Payee only; pending only (spec §3.5). Confirm and reject are final: no audit, no undo (spec §3.6). */
export async function resolveSettlement(userId: string, settlementId: string, decision: 'confirmed' | 'rejected'): Promise<{ data: Settlement; auditId: null }> {
  return getDb().transaction(async (tx) => {
    const [s] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).for('update')
    if (!s) throw notFound('payment')
    const { group, me } = await requireMember(userId, s.groupId, tx, { write: true })
    if (s.toMember !== me.id) throw new AppError('not_payee', 'Only the person who was paid can confirm this.', 403)
    if (s.status !== 'pending') {
      throw conflict('settlement_state', s.status === 'confirmed' ? 'This payment is already confirmed.' : 'This payment was already marked as not received.')
    }
    const now = new Date()
    const [row] = await tx.update(settlements).set({ status: decision, resolvedAt: now, resolvedBy: userId }).where(eq(settlements.id, s.id)).returning()
    if (decision === 'confirmed') await syncSettlementMirrors(tx, s.id, now)
    await markSettlementActed(tx, s.id, now)
    const members = byMemberId(await listMemberRows(tx, s.groupId))
    const payer = members.get(s.fromMember)
    const amount = formatINR(s.amountPaise)
    await recordActivity(tx, {
      groupId: s.groupId, actorUserId: userId, kind: decision === 'confirmed' ? 'settlement_confirmed' : 'settlement_rejected',
      summary: decision === 'confirmed'
        ? `${me.displayName} confirmed ${amount} from ${payer?.displayName ?? 'someone'}`
        : `${me.displayName} hasn’t received ${amount} from ${payer?.displayName ?? 'someone'} yet`,
      payload: { settlementId: s.id },
    })
    if (payer?.userId) {
      await notify(tx, [decision === 'confirmed'
        ? { userId: payer.userId, kind: 'settlement_confirmed', title: `${me.displayName} confirmed your ${amount}`, body: group.name, href: `/groups/${s.groupId}?tab=balances`, payload: { settlementId: s.id, groupId: s.groupId } }
        : { userId: payer.userId, kind: 'settlement_rejected', title: `${me.displayName} hasn’t received your ${amount} yet`, body: `${group.name} · Check your UPI app, then try again.`, href: `/groups/${s.groupId}?tab=balances`, payload: { settlementId: s.id, groupId: s.groupId, toMemberId: s.toMember, amountPaise: s.amountPaise } },
      ])
    }
    return { data: row, auditId: null }
  })
}

export async function listSettlements(userId: string, groupId: string): Promise<Settlement[]> {
  await requireMember(userId, groupId)
  return getDb().select().from(settlements).where(eq(settlements.groupId, groupId)).orderBy(desc(settlements.markedAt))
}
