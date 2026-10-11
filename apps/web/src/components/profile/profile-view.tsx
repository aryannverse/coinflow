'use client'
import { SignOutButton } from '@clerk/nextjs'
import { Check, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { Tile } from '@/components/fx/tile'
import { CheckinDialog } from '@/components/home/checkin-dialog'
import { LabeledInput } from '@/components/onboarding/steps/labeled-input'
import { useMotionPref } from '@/components/providers/motion-pref'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMe, useUpdateMe } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { MeDTO } from '@/lib/api-types'
import type { MotionPref } from '@/lib/motion-pref'
import { buildMePatch, profileValues, type ProfileErrors, type ProfileField } from '@/lib/profile-patch'
import type { MePatch } from '@/lib/schemas/me'
import { cn } from '@/lib/utils'
import { UpiQrUpload } from './upi-qr-upload'

type Scope = 'you' | 'upi' | 'look'
/** `idle` is what to say when the patch is empty and nothing is sent. */
type Commit = (patch: MePatch, scope: Scope, text: string, idle?: string) => Promise<{ ok: true } | { ok: false; field?: string; message?: string }>

const FIELD_ID: Record<ProfileField, string> = {
  name: 'p-name',
  paydayDay: 'p-payday',
  monthlyIncome: 'p-income',
  fixedCostsEstimate: 'p-fixed',
  upiId: 'p-upiid',
}
const FIELD_ORDER: ProfileField[] = ['name', 'paydayDay', 'monthlyIncome', 'fixedCostsEstimate', 'upiId']
const isField = (f: string | undefined): f is ProfileField => !!f && f in FIELD_ID
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

const choiceClass =
  'min-h-12 flex-1 rounded-chip border px-3 active:scale-[0.97] data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

/** Polite live region, always mounted so a change in text is announced. Shows a tick beside the words. */
function SaveNote({ text }: { text: string }) {
  return (
    <p role="status" className="flex min-h-6 items-center gap-1.5 text-sm text-muted-foreground">
      {text && <Check className="size-4 text-primary" aria-hidden />}
      {text}
    </p>
  )
}

/** The mounted form re-reads `me` only when it is keyed anew (see ProfileView), so state starts from the saved profile. */
function YouForm({ me, commit, pending, onDirty, note }: { me: MeDTO; commit: Commit; pending: boolean; onDirty: () => void; note: string }) {
  const [values, setValues] = useState(() => {
    const p = profileValues(me)
    return { name: p.name, paydayDay: p.paydayDay, monthlyIncome: p.monthlyIncome, fixedCostsEstimate: p.fixedCostsEstimate }
  })
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [formError, setFormError] = useState('')

  const edit = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }))
    setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev))
    setFormError('')
    onDirty()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    const { patch, errors: local } = buildMePatch(me, values)
    const first = FIELD_ORDER.find((f) => local[f])
    if (first) {
      setErrors(local)
      focusField(first)
      return
    }
    setErrors({})
    setFormError('')
    if (Object.keys(patch).length === 0) {
      void commit({}, 'you', '', 'No changes to save.')
      return
    }
    const res = await commit(patch, 'you', 'Saved')
    if (res.ok || !res.message) return
    if (isField(res.field)) {
      setErrors({ [res.field]: res.message })
      focusField(res.field)
    } else {
      setFormError(res.message)
    }
  }

  return (
    <form className="mt-3 flex flex-col gap-4" onSubmit={save} noValidate>
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
        <Button type="submit" className="min-h-12 rounded-chip px-6 active:scale-[0.97]" aria-disabled={pending || undefined}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <SaveNote text={note} />
      </div>
    </form>
  )
}

/** Saves on blur, and only when the ID changed. A value the server turned down is not re-sent until it is edited. */
function UpiIdField({ me, commit, onDirty, note }: { me: MeDTO; commit: Commit; onDirty: () => void; note: string }) {
  const [value, setValue] = useState(me.upiId ?? '')
  const [error, setError] = useState('')
  const rejected = useRef<string | null>(null)

  async function onBlur() {
    const raw = value.trim()
    if (raw === rejected.current) return
    const { patch } = buildMePatch(me, { upiId: value })
    if (!('upiId' in patch)) return
    const res = await commit({ upiId: patch.upiId }, 'upi', raw ? 'UPI ID saved' : 'UPI ID removed')
    if (res.ok || !res.message) return
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
        onBlur={() => void onBlur()}
        error={error}
        autoCapitalize="none"
        spellCheck={false}
        placeholder="name@okaxis"
        hint="Saves when you leave the field."
      />
      <SaveNote text={note} />
    </div>
  )
}

const noopSubscribe = () => () => {}

function LookAndFeel({ me, commit, note }: { me: MeDTO; commit: Commit; note: string }) {
  const { theme, setTheme } = useTheme()
  const { pref, setPref } = useMotionPref()
  // next-themes only knows the device's choice after hydration; until then show the saved profile value.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const themeValue = mounted && isTheme(theme) ? theme : me.theme

  return (
    <>
      <div className="mt-3 flex flex-col gap-2">
        <p id="p-theme-label" className="font-medium">Theme</p>
        <ToggleGroup type="single" value={themeValue} aria-labelledby="p-theme-label" className="w-full" onValueChange={(v) => {
          if (!isTheme(v)) return
          setTheme(v)
          const label = THEMES.find((t) => t.value === v)?.label
          void commit(v === me.theme ? {} : { theme: v }, 'look', `Theme: ${label}. Saved`, `Theme: ${label}.`)
        }}>
          {THEMES.map((t) => (
            <ToggleGroupItem key={t.value} value={t.value} className={choiceClass}>{t.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <p id="p-motion-label" className="font-medium">Reduce motion</p>
        <ToggleGroup type="single" value={pref} aria-labelledby="p-motion-label" aria-describedby="p-motion-hint" className="w-full" onValueChange={(v) => {
          const next = MOTION.find((m) => m.value === v)
          if (!next) return
          setPref(next.value satisfies MotionPref)
          void commit(next.value === me.reducedMotion ? {} : { reducedMotion: next.value }, 'look', `Reduce motion: ${next.label}. Saved`, `Reduce motion: ${next.label}.`)
        }}>
          {MOTION.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className={choiceClass}>{m.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p id="p-motion-hint" className="text-sm text-muted-foreground">On calms animation and turns off smooth scrolling and moving backgrounds. Match device follows your system setting.</p>
      </div>
      <div className="mt-2"><SaveNote text={note} /></div>
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
  const [note, setNote] = useState<{ scope: Scope; text: string } | null>(null)

  // mutateAsync, not mutate: the keyed forms remount when the saved profile changes, and per-call callbacks do not survive that.
  const commit = useCallback<Commit>(
    async (patch, scope, text, idle = '') => {
      if (Object.keys(patch).length === 0) {
        setNote({ scope, text: idle }) // nothing to send, so nothing to claim was saved
        return { ok: true }
      }
      try {
        await update.mutateAsync(patch)
        setNote({ scope, text })
        return { ok: true }
      } catch (err) {
        setNote(null)
        // Field errors are shown beside the field; anything else was already toasted by the hook.
        return err instanceof ApiError && err.field ? { ok: false, field: err.field, message: err.message } : { ok: false }
      }
    },
    [update],
  )
  const clear = useCallback(() => setNote(null), [])
  const noteFor = (s: Scope) => (note?.scope === s ? note.text : '')

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

  // Keyed by the values each form starts from, so a save re-reads them, but a theme or motion change does not reset typing.
  const youKey = [me.name, me.paydayDay, me.monthlyIncome, me.fixedCostsEstimate].join('|')
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
          <YouForm key={youKey} me={me} commit={commit} pending={update.isPending} onDirty={clear} note={noteFor('you')} />
          <div className="mt-5 flex flex-col gap-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">Moved money around? Tell Coinflow what’s in your account right now.</p>
            <div><CheckinDialog trigger={<Button type="button" variant="secondary" className="min-h-12 rounded-chip px-4 active:scale-[0.97]">Refresh balance</Button>} /></div>
          </div>
        </Tile>

        <Tile spotlight={false} aria-labelledby="p-upi">
          <h2 id="p-upi" className="font-display text-xl font-bold">UPI</h2>
          <div className="mt-3 flex flex-col gap-4">
            <UpiIdField key={me.upiId ?? ''} me={me} commit={commit} onDirty={clear} note={noteFor('upi')} />
            <UpiQrUpload />
          </div>
        </Tile>

        <Tile spotlight={false} aria-labelledby="p-prefs">
          <h2 id="p-prefs" className="font-display text-xl font-bold">Look & feel</h2>
          <LookAndFeel me={me} commit={commit} note={noteFor('look')} />
        </Tile>

        <Tile spotlight={false} aria-labelledby="p-data">
          <h2 id="p-data" className="font-display text-xl font-bold">Bills & data</h2>
          <Link
            href="/recurring"
            className={cn(
              'mt-3 flex min-h-12 items-center justify-between gap-3 rounded-chip border px-4 py-2 font-medium outline-none',
              'hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]',
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
