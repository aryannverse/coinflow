export type AgentCapabilities = { chat: boolean; vision: boolean; stt: boolean; tts: boolean }
export type AgentHealth = { online: boolean; capabilities: AgentCapabilities | null }

export const AGENT_OFFLINE_TEXT = 'Assistant offline. Everything else still works.'
export const AGENT_CONNECTING_TEXT = 'Connecting…'

/** 'loading' until GET /agent/health answers. A failed check counts as offline: it isn't retried (retry: false). */
export type AgentHealthState = 'loading' | 'online' | 'offline'

export function agentHealthState(q: { data: AgentHealth | undefined; isError: boolean }): AgentHealthState {
  if (q.data) return q.data.online ? 'online' : 'offline'
  return q.isError ? 'offline' : 'loading'
}

/**
 * Spec §4.7: the pill opens the agent panel; only a CONFIRMED offline answer falls back to the ⌘K palette. Unknown
 * (still loading) opens Ask too, which says "Connecting…" until health answers (live smoke 2026-10-13).
 */
export const pillAction = (s: AgentHealthState): 'ask' | 'palette' => (s === 'offline' ? 'palette' : 'ask')

/** The panel's status line while the chat itself is idle: "Connecting…" until health answers, then offline or nothing. */
export const healthStatusText = (s: AgentHealthState): string =>
  s === 'loading' ? AGENT_CONNECTING_TEXT : s === 'offline' ? AGENT_OFFLINE_TEXT : ''
