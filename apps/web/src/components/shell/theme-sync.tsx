'use client'
import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'

/** Seeds the device theme from the saved profile once, and only if this browser has no local choice yet. */
export function ThemeSync({ theme }: { theme: 'dark' | 'light' | 'system' }) {
  const { setTheme } = useTheme()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    try {
      if (window.localStorage.getItem('theme') === null) setTheme(theme)
    } catch {
      /* storage blocked: keep the default */
    }
  }, [setTheme, theme])
  return null
}
