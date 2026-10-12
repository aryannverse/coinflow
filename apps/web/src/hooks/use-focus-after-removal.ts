'use client'
import { useEffect, useRef } from 'react'

type Pending = { removed: string; next: string | null; fallback: string }

/**
 * When an action removes a row (accept, decline, delete…), focus must not fall to <body> (Part A I13): once the row
 * has left `keys`, focus `next` (a selector for the following row's first control) or else the element with id
 * `fallback` (a heading with tabIndex -1). Focus only, no state, so the effect is safe under react-hooks 7.
 */
export function useFocusAfterRemoval(keys: string[]) {
  const pending = useRef<Pending | null>(null)
  const signature = keys.join('\n')
  useEffect(() => {
    const p = pending.current
    if (!p || signature.split('\n').includes(p.removed)) return
    pending.current = null
    const target = (p.next ? document.querySelector<HTMLElement>(p.next) : null) ?? document.getElementById(p.fallback)
    target?.focus()
  }, [signature])
  return {
    arm: (removed: string, next: string | null, fallback: string) => {
      pending.current = { removed, next, fallback }
    },
    disarm: () => {
      pending.current = null
    },
  }
}
