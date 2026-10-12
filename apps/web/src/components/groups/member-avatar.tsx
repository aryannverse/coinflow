import { initials } from '@/lib/group-display'
import { cn } from '@/lib/utils'

/** Decorative: the visible name next to it carries the meaning. Placeholders are dashed (spec §3.5), never colour-only. */
export function MemberAvatar({ name, claimed, size = 40, className }: { name: string; claimed: boolean; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-mono text-xs font-semibold',
        claimed ? 'bg-accent text-foreground ring-1 ring-border' : 'border-2 border-dashed border-muted-foreground text-muted-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
