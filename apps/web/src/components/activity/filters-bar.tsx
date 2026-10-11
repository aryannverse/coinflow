'use client'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories, type TxnFilters } from '@/hooks/queries'
import { hasFilters, METHODS } from '@/lib/activity-filters'

const SEARCH_DEBOUNCE_MS = 300
const FIELD = 'flex flex-col gap-1 text-xs text-muted-foreground'

type Props = {
  /** Filters as the URL has them. The URL is the single source of truth. */
  value: TxnFilters
  onChange: (patch: Partial<TxnFilters>) => void
  onClear: () => void
}

export function FiltersBar({ value, onChange, onClear }: Props) {
  const { data: categories = [] } = useCategories()

  // The input needs its own text while the user types; the URL only hears about it after a pause.
  // `emitted` is the last text we sent up, so a URL change that is not ours (palette link, Clear, back button) can be told apart.
  const [draft, setDraft] = useState(value.q ?? '')
  const [emitted, setEmitted] = useState(value.q ?? '')
  const [seen, setSeen] = useState(value.q)
  if (value.q !== seen) {
    setSeen(value.q)
    if ((value.q ?? '') !== emitted) {
      setDraft(value.q ?? '')
      setEmitted(value.q ?? '')
    }
  }

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const onSearch = (text: string) => {
    setDraft(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = text.trim()
      setEmitted(next)
      onChange({ q: next || undefined })
    }, SEARCH_DEBOUNCE_MS)
  }

  const clear = () => {
    clearTimeout(timer.current) // a half-typed search must not come back after Clear
    setDraft('')
    setEmitted('')
    onClear()
  }

  return (
    <div className="flex flex-col gap-3 rounded-tile border bg-card p-3 lg:flex-row lg:flex-wrap lg:items-end">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative min-w-0 flex-1 lg:min-w-56">
        <label className={FIELD}>
          <span>Search notes and categories</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={draft}
              maxLength={100}
              placeholder="Search “Toit”, “food”…"
              className="min-h-12 pl-9 text-foreground"
              onChange={(e) => onSearch(e.target.value)}
            />
          </span>
        </label>
      </form>

      <div className={FIELD}>
        <span id="f-type-label">Type</span>
        <ToggleGroup
          type="single"
          aria-labelledby="f-type-label"
          value={value.type ?? 'all'}
          onValueChange={(v) => v && onChange({ type: v === 'all' ? undefined : v })}
        >
          {[['all', 'All'], ['expense', 'Spent'], ['income', 'Received']].map(([v, label]) => (
            <ToggleGroupItem key={v} value={v} className="min-h-12 min-w-12 px-3 text-foreground active:scale-[0.97] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:contents">
        <div className={FIELD}>
          <span id="f-cat-label">Category</span>
          <Select value={value.categoryId ?? 'all'} onValueChange={(v) => onChange({ categoryId: v === 'all' ? undefined : v })}>
            <SelectTrigger aria-labelledby="f-cat-label" className="min-h-12 w-full text-foreground lg:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className={FIELD}>
          <span id="f-method-label">Method</span>
          <Select value={value.method ?? 'all'} onValueChange={(v) => onChange({ method: v === 'all' ? undefined : v })}>
            <SelectTrigger aria-labelledby="f-method-label" className="min-h-12 w-full text-foreground lg:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:flex">
        <label className={FIELD}>
          From
          <Input type="date" value={value.from ?? ''} max={value.to} onChange={(e) => onChange({ from: e.target.value || undefined })} className="min-h-12 text-foreground" />
        </label>
        <label className={FIELD}>
          To
          <Input type="date" value={value.to ?? ''} min={value.from} onChange={(e) => onChange({ to: e.target.value || undefined })} className="min-h-12 text-foreground" />
        </label>
      </div>

      {hasFilters(value) && (
        <Button type="button" variant="ghost" onClick={clear} className="min-h-12 min-w-12 px-3 active:scale-[0.97]">
          <X aria-hidden /> Clear filters
        </Button>
      )}
    </div>
  )
}
