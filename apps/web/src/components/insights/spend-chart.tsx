'use client'
import { useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from '@/components/providers/motion-pref'
import type { InsightsDTO } from '@/lib/api-types'
import { compactINR, spendSummary } from '@/lib/chart-format'
import { formatISODate } from '@/lib/dates'
import { cumulativeTotals, fillDays } from '@/lib/fill-days'
import { formatINR } from '@/lib/money'

const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }
const TICK_TOTAL = { fill: 'var(--chart-2)', fontSize: 12 }
const title = (value: string, fill: string, angle: number) => ({ value, angle, position: 'insideLeft' as const, fill, fontSize: 12, offset: 8, style: { textAnchor: 'middle' as const } })

/** Daily spend as bars (left axis) with the running total as a line (right axis). Zero days are drawn, not skipped. */
export function SpendChart({ data }: { data: InsightsDTO }) {
  const reduced = useReducedMotion()
  const rows = useMemo(
    // Chart values are whole rupees (paise / 100); labels and tooltips convert back with `* 100`.
    () => cumulativeTotals(fillDays(data.byDay, data.from, data.to)).map((d) => ({ ...d, spent: d.expense / 100, running: d.total / 100 })),
    [data],
  )
  const top = data.byCategory.find((c) => c.amount > 0)
  const summary = spendSummary(data.totalExpense, rows.length, top?.name)
  const day = (d: string) => formatISODate(d, { weekday: 'short', day: 'numeric', month: 'short' })

  if (data.totalExpense <= 0) {
    return (
      <figure aria-labelledby="spend-chart-title" className="flex h-full flex-col">
        <figcaption id="spend-chart-title" className="font-display text-xl font-bold">Daily spending</figcaption>
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 px-4 py-10 text-center">
          <p className="font-display text-lg font-bold">Nothing spent in this range</p>
          <p className="max-w-xs text-sm text-muted-foreground">A quiet stretch. When you log an expense, it shows up here day by day.</p>
        </div>
      </figure>
    )
  }

  return (
    <figure aria-labelledby="spend-chart-title">
      <figcaption id="spend-chart-title" className="font-display text-xl font-bold">Daily spending</figcaption>
      <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-sm bg-chart-1" />Daily spend (left axis)</li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-2" />Running total (right axis)</li>
      </ul>
      <div role="img" aria-label={summary} className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ left: 0, right: 0, top: 8 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickFormatter={(d) => formatISODate(String(d))}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis yAxisId="day" domain={[0, 'auto']} tickLine={false} axisLine={false} width={64} tick={TICK} label={title('Per day', 'var(--muted-foreground)', -90)} tickFormatter={(v) => compactINR(Number(v) * 100)} />
            <YAxis yAxisId="total" orientation="right" domain={[0, 'auto']} tickLine={false} axisLine={false} width={64} tick={TICK_TOTAL} label={{ value: 'Running total', angle: 90, position: 'insideRight', fill: 'var(--chart-2)', fontSize: 12, offset: 8, style: { textAnchor: 'middle' } }} tickFormatter={(v) => compactINR(Number(v) * 100)} />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--popover-foreground)' }}
              labelFormatter={(d) => day(String(d))}
              formatter={(v, name) => [formatINR(Math.round(Number(v) * 100)), name]}
            />
            <Bar yAxisId="day" dataKey="spent" name="Spent" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={!reduced} />
            <Line
              yAxisId="total"
              dataKey="running"
              name="Running total"
              type="monotone"
              stroke="var(--chart-2)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={!reduced}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Daily spending and running total, {summary}</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Spent</th><th scope="col">Running total</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <th scope="row">{day(r.date)}</th>
              <td>{formatINR(r.expense)}</td>
              <td>{formatINR(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
