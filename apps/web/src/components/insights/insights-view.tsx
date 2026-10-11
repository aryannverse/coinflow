'use client'
import { useEffect, useRef, useState } from 'react'
import { Reveal } from '@/components/fx/reveal'
import { Tile } from '@/components/fx/tile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useInsights, useMe, useSafeToSpend } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import { payCycle } from '@/lib/cycle'
import { resolveCustomRange } from '@/lib/custom-range'
import { addDays, formatISODate, toISTDate, type ISODate } from '@/lib/dates'
import { BudgetsPanel } from './budgets-panel'
import { CategoryChart } from './category-chart'
import { SpendChart } from './spend-chart'

type Range = 'cycle' | 'last' | '3m' | 'custom'

/** Date inputs apply once typing pauses this long (or on blur), not on every keystroke. */
const DATE_DEBOUNCE_MS = 500

export function InsightsView() {
  const [range, setRange] = useState<Range>('cycle')
  const sts = useSafeToSpend()
  const me = useMe()
  const today = toISTDate(new Date())
  const [custom, setCustom] = useState({ from: addDays(today, -13), to: today })
  const [inputs, setInputs] = useState(custom)
  const dateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(dateTimer.current), [])
  const editDate = (key: 'from' | 'to', value: string) => {
    if (!value) return
    const next = { ...inputs, [key]: value }
    setInputs(next)
    clearTimeout(dateTimer.current)
    dateTimer.current = setTimeout(() => setCustom(next), DATE_DEBOUNCE_MS)
  }
  const applyDates = () => {
    clearTimeout(dateTimer.current)
    setCustom(inputs)
  }

  const needsCycle = range === 'cycle' || range === 'last'
  const cycleReady = sts.data !== undefined && me.data !== undefined
  const cycleError = sts.error ?? me.error
  const resolved = resolveCustomRange(custom, today)

  let bounds: [ISODate, ISODate] | null = null
  if (range === 'custom') bounds = [resolved.from, resolved.to]
  else if (range === '3m') bounds = [addDays(today, -89), today] // 90 days, today included
  else if (sts.data && me.data) {
    if (range === 'cycle') bounds = [sts.data.cycleStart, today]
    else {
      const last = payCycle(addDays(sts.data.cycleStart, -1), me.data.paydayDay) // the server's previous pay cycle
      bounds = [last.cycleStart, last.cycleEnd]
    }
  }
  const insights = useInsights(bounds?.[0] ?? '', bounds?.[1] ?? '', undefined, bounds !== null)
  const data = insights.data
  const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

  let failure: React.ReactNode = null
  if (needsCycle && cycleError && !cycleReady) {
    failure = <ErrorNote message={message(cycleError, 'Couldn’t load your pay cycle.')} onRetry={() => { void sts.refetch(); void me.refetch() }} />
  } else if (insights.isError) {
    failure = <ErrorNote message={message(insights.error, 'Couldn’t load your insights.')} onRetry={() => void insights.refetch()} />
  }
  const fmt = (d: ISODate) => formatISODate(d, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Insights</h1>
          {bounds && <p className="text-sm text-muted-foreground">{fmt(bounds[0])} to {fmt(bounds[1])}</p>}
        </div>
        <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as Range)} aria-label="Date range" variant="outline" className="max-w-full flex-wrap">
          <ToggleGroupItem value="cycle" className="min-h-12 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">This cycle</ToggleGroupItem>
          <ToggleGroupItem value="last" className="min-h-12 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Last cycle</ToggleGroupItem>
          <ToggleGroupItem value="3m" className="min-h-12 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">3 months</ToggleGroupItem>
          <ToggleGroupItem value="custom" className="min-h-12 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Custom</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {range === 'custom' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">From
              <Input type="date" max={today} value={inputs.from} onChange={(e) => editDate('from', e.target.value)} onBlur={applyDates} className="min-h-12" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">To
              <Input type="date" max={today} value={inputs.to} onChange={(e) => editDate('to', e.target.value)} onBlur={applyDates} className="min-h-12" />
            </label>
          </div>
          {(resolved.clamped || resolved.swapped) && (
            <p role="status" className="text-xs text-muted-foreground">
              {resolved.swapped
                ? 'The start was after the end, so we’re showing just the end day.'
                : `Ranges are limited to a year, so the start moved to ${fmt(resolved.from)}.`}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        {failure ? (
          <Reveal className="lg:col-span-5"><Tile>{failure}</Tile></Reveal>
        ) : (
          <>
            <Reveal className="lg:col-span-3"><Tile className="h-full">{data ? <SpendChart data={data} /> : <ChartSkeleton />}</Tile></Reveal>
            <Reveal delay={0.05} className="lg:col-span-2"><Tile className="h-full">{data ? <CategoryChart data={data} /> : <ChartSkeleton />}</Tile></Reveal>
          </>
        )}
        <Reveal delay={0.1} className="lg:col-span-5"><BudgetsPanel /></Reveal>
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading chart</span>
      <Skeleton className="h-64" />
    </div>
  )
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-32 flex-col items-start justify-center gap-3 text-sm">
      <p>{message}</p>
      <Button variant="outline" className="min-h-12" onClick={onRetry}>Try again</Button>
    </div>
  )
}
