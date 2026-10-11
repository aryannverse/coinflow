'use client'
import ClickSpark from '@/components/reactbits/ClickSpark'
import { useReducedMotion } from '@/components/providers/motion-pref'

/** Click spark burst around its child; passthrough when motion is reduced. */
export function Spark({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{children}</>
  return (
    <ClickSpark sparkColor="#C8F560" sparkCount={10} sparkRadius={22} duration={420}>
      {children}
    </ClickSpark>
  )
}
