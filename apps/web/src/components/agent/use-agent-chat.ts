'use client'
import { useCallback, useReducer, useRef } from 'react'
import { chatReducer, initialChat, type ChatStatus, type ProposalState, type Source } from '@/lib/agent-chat'
import type { PlanProgress } from '@/lib/proposal-apply'
import { createSSEParser } from '@/lib/sse'

export type AgentRouteContext = { route: string; groupId?: string }
const uid = () => crypto.randomUUID()
const newThreadId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24)
const OFFLINE = 'Assistant offline. Everything else still works.'

/** One conversation per page session. Streams the proxy's SSE into the reducer; never throws to the UI. */
export function useAgentChat() {
  const [state, dispatch] = useReducer(chatReducer, undefined, () => initialChat(newThreadId()))
  const threadRef = useRef(state.threadId)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (text: string, opts: { source?: Source; context: AgentRouteContext }) => {
    const message = text.trim()
    if (!message) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const source = opts.source ?? 'chat'
    dispatch({ type: 'send', id: uid(), text: message, source })
    let res: Response
    try {
      res = await fetch('/api/v1/agent/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ message, threadId: threadRef.current, context: opts.context, source }),
      })
    } catch {
      if (!ctrl.signal.aborted) dispatch({ type: 'fail', id: uid(), code: 'agent_offline', message: OFFLINE })
      return
    }
    if (res.status === 401) {
      window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
      dispatch({ type: 'fail', id: uid(), code: body?.error?.code ?? 'agent_offline', message: body?.error?.message ?? OFFLINE })
      return
    }
    const parser = createSSEParser()
    const reader = res.body.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        for (const event of parser.push(value)) dispatch({ type: 'event', id: uid(), event })
      }
      for (const event of parser.flush()) dispatch({ type: 'event', id: uid(), event })
    } catch {
      if (!ctrl.signal.aborted) dispatch({ type: 'fail', id: uid(), code: 'stream_dropped', message: 'The connection dropped. Try again.' })
    } finally {
      dispatch({ type: 'status', status: 'idle' })
    }
  }, [])

  const setStatus = useCallback((status: ChatStatus) => dispatch({ type: 'status', status }), [])
  const markProposal = useCallback(
    (id: string, s: ProposalState, error?: string, progress?: PlanProgress) => dispatch({ type: 'proposal', id, state: s, error, progress }),
    [],
  )
  const reset = useCallback(() => {
    abortRef.current?.abort()
    threadRef.current = newThreadId()
    dispatch({ type: 'reset', threadId: threadRef.current })
  }, [])
  const threadId = useCallback(() => threadRef.current, [])
  return { state, send, setStatus, markProposal, reset, threadId }
}
