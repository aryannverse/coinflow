import type { PlanProgress } from './proposal-apply'
import type { ProposalInput } from './schemas/proposals'
import type { SSEEvent } from './sse'

export type Source = 'chat' | 'voice' | 'scan'
/** `editing`: Edit opened the matching sheet; the chip no longer offers Approve, so nothing is saved twice. */
export type ProposalState = 'pending' | 'saving' | 'approved' | 'dismissed' | 'failed' | 'editing'
export type ChatItem =
  | { id: string; role: 'user'; text: string; source: Source }
  | { id: string; role: 'assistant'; text: string; done: boolean }
  | { id: string; role: 'proposal'; proposal: ProposalInput; state: ProposalState; error?: string; progress?: PlanProgress }
  | { id: string; role: 'error'; code: string; message: string; retry: { text: string; source: Source } | null }
export type ChatStatus = 'idle' | 'listening' | 'transcribing' | 'reading' | 'thinking'
export type ChatState = {
  items: ChatItem[]; status: ChatStatus; toolLabel: string | null; threadId: string; lastUser: { text: string; source: Source } | null
}
export type ChatAction =
  | { type: 'send'; id: string; text: string; source: Source }
  | { type: 'event'; id: string; event: SSEEvent }
  | { type: 'status'; status: ChatStatus }
  | { type: 'proposal'; id: string; state: ProposalState; error?: string; progress?: PlanProgress }
  | { type: 'fail'; id: string; code: string; message: string }
  | { type: 'reset'; threadId: string }

/** Spec §4.7: status is live-region TEXT, not only an animation. */
export const STATUS_TEXT: Record<ChatStatus, string> = {
  idle: '', listening: 'Listening…', transcribing: 'Transcribing…', reading: 'Reading the receipt…', thinking: 'Thinking…',
}

export const initialChat = (threadId: string): ChatState => ({ items: [], status: 'idle', toolLabel: null, threadId, lastUser: null })

function parse(data: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(data)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'send':
      return { ...s, status: 'thinking', toolLabel: null, lastUser: { text: a.text, source: a.source }, items: [...s.items, { id: a.id, role: 'user', text: a.text, source: a.source }] }
    case 'status':
      return { ...s, status: a.status, toolLabel: a.status === 'thinking' ? s.toolLabel : null }
    case 'proposal':
      return {
        ...s,
        items: s.items.map((it) => (it.id === a.id && it.role === 'proposal' ? { ...it, state: a.state, error: a.error, progress: a.progress ?? it.progress } : it)),
      }
    case 'fail':
      return { ...s, status: 'idle', toolLabel: null, items: [...s.items, { id: a.id, role: 'error', code: a.code, message: a.message, retry: s.lastUser }] }
    case 'reset':
      return initialChat(a.threadId)
    case 'event': {
      const d = parse(a.event.data)
      switch (a.event.event) {
        case 'status':
          return { ...s, status: 'thinking', toolLabel: typeof d?.label === 'string' ? d.label : null }
        case 'token': {
          const text = typeof d?.text === 'string' ? d.text : ''
          const last = s.items[s.items.length - 1]
          if (last?.role === 'assistant' && !last.done) return { ...s, items: [...s.items.slice(0, -1), { ...last, text: last.text + text }] }
          return { ...s, items: [...s.items, { id: a.id, role: 'assistant', text, done: false }] }
        }
        case 'proposal':
          return d ? { ...s, items: [...s.items, { id: typeof d.id === 'string' ? d.id : a.id, role: 'proposal', proposal: d as unknown as ProposalInput, state: 'pending' }] } : s
        case 'error':
          return {
            ...s,
            items: [...s.items, {
              id: a.id, role: 'error', code: typeof d?.code === 'string' ? d.code : 'agent_error',
              message: typeof d?.message === 'string' ? d.message : 'Something went wrong. Please try again.', retry: s.lastUser,
            }],
          }
        case 'done':
          return { ...s, status: 'idle', toolLabel: null, items: s.items.map((it) => (it.role === 'assistant' && !it.done ? { ...it, done: true } : it)) }
        default:
          return s
      }
    }
  }
}

export function lastFinishedReply(s: ChatState): Extract<ChatItem, { role: 'assistant' }> | undefined {
  for (let i = s.items.length - 1; i >= 0; i--) {
    const it = s.items[i]
    if (it.role === 'assistant' && it.done) return it
  }
  return undefined
}
