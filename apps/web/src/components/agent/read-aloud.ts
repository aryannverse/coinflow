'use client'
import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'coinflow:read-aloud'
const listeners = new Set<() => void>()
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** "Read replies aloud" (spec §4.7). Off by default; per browser. */
export function useReadAloudPref(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, read, () => false)
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // private mode: the toggle just won't persist
    }
    for (const l of listeners) l()
  }, [])
  return [on, set]
}

export async function speak(text: string): Promise<void> {
  const res = await fetch('/api/v1/agent/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 1000) }) })
  if (!res.ok) return
  const url = URL.createObjectURL(await res.blob())
  const audio = new Audio(url)
  audio.onended = () => URL.revokeObjectURL(url)
  await audio.play().catch(() => URL.revokeObjectURL(url))
}
