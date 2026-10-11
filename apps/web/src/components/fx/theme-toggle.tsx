'use client'
import { useTheme } from 'next-themes'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler'

/** Magic UI toggler flips the class; we mirror the result into next-themes and (optionally) the user profile. */
export function ThemeToggle({ onPersist }: { onPersist?: (t: 'dark' | 'light') => void }) {
  const { setTheme } = useTheme()
  const reduced = useReducedMotion()
  return (
    <AnimatedThemeToggler
      aria-label="Switch colour theme"
      className="inline-grid min-h-12 min-w-12 place-items-center rounded-full active:scale-[0.97]"
      animated={!reduced}
      onToggle={(t) => {
        setTheme(t)
        onPersist?.(t)
      }}
    />
  )
}
