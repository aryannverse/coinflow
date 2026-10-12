'use client'
import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { useMe, useUpdateMe } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { MeDTO } from '@/lib/api-types'

type Key = 'countReceivables' | 'coachEnabled'
const ROWS: { key: Key; label: string; hint: string }[] = [
  { key: 'countReceivables', label: 'Count money owed to me in Safe-to-Spend', hint: 'Off: only what you owe others is counted.' },
  { key: 'coachEnabled', label: 'Coach notifications', hint: 'Up to two gentle nudges a day, never during quiet hours.' },
]

/** Spec §3.5 Profile toggles. Flips instantly; reverts with an inline message if the save fails. */
export function GroupPrefs({ initial }: { initial: MeDTO }) {
  const me = useMe(initial).data ?? initial
  const update = useUpdateMe({ inlineFieldErrors: true })
  const [pending, setPending] = useState<Partial<Record<Key, boolean>>>({})
  const [error, setError] = useState<{ key: Key; message: string } | null>(null)

  function flip(key: Key, value: boolean) {
    setError(null)
    setPending((p) => ({ ...p, [key]: value }))
    update.mutate({ [key]: value }, {
      onError: (err) => setError({ key, message: err instanceof ApiError ? err.message : 'Couldn’t save that. Try again.' }),
      onSettled: () => setPending((p) => {
        const next = { ...p }
        delete next[key]
        return next
      }),
    })
  }

  return (
    <div className="flex flex-col divide-y">
      {ROWS.map(({ key, label, hint }) => (
        <div key={key} className="flex min-h-14 items-center justify-between gap-4 py-2">
          <label htmlFor={`pref-${key}`} className="flex min-h-12 flex-1 cursor-pointer flex-col justify-center">
            <span>{label}</span>
            <span id={`pref-${key}-hint`} className="text-sm text-muted-foreground">{hint}</span>
            {error?.key === key && <span role="alert" className="text-sm text-neutral-negative">{error.message}</span>}
          </label>
          <Switch id={`pref-${key}`} checked={pending[key] ?? me[key]} aria-describedby={`pref-${key}-hint`} onCheckedChange={(v) => flip(key, v)} />
        </div>
      ))}
    </div>
  )
}
