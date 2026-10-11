import { cn } from '@/lib/utils'

/** Region label shared by every Home tile. The tile's `aria-labelledby` points at `id`. */
export function TileHeading({ id, className, children, tabIndex }: { id: string; className?: string; children: React.ReactNode; tabIndex?: number }) {
  return (
    <h2 id={id} tabIndex={tabIndex} className={cn('font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground outline-none', className)}>
      {children}
    </h2>
  )
}
