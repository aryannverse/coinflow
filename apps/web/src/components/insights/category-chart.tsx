'use client'
import type { InsightsDTO } from '@/lib/api-types'
import { diffDays } from '@/lib/dates'
import { formatINR } from '@/lib/money'

/**
 * Horizontal bars, not a donut: this period against the previous window of the same length, sorted by this period.
 * The previous bar is hatched and lighter AND labelled, so the two never rely on colour alone.
 */
export function CategoryChart({ data }: { data: InsightsDTO }) {
  const days = diffDays(data.to, data.from) + 1
  const caption = `vs the previous ${days} ${days === 1 ? 'day' : 'days'}`
  const rows = [...data.byCategory].sort((a, b) => b.amount - a.amount || b.previous - a.previous || a.name.localeCompare(b.name))

  if (rows.length === 0) {
    return (
      <figure aria-labelledby="cat-title" className="flex h-full flex-col">
        <figcaption id="cat-title" className="font-display text-xl font-bold">By category</figcaption>
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 px-4 py-10 text-center">
          <p className="font-display text-lg font-bold">No categories to compare yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">Once you log spending, you’ll see where it goes {caption}.</p>
        </div>
      </figure>
    )
  }

  const max = Math.max(1, ...rows.flatMap((c) => [c.amount, c.previous]))
  const top = rows[0]
  const summary = `Spending by category ${caption}. ${top.amount > 0 ? `Most on ${top.name}, ${formatINR(top.amount)}.` : 'Nothing spent in this range.'}`
  return (
    <figure aria-labelledby="cat-title">
      <figcaption id="cat-title" className="font-display text-xl font-bold">By category</figcaption>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-5 rounded-sm bg-chart-1" />This period</li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-5 rounded-sm opacity-60 bg-[repeating-linear-gradient(135deg,var(--chart-1)_0_2px,transparent_2px_5px)]" />Previous
        </li>
      </ul>
      <div role="img" aria-label={summary} className="mt-4 flex flex-col gap-4">
        {rows.map((c) => {
          const delta = c.amount - c.previous
          return (
            <div key={c.categoryId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="min-w-0 truncate"><span aria-hidden>{c.emoji}</span> {c.name}</span>
                <span className="amount font-semibold">{formatINR(c.amount)}</span>
              </div>
              <div className="mt-1 flex flex-col gap-1">
                <div className="h-2.5 rounded-full bg-chart-1" style={{ width: `${(c.amount / max) * 100}%`, minWidth: c.amount > 0 ? 4 : 0 }} />
                <div
                  className="h-2 rounded-full opacity-60 bg-[repeating-linear-gradient(135deg,var(--chart-1)_0_3px,transparent_3px_6px)]"
                  style={{ width: `${(c.previous / max) * 100}%`, minWidth: c.previous > 0 ? 4 : 0 }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Previous {formatINR(c.previous)} · {delta === 0 ? 'same' : `${delta > 0 ? '+' : '−'}${formatINR(Math.abs(delta))}`}
              </p>
            </div>
          )
        })}
      </div>
      <table className="sr-only">
        <caption>Spending by category, {caption}</caption>
        <thead>
          <tr><th scope="col">Category</th><th scope="col">This period</th><th scope="col">Previous</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.categoryId}><th scope="row">{c.name}</th><td>{formatINR(c.amount)}</td><td>{formatINR(c.previous)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
