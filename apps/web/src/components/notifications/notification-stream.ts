'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { NotificationDTO } from '@/lib/api-types'

/** Connection state lives outside React so effects never setState synchronously (react-hooks 7). */
let connected = false
const listeners = new Set<() => void>()
const setConnected = (v: boolean) => {
  if (connected === v) return
  connected = v
  for (const l of listeners) l()
}
const store = {
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get: () => connected,
  server: () => false,
}

export type StreamEvent = { type: 'notification'; row: NotificationDTO } | { type: 'sync'; unreadCount: number }

/**
 * Spec §3.4: one EventSource per tab. EventSource reconnects by itself (resuming with Last-Event-ID); while it is down,
 * `connected` is false and the caller polls every 30 s instead.
 */
export function useNotificationStream(onEvent: (e: StreamEvent) => void): boolean {
  const live = useSyncExternalStore(store.subscribe, store.get, store.server)
  const handler = useRef(onEvent)
  useEffect(() => {
    handler.current = onEvent
  })
  useEffect(() => {
    const es = new EventSource('/api/v1/notifications/stream')
    es.addEventListener('ready', () => setConnected(true))
    es.addEventListener('notification', (e) => handler.current({ type: 'notification', row: JSON.parse((e as MessageEvent).data) }))
    es.addEventListener('sync', (e) => handler.current({ type: 'sync', unreadCount: JSON.parse((e as MessageEvent).data).unreadCount }))
    es.addEventListener('error', () => setConnected(false))
    return () => {
      es.close()
      setConnected(false)
    }
  }, [])
  return live
}
