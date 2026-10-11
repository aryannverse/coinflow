'use client'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { QuickCommand } from '@/lib/quick-command'

export type QuickAddPrefill = Partial<QuickCommand> & { editId?: string; occurredAt?: string; method?: string }
type State = { open: boolean; prefill: QuickAddPrefill }

const Ctx = createContext<{ state: State; open: (p?: QuickAddPrefill) => void; close: () => void } | null>(null)

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ open: false, prefill: {} })
  const open = useCallback((prefill: QuickAddPrefill = {}) => setState({ open: true, prefill }), [])
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), [])
  const value = useMemo(() => ({ state, open, close }), [state, open, close])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useQuickAdd() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useQuickAdd must be used inside QuickAddProvider')
  return ctx
}
