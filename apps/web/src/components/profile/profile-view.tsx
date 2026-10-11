'use client'
import { SignOutButton } from '@clerk/nextjs'
import { Check, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, useSyncExternalStore } from 'react'
import { Tile } from '@/components/fx/tile'
import { CheckinDialog } from '@/components/home/checkin-dialog'
import { LabeledInput } from '@/components/onboarding/steps/labeled-input'
import { useMotionPref } from '@/components/providers/motion-pref'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { qk, useMe, useUpdateMe } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { MeDTO } from '@/lib/api-types'
import type { MotionPref } from '@/lib/motion-pref'
import { buildMePatch, profileValues, type ProfileErrors, type ProfileField } from '@/lib/profile-patch'
import type { MePatch } from '@/lib/schemas/me'
import { cn } from '@/lib/utils'
import { UpiQrUpload } from './upi-qr-upload'

type Scope = 'you' | 'upi' | 'look'
/** One entry per control that can have a save in flight. */
type Key = 'you' | 'upi' | 'theme' | 'motion'
type Result = { ok: true } | { ok: false; message: string; field?: string; local?: ProfileErrors }
/**
 * A save. `build` runs when the job reaches the front of the queue, against the latest confirmed profile, so a patch
 * is never diffed against a stale `me`. `idle` is what to say when there is nothing to send.
 */
type Job = { key: Key; scope: Scope; build: (me: MeDTO) => { patch: MePatch; errors?: ProfileErrors }; saved: string; idle?: string }
type Commit = (job: Job) => Promise<Result>

const FIELD_ID: Record<ProfileField, string> = {
  name: 'p-name',
  paydayDay: 'p-payday',
  monthlyIncome: 'p-income',
  fixedCostsEstimate: 'p-fixed',
  upiId: 'p-upiid',
}
const FIELD_ORDER: ProfileField[] = ['name', 'paydayDay', 'monthlyIncome', 'fixedCostsEstimate', 'upiId']
const YOU_FIELDS = ['name', 'paydayDay', 'monthlyIncome', 'fixedCostsEstimate'] as const
type YouField = (typeof YOU_FIELDS)[number]
const isYouField = (f: string | undefined): f is YouField => YOU_FIELDS.some((k) => k === f)
const focusField = (f: ProfileField) => document.getElementById(FIELD_ID[f])?.focus()

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Match device' },
] as const
const MOTION = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
  { value: 'system', label: 'Match device' },
] as const
type ThemeValue = (typeof THEMES)[number]['value']
const isTheme = (v: string | undefined): v is ThemeValue => THEMES.some((t) => t.value === v)

// h-auto/whitespace-normal let a long label ("✓ Match device") wrap at 320–390 px instead of clipping; min-h-12 keeps the 48 px target.
const choiceClass =
  'min-h-12 h-auto min-w-0 flex-1 shrink gap-1.5 whitespace-normal rounded-chip border px-3 py-2 text-center leading-tight active:scale-[0.97] data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

/** Polite live region, always mounted so a change in text is announced. Shows a tick beside the words. */
function SaveNote({ text }: { text: string }) {
  return (
    <p role="status" className="flex min-h-6 items-center gap-1.5 text-sm text-muted-foreground">
      {text.replace(/​/g, '') && <Check className="size-4 text-primary" aria-hidden />}
      {text}
    </p>
  )
}

const youValues = (me: MeDTO): Record<YouField, string> => {
  const p = profileValues(me)
  return { name: p.name, paydayDay: p.paydayDay, monthlyIncome: p.monthlyIncome, fixedCostsEstimate: p.fixedCostsEstimate }
}
/** Does this text already mean what is saved (so it can be shown the way the server stores it)? */
const sameAsSaved = (me: MeDTO, k: ProfileField, text: string) => {
  const r = buildMePatch(me, { [k]: text })
  return !(k in r.patch) && !r.errors[k]
}

/**
 * Not remounted when a save lands (that would drop focus and typing). Instead, when the saved profile changes,
 * each field that the user has not edited since (or whose text already means the saved value) is refreshed in place.
 */
function YouForm({ me, commit, pending, onDirty, note }: { me: MeDTO; commit: Commit; pending: boolean; onDirty: () => void; note: string }) {
  const fresh = youValues(me)
  const [values, setValues] = useState(fresh)
  const [seen, setSeen] = useState(fresh)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [formError, setFormError] = useState('')

  if (YOU_FIELDS.some((k) => fresh[k] !== seen[k])) {
    const next = { ...values }
    for (const k of YOU_FIELDS) {
      if (fresh[k] !== seen[k] && (values[k] === seen[k] || sameAsSaved(me, k, values[k]))) next[k] = fresh[k]
    }
    setValues(next)
    setSeen(fresh)
  }

  const edit = (k: YouField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }))
    setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev))
    setFormError('')
    onDirty()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const res = await commit({ key: 'you', scope: 'you', build: (current) => buildMePatch(current, values), saved: 'Saved', idle: 'No changes to save.' })
    if (res.ok) {
      setErrors({})
      return
    }
    if (res.local) {
      setErrors(res.local)
      const first = FIELD_ORDER.find((f) => res.local?.[f])
      if (first) focusField(first)
    } else if (isYouField(res.field)) {
      setErrors({ [res.field]: res.message })
      focusField(res.field)
    } else if (res.field) {
      setFormError(res.message) // a field with no input here: say so rather than fail silently
    }
  }

  return (
    <form className="mt-3 flex flex-col gap-4" onSubmit={(e) => void save(e)} noValidate>
      <LabeledInput id="p-name" label="Name" value={values.name} onChange={edit('name')} error={errors.name} autoComplete="name" hint="Shown in Coinflow. Your sign-in account keeps its own name." />
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledInput id="p-payday" label="Payday" value={values.paydayDay} onChange={edit('paydayDay')} error={errors.paydayDay} inputMode="numeric" hint="Day of the month, 1 to 31." />
        <LabeledInput id="p-income" label="Monthly income (₹)" value={values.monthlyIncome} onChange={edit('monthlyIncome')} error={errors.monthlyIncome} inputMode="decimal" className="amount" hint="Optional." />
      </div>
      <LabeledInput id="p-fixed" label="Monthly basics (₹)" value={values.fixedCostsEstimate} onChange={edit('fixedCostsEstimate')} error={errors.fixedCostsEstimate} inputMode="decimal" className="amount" hint="Rent, bills and EMIs you pay every month." />
      {formError && (
        <p role="alert" className="text-sm text-neutral-negative">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button id="p-save" type="submit" className="min-h-12 rounded-chip px-6 active:scale-[0.97]">
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <SaveNote text={note} />
      </div>
    </form>
  )
}

/**
 * Saves on blur, and only when the ID changed. A value the server turned down is not re-sent until it is edited.
 * Never remounted by a save: while the field is focused, what the user is typing wins over the value that just landed.
 */
function UpiIdField({ me, commit, pending, onDirty, note }: { me: MeDTO; commit: Commit; pending: boolean; onDirty: () => void; note: string }) {
  const saved = me.upiId ?? ''
  const [value, setValue] = useState(saved)
  const [seen, setSeen] = useState(saved)
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState('')
  const rejected = useRef<string | null>(null)

  if (saved !== seen) {
    setSeen(saved)
    if (!focused) setValue(saved)
  }

  async function onBlur() {
    setFocused(false)
    const raw = value.trim()
    if (raw === rejected.current) return
    const res = await commit({
      key: 'upi',
      scope: 'upi',
      build: (current) => ({ patch: buildMePatch(current, { upiId: raw }).patch }),
      saved: raw ? 'UPI ID saved' : 'UPI ID removed',
    })
    if (res.ok || !res.field) return
    rejected.current = raw
    setError(res.message)
    focusField('upiId')
  }

  return (
    <div className="flex flex-col gap-1">
      <LabeledInput
        id="p-upiid"
        label="UPI ID"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError('')
          rejected.current = null
          onDirty()
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => void onBlur()}
        error={error}
        autoCapitalize="none"
        spellCheck={false}
        placeholder="name@okaxis"
        hint="Saves when you leave the field."
      />
      <SaveNote text={pending ? 'Saving…' : note} />
    </div>
  )
}

const noopSubscribe = () => () => {}

/**
 * Theme and motion apply on the device at once, then save. If the save fails, the control goes back to the last value
 * the server confirmed (`lastGood`), unless the user has already picked something else since.
 */
function LookAndFeel({ me, commit, pending, note, onDirty }: { me: MeDTO; commit: Commit; pending: { theme: boolean; motion: boolean }; note: string; onDirty: () => void }) {
  const { theme, setTheme } = useTheme()
  const { pref, setPref } = useMotionPref()
  // next-themes only knows the device's choice after hydration; until then show the saved profile value.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const themeValue = mounted && isTheme(theme) ? theme : me.theme
  const [error, setError] = useState('')
  const desiredTheme = useRef<string | null>(null)
  const goodTheme = useRef<ThemeValue | null>(null)
  const desiredMotion = useRef<MotionPref | null>(null)
  const goodMotion = useRef<MotionPref | null>(null)

  const failure = (res: Extract<Result, { ok: false }>) => `${res.message || 'Couldn’t save that.'} Your previous setting is back.`

  async function chooseTheme(v: ThemeValue) {
    const label = THEMES.find((t) => t.value === v)?.label
    desiredTheme.current = v
    goodTheme.current ??= themeValue
    setError('')
    onDirty()
    setTheme(v)
    const res = await commit({
      key: 'theme',
      scope: 'look',
      build: (current) => ({ patch: current.theme === v ? {} : { theme: v } }),
      saved: `Theme: ${label}. Saved`,
      idle: `Theme: ${label}.`,
    })
    if (res.ok) {
      goodTheme.current = v
      return
    }
    if (desiredTheme.current !== v) return // the user has moved on; that choice is what counts now
    setTheme(goodTheme.current ?? me.theme)
    desiredTheme.current = goodTheme.current
    setError(failure(res))
  }

  async function chooseMotion(v: MotionPref) {
    const label = MOTION.find((m) => m.value === v)?.label
    desiredMotion.current = v
    goodMotion.current ??= pref
    setError('')
    onDirty()
    setPref(v)
    const res = await commit({
      key: 'motion',
      scope: 'look',
      build: (current) => ({ patch: current.reducedMotion === v ? {} : { reducedMotion: v } }),
      saved: `Reduce motion: ${label}. Saved`,
      idle: `Reduce motion: ${label}.`,
    })
    if (res.ok) {
      goodMotion.current = v
      return
    }
    if (desiredMotion.current !== v) return
    setPref(goodMotion.current ?? me.reducedMotion)
    desiredMotion.current = goodMotion.current
    setError(failure(res))
  }

  return (
    <>
      <div className="mt-3 flex flex-col gap-2">
        <p id="p-theme-label" className="font-medium">Theme</p>
        <ToggleGroup type="single" value={themeValue} aria-labelledby="p-theme-label" aria-busy={pending.theme || undefined} className="w-full" onValueChange={(v) => { if (isTheme(v)) void chooseTheme(v) }}>
          {THEMES.map((t) => (
            <ToggleGroupItem key={t.value} value={t.value} className={choiceClass}>
              {themeValue === t.value && <Check aria-hidden />}
              {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <p id="p-motion-label" className="font-medium">Reduce motion</p>
        <ToggleGroup type="single" value={pref} aria-labelledby="p-motion-label" aria-describedby="p-motion-hint" aria-busy={pending.motion || undefined} className="w-full" onValueChange={(v) => {
          const next = MOTION.find((m) => m.value === v)
          if (next) void chooseMotion(next.value)
        }}>
          {MOTION.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className={choiceClass}>
              {pref === m.value && <Check aria-hidden />}
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p id="p-motion-hint" className="text-sm text-muted-foreground">On calms animation and turns off smooth scrolling and moving backgrounds. Match device follows your system setting.</p>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {error && (
          <p role="alert" className="text-sm text-neutral-negative">
            {error}
          </p>
        )}
        <SaveNote text={note} />
      </div>
    </>
  )
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <h1 className="font-display text-3xl font-bold">Profile</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 rounded-tile" />
        ))}
      </div>
    </div>
  )
}

/**
 * Tiles here are plain (no pointer spotlight): Tile swaps its wrapper when reduced motion flips, which would remount
 * the forms and drop typed text and focus the moment someone changes the Reduce motion setting on this very page.
 */
export function ProfileView({ initial }: { initial?: MeDTO }) {
  const { data: me, isError, refetch } = useMe(initial)
  const update = useUpdateMe({ inlineFieldErrors: true })
  const qc = useQueryClient()
  const [note, setNote] = useState<{ scope: Scope; text: string; n: number } | null>(null)
  const [busy, setBusy] = useState<Record<Key, boolean>>({ you: false, upi: false, theme: false, motion: false })
  const inflight = useRef<Record<Key, number>>({ you: 0, upi: 0, theme: 0, motion: 0 })
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const nonce = useRef(0)

  const track = (key: Key, by: 1 | -1) => {
    inflight.current[key] += by
    setBusy((b) => ({ ...b, [key]: inflight.current[key] > 0 }))
  }
  const say = (scope: Scope, text: string) => setNote({ scope, text, n: ++nonce.current })

  /**
   * Every save goes through one queue, so none is dropped and none is diffed against a stale profile: each job
   * builds its patch from the latest confirmed `me` when its turn comes. mutateAsync, not mutate: per-call
   * callbacks do not fire once the caller has unmounted. Field errors come back to the caller; the hook toasts the rest.
   */
  const commit: Commit = (job) => {
    const overlapped = inflight.current[job.key] > 0
    track(job.key, 1)
    setNote(null) // clear first so the same words announce again next time
    const run = async (): Promise<Result> => {
      try {
        const current = qc.getQueryData<MeDTO>(qk.me)
        if (!current) return { ok: false, message: 'Your profile isn’t loaded yet.' }
        const { patch, errors } = job.build(current)
        if (errors && Object.keys(errors).length > 0) return { ok: false, message: '', local: errors }
        if (Object.keys(patch).length === 0) {
          // A second click right behind a save finds nothing left to send; keep that save's "Saved" on screen.
          if (!overlapped) say(job.scope, job.idle ?? '')
          return { ok: true }
        }
        try {
          await update.mutateAsync(patch)
        } catch (err) {
          const message = err instanceof ApiError ? err.message : 'Couldn’t save that.'
          return { ok: false, message, field: err instanceof ApiError ? err.field : undefined }
        }
        say(job.scope, job.saved)
        return { ok: true }
      } finally {
        track(job.key, -1)
      }
    }
    const result = queue.current.then(run)
    queue.current = result.catch(() => undefined)
    return result
  }
  const clear = () => setNote(null)
  const noteFor = (s: Scope) => (note?.scope === s ? note.text + (note.n % 2 ? '​' : '') : '')

  if (!me) {
    if (!isError) return <ProfileSkeleton />
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-display text-3xl font-bold">Profile</h1>
        <p role="alert" className="text-muted-foreground">We couldn’t load your profile.</p>
        <Button className="min-h-12 rounded-chip px-6 active:scale-[0.97]" onClick={() => void refetch()}>Try again</Button>
      </div>
    )
  }

  const initialLetter = (me.name.trim()[0] ?? me.email[0] ?? '?').toUpperCase()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-bold">Profile</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tile spotlight={false} aria-labelledby="p-you">
          <h2 id="p-you" className="font-display text-xl font-bold">You & your money</h2>
          <div className="mt-3 flex items-center gap-3">
            {me.avatarUrl ? (
              <Image src={me.avatarUrl} alt="" width={48} height={48} unoptimized className="size-12 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-lg" aria-hidden>{initialLetter}</span>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{me.email}</p>
              <p className="text-sm text-muted-foreground">Your photo and email come from your sign-in account.</p>
            </div>
          </div>
          <YouForm me={me} commit={commit} pending={busy.you} onDirty={clear} note={noteFor('you')} />
          <div className="mt-5 flex flex-col gap-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">Moved money around? Tell Coinflow what’s in your account right now.</p>
            <div><CheckinDialog trigger={<Button type="button" variant="secondary" className="min-h-12 rounded-chip px-4 active:scale-[0.97]">Refresh balance</Button>} /></div>
          </div>
        </Tile>

        <Tile spotlight={false} aria-labelledby="p-upi">
          <h2 id="p-upi" className="font-display text-xl font-bold">UPI</h2>
          <div className="mt-3 flex flex-col gap-4">
            <UpiIdField me={me} commit={commit} pending={busy.upi} onDirty={clear} note={noteFor('upi')} />
            <UpiQrUpload />
          </div>
        </Tile>

        <Tile spotlight={false} aria-labelledby="p-prefs">
          <h2 id="p-prefs" className="font-display text-xl font-bold">Look & feel</h2>
          <LookAndFeel me={me} commit={commit} pending={busy} onDirty={clear} note={noteFor('look')} />
        </Tile>

        <Tile spotlight={false} aria-labelledby="p-data">
          <h2 id="p-data" className="font-display text-xl font-bold">Bills & data</h2>
          <Link
            href="/recurring"
            className={cn(
              'mt-3 flex min-h-12 items-center justify-between gap-3 rounded-chip border px-4 py-2 font-medium outline-none',
              'hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring active:scale-[0.97]',
            )}
          >
            Recurring bills & income
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">Download every transaction as a spreadsheet-friendly CSV.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="min-h-12 rounded-chip px-4 active:scale-[0.97]">
              <a href="/api/v1/export.csv" download>Export CSV</a>
            </Button>
            <SignOutButton redirectUrl="/">
              <Button variant="ghost" className="min-h-12 rounded-chip px-4 active:scale-[0.97]">Sign out</Button>
            </SignOutButton>
          </div>
        </Tile>
      </div>
    </div>
  )
}
