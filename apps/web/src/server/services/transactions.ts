import 'server-only'
import { and, desc, eq, getTableColumns, gte, ilike, isNull, lt, or, sql } from 'drizzle-orm'
import { addDays, istStartOfDay } from '@/lib/dates'
import { uuid } from '@/lib/schemas/common'
import type { TransactionCreate, TransactionListQuery, TransactionPatch } from '@/lib/schemas/transactions'
import { getDb, type Tx } from '@/server/db/client'
import { categories, transactions, type Transaction } from '@/server/db/schema'
import { invalid, notFound } from '@/server/errors'
import { recordAudit } from './audit'
import { requireUsableCategory } from './categories'

export type TransactionWithCategory = Transaction & {
  category: { id: string; name: string; emoji: string; color: string }
}

async function findOwned(executor: Tx, userId: string, id: string, status?: 'draft' | 'confirmed'): Promise<Transaction> {
  const [row] = await executor
    .select()
    .from(transactions)
    .where(and(
      eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt),
      status ? eq(transactions.status, status) : undefined,
    ))
    .for('update')
  if (!row) throw notFound('transaction')
  return row
}

export async function createTransaction(
  userId: string,
  input: TransactionCreate,
  opts: {
    source?: Transaction['source']; status?: Transaction['status']; recurringItemId?: string | null
    actor?: 'user' | 'agent'; tx?: Tx; audit?: boolean
  } = {},
): Promise<{ data: Transaction; auditId: string | null }> {
  const run = async (tx: Tx) => {
    await requireUsableCategory(userId, input.categoryId, input.type, tx)
    const [row] = await tx
      .insert(transactions)
      .values({
        userId,
        type: input.type,
        amount: input.amount,
        personalShare: input.amount,
        categoryId: input.categoryId,
        note: input.note ?? null,
        method: input.method,
        occurredAt: input.occurredAt,
        source: opts.source ?? 'manual',
        status: opts.status ?? 'confirmed',
        recurringItemId: opts.recurringItemId ?? null,
      })
      .returning()
    const auditId = opts.audit === false
      ? null
      : await recordAudit(tx, { userId, entity: 'transaction', entityId: row.id, action: 'create', before: null, after: row, actor: opts.actor })
    return { data: row, auditId }
  }
  return opts.tx ? run(opts.tx) : getDb().transaction(run)
}

export async function updateTransaction(
  userId: string, id: string, patch: TransactionPatch,
): Promise<{ data: Transaction; auditId: string | null }> {
  return getDb().transaction(async (tx) => {
    const before = await findOwned(tx, userId, id)
    if (Object.values(patch).every((v) => v === undefined)) return { data: before, auditId: null }
    const type = patch.type ?? before.type
    if (patch.categoryId !== undefined || patch.type !== undefined) {
      await requireUsableCategory(userId, patch.categoryId ?? before.categoryId, type, tx)
    }
    const amount = patch.amount ?? before.amount
    const [after] = await tx
      .update(transactions)
      .set({ ...patch, note: patch.note === undefined ? before.note : (patch.note ?? null), amount, personalShare: amount })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning()
    const auditId = await recordAudit(tx, { userId, entity: 'transaction', entityId: id, action: 'update', before, after })
    return { data: after, auditId }
  })
}

async function softDelete(userId: string, id: string, status?: 'draft'): Promise<{ auditId: string }> {
  return getDb().transaction(async (tx) => {
    const before = await findOwned(tx, userId, id, status)
    const [after] = await tx.update(transactions).set({ deletedAt: new Date() }).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'transaction', entityId: id, action: 'delete', before, after })
    return { auditId }
  })
}

export const deleteTransaction = (userId: string, id: string) => softDelete(userId, id)
export const skipDraft = (userId: string, id: string) => softDelete(userId, id, 'draft')

export async function confirmDraft(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const before = await findOwned(tx, userId, id, 'draft')
    const [after] = await tx.update(transactions).set({ status: 'confirmed' }).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'transaction', entityId: id, action: 'confirm', before, after })
    return { data: after, auditId }
  })
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    const at = new Date(iso)
    return Number.isNaN(at.getTime()) || !uuid.safeParse(id).success ? null : { at, id }
  } catch {
    return null
  }
}

const encodeCursor = (t: Transaction) => Buffer.from(`${t.occurredAt.toISOString()}|${t.id}`).toString('base64url')

export async function listTransactions(
  userId: string, query: TransactionListQuery,
): Promise<{ data: TransactionWithCategory[]; nextCursor: string | null }> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  if (query.cursor && !cursor) throw invalid('cursor', 'That page link has expired — refresh the list.')
  const like = query.q ? `%${escapeLike(query.q)}%` : null
  const rows = await getDb()
    .select({
      ...getTableColumns(transactions),
      category: { id: categories.id, name: categories.name, emoji: categories.emoji, color: categories.color },
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.status, query.status),
      query.type ? eq(transactions.type, query.type) : undefined,
      query.categoryId ? eq(transactions.categoryId, query.categoryId) : undefined,
      query.method ? eq(transactions.method, query.method) : undefined,
      query.from ? gte(transactions.occurredAt, istStartOfDay(query.from)) : undefined,
      query.to ? lt(transactions.occurredAt, istStartOfDay(addDays(query.to, 1))) : undefined,
      like ? or(ilike(transactions.note, like), ilike(categories.name, like)) : undefined,
      cursor ? sql`(${transactions.occurredAt}, ${transactions.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined,
    ))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(query.limit + 1)

  const hasMore = rows.length > query.limit
  const data = rows.slice(0, query.limit)
  return { data, nextCursor: hasMore ? encodeCursor(data[data.length - 1]) : null }
}
