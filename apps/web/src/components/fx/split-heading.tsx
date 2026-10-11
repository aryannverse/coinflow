'use client'
import SplitText from '@/components/reactbits/SplitText'
import { useReducedMotion } from '@/components/providers/motion-pref'

/** Per-character heading entrance; a plain heading when motion is reduced. */
export function SplitHeading({ as = 'h1', text, className }: { as?: 'h1' | 'h2'; text: string; className?: string }) {
  const reduced = useReducedMotion()
  const Tag = as
  if (reduced) return <Tag className={className}>{text}</Tag>
  return <SplitText tag={as} text={text} className={className} delay={30} splitType="chars" textAlign="inherit" />
}
