import { Skeleton } from '@/components/ui/skeleton'

/** Route-level loading state. Purely decorative, so it is hidden from assistive tech. */
export default function Loading() {
  return (
    <div aria-hidden className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Skeleton className="h-64 rounded-tile sm:col-span-2 lg:row-span-2" />
      <Skeleton className="h-32 rounded-tile" />
      <Skeleton className="h-32 rounded-tile" />
      <Skeleton className="h-40 rounded-tile sm:col-span-2" />
      <Skeleton className="h-64 rounded-tile sm:col-span-2" />
    </div>
  )
}
