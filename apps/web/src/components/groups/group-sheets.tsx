'use client'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ExpenseDraft } from '@/lib/expense-form'
import type { GroupCreateBody } from '@/lib/schemas/groups'
import { ExpenseSheet } from './expense-sheet'
import { NewGroupSheet } from './new-group-sheet'
import { ReminderSheet } from './reminder-sheet'
import { SettleSheet } from './settle-sheet'

export type ExpenseOpen = { groupId: string; expenseId?: string; prefill?: Partial<ExpenseDraft>; notice?: string }
export type SettleOpen = { groupId: string; toMemberId: string; amountPaise: number }
export type ReminderOpen = { groupId: string; fromMemberId: string; amountPaise: number }
export type NewGroupOpen = { prefill?: GroupCreateBody }
type Slot<T> = { open: boolean; n: number; data: T | null }
const closed = <T,>(): Slot<T> => ({ open: false, n: 0, data: null })

type Api = {
  openExpense: (o: ExpenseOpen) => void
  openSettle: (o: SettleOpen) => void
  openReminder: (o: ReminderOpen) => void
  openNewGroup: (o?: NewGroupOpen) => void
}
const Ctx = createContext<Api | null>(null)

export function GroupSheetsProvider({ children }: { children: React.ReactNode }) {
  const [expense, setExpense] = useState<Slot<ExpenseOpen>>(closed)
  const [settle, setSettle] = useState<Slot<SettleOpen>>(closed)
  const [reminder, setReminder] = useState<Slot<ReminderOpen>>(closed)
  const [newGroup, setNewGroup] = useState<Slot<NewGroupOpen>>(closed)
  // `n` grows on every open so each form remounts fresh (same trick as quick add's openCount).
  const openExpense = useCallback((data: ExpenseOpen) => setExpense((s) => ({ open: true, n: s.n + 1, data })), [])
  const openSettle = useCallback((data: SettleOpen) => setSettle((s) => ({ open: true, n: s.n + 1, data })), [])
  const openReminder = useCallback((data: ReminderOpen) => setReminder((s) => ({ open: true, n: s.n + 1, data })), [])
  const openNewGroup = useCallback((data: NewGroupOpen = {}) => setNewGroup((s) => ({ open: true, n: s.n + 1, data })), [])
  const api = useMemo(() => ({ openExpense, openSettle, openReminder, openNewGroup }), [openExpense, openSettle, openReminder, openNewGroup])
  const shut = <T,>(set: React.Dispatch<React.SetStateAction<Slot<T>>>) => () => set((s) => ({ ...s, open: false }))

  return (
    <Ctx.Provider value={api}>
      {children}
      {expense.data && <ExpenseSheet open={expense.open} openCount={expense.n} {...expense.data} onClose={shut(setExpense)} />}
      {settle.data && <SettleSheet open={settle.open} openCount={settle.n} {...settle.data} onClose={shut(setSettle)} />}
      {reminder.data && <ReminderSheet open={reminder.open} openCount={reminder.n} {...reminder.data} onClose={shut(setReminder)} />}
      {newGroup.data && <NewGroupSheet open={newGroup.open} openCount={newGroup.n} prefill={newGroup.data.prefill} onClose={shut(setNewGroup)} />}
    </Ctx.Provider>
  )
}

export function useGroupSheets(): Api {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGroupSheets must be used inside GroupSheetsProvider')
  return ctx
}
