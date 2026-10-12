'use client'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { BudgetPayloadInput, RecurringPayloadInput } from './proposal-edit-dialogs'
import { AgentPanel } from './agent-panel'
import { ProposalEditDialogs } from './proposal-edit-dialogs'
import { useAgentChat, type AgentRouteContext } from './use-agent-chat'
import { useAgentHealth, type AgentHealth } from './use-agent-health'

type Editing = { kind: 'recurring'; payload: RecurringPayloadInput } | { kind: 'budget'; payload: BudgetPayloadInput } | null
type AgentCtx = {
  isOpen: boolean
  open: (prefill?: string) => void
  close: () => void
  draft: string
  setDraft: (s: string) => void
  health: AgentHealth | undefined
  chat: ReturnType<typeof useAgentChat>
  context: AgentRouteContext
  editing: Editing
  setEditing: (e: Editing) => void
}
const Ctx = createContext<AgentCtx | null>(null)
const GROUP_PATH = /^\/groups\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/** Spec §4.3 context: every message carries {route, groupId?}, so on a group page people default to that group. */
export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const pathname = usePathname()
  const groupId = GROUP_PATH.exec(pathname)?.[1]
  const context = useMemo<AgentRouteContext>(() => ({ route: pathname, ...(groupId ? { groupId } : {}) }), [pathname, groupId])
  const chat = useAgentChat()
  const health = useAgentHealth().data
  const open = useCallback((prefill?: string) => {
    if (prefill !== undefined) setDraft(prefill)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])
  const value = useMemo(
    () => ({ isOpen, open, close, draft, setDraft, health, chat, context, editing, setEditing }),
    [isOpen, open, close, draft, health, chat, context, editing],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      <AgentPanel />
      <ProposalEditDialogs />
    </Ctx.Provider>
  )
}

export function useAgent(): AgentCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAgent must be used inside AgentProvider')
  return ctx
}
