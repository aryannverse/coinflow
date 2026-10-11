import { cn } from '@/lib/utils'

/** Region label shared by every Home tile. The tile's `aria-labelledby` points at `id`. */
export function TileHeading({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className={cn('font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground', className)}>
      {children}
    </h2>
  )
}
