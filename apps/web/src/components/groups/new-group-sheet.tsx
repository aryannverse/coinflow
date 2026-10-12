'use client'
import { Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Spark } from '@/components/fx/spark'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateGroup, useFriends } from '@/hooks/group-queries'
import { ApiError } from '@/lib/api-client'
import type { GroupCreateBody } from '@/lib/schemas/groups'
import { cn } from '@/lib/utils'
import { FIELD } from './field'
import { MemberAvatar } from './member-avatar'
import { SheetFrame } from './sheet-frame'

export const GROUP_ICONS = [
  { emoji: '👥', label: 'People' },
  { emoji: '🧳', label: 'Trip' },
  { emoji: '🏠', label: 'Home' },
  { emoji: '🍽️', label: 'Food' },
  { emoji: '🎉', label: 'Party' },
  { emoji: '✈️', label: 'Travel' },
] as const
/** A real radio laid invisibly over its chip: it takes the click, the keyboard and the accessible name. */
export const HIDDEN_RADIO = 'absolute inset-0 size-full cursor-pointer appearance-none rounded-chip opacity-0'
const MAX_PEOPLE = 49 // plus you = 50
const CHIP = 'relative flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-chip border bg-surface-2 px-4 text-sm transition-colors active:scale-[0.97] has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring'
/** A 422's field → the input it belongs beside. */
const FIELD_INPUT: Record<string, string> = { name: 'ng-name', endsOn: 'ng-end', startsOn: 'ng-start', placeholders: 'ng-person', friendIds: 'ng-friends' }

type FieldError = { field: string; message: string }

function NewGroupForm({ prefill, onDone }: { prefill?: GroupCreateBody; onDone: () => void }) {
  const router = useRouter()
  const create = useCreateGroup()
  const friends = useFriends()
  const friendList = friends.data?.friends ?? []
  // Everything starts from the prefill via initialisers: no effect, no setState-on-open.
  const [kind, setKind] = useState<'group' | 'event'>(() => prefill?.kind ?? 'group')
  const [name, setName] = useState(() => prefill?.name ?? '')
  const [emoji, setEmoji] = useState(() => prefill?.emoji ?? '👥')
  const [startsOn, setStartsOn] = useState(() => prefill?.startsOn ?? '')
  const [endsOn, setEndsOn] = useState(() => prefill?.endsOn ?? '')
  const [people, setPeople] = useState<string[]>(() => (prefill?.placeholders ?? []).map((p) => p.displayName))
  const [friendIds, setFriendIds] = useState<string[]>(() => prefill?.friendIds ?? [])
  const [person, setPerson] = useState('')
  const [personError, setPersonError] = useState<string | null>(null)
  const [error, setError] = useState<FieldError | null>(null)
  const [announce, setAnnounce] = useState('')
  const personRef = useRef<HTMLInputElement>(null)
  const saving = useRef(false)

  const chosenFriends = friendList.filter((f) => friendIds.includes(f.userId))
  const total = people.length + friendIds.length
  const errorOn = (f: string) => (error?.field === f ? error.message : null)

  function addPerson() {
    const n = person.trim().replace(/\s+/g, ' ')
    if (!n) return setPersonError('Type a name first.')
    if (n.length > 60) return setPersonError('Keep names under 60 characters.')
    const taken = [...people, ...chosenFriends.map((f) => f.name)].some((x) => x.toLowerCase() === n.toLowerCase())
    if (taken) return setPersonError('Already added')
    if (total >= MAX_PEOPLE) return setPersonError('A group can have up to 50 people.')
    setPeople((p) => [...p, n])
    setPerson('')
    setPersonError(null)
    setAnnounce(`Added ${n}`)
    personRef.current?.focus()
  }

  function removePerson(n: string) {
    setPeople((p) => p.filter((x) => x !== n))
    setAnnounce(`Removed ${n}`)
    personRef.current?.focus() // the chip is gone; keep focus where people are added
  }

  function toggleFriend(id: string, friendName: string) {
    const on = friendIds.includes(id)
    if (!on && total >= MAX_PEOPLE) return setError({ field: 'friendIds', message: 'A group can have up to 50 people.' })
    setFriendIds((ids) => (on ? ids.filter((x) => x !== id) : [...ids, id]))
    setAnnounce(on ? `Removed ${friendName}` : `Added ${friendName}`)
    setError(null)
  }

  function fail(e: FieldError) {
    setError(e)
    const id = FIELD_INPUT[e.field]
    if (id) document.getElementById(id)?.focus()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (create.isPending || saving.current) return
    if (!name.trim()) return fail({ field: 'name', message: 'Name it, e.g. “Goa trip”.' })
    const isEvent = kind === 'event'
    if (isEvent && startsOn && endsOn && endsOn < startsOn) return fail({ field: 'endsOn', message: 'The end date is before the start date.' })
    saving.current = true
    try {
      const group = await create.mutateAsync({
        name: name.trim(), emoji, kind,
        startsOn: isEvent && startsOn ? startsOn : null,
        endsOn: isEvent && endsOn ? endsOn : null,
        placeholders: people.map((displayName) => ({ displayName })),
        friendIds,
      })
      router.push(`/groups/${group.id}`)
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.field) {
        const f = err.field
        fail({ field: Object.keys(FIELD_INPUT).find((k) => f === k || f.startsWith(`${k}.`)) ?? 'form', message: err.message })
      }
      else if (!(err instanceof ApiError)) fail({ field: 'form', message: 'Couldn’t create it. Please try again.' })
    } finally {
      saving.current = false
    }
  }

  return (
    <form id="ng-form" noValidate onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-4 pt-5 lg:px-6 lg:pt-6">
        <div className="flex flex-col gap-1 pr-12">
          <DialogTitle className="font-display text-xl">New group or event</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">A flat, a trip, a dinner. Split what you spend together.</DialogDescription>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">What is it?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['group', 'event'] as const).map((k) => (
              <label key={k} className={CHIP}>
                <input type="radio" name="ng-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className={HIDDEN_RADIO} />
                {k === 'group' ? 'Group' : 'Event'}
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {kind === 'group' ? 'Ongoing, like flatmates or a team.' : 'Has dates, like a trip or a wedding.'}
          </p>
        </fieldset>

        <div>
          <Label htmlFor="ng-name">Name</Label>
          <Input
            id="ng-name" value={name} maxLength={60} placeholder={kind === 'event' ? 'Goa trip' : 'Flat 4B'} className={cn(FIELD, 'mt-1')}
            aria-invalid={errorOn('name') ? true : undefined} aria-describedby={errorOn('name') ? 'ng-name-error' : undefined}
            onChange={(e) => { setName(e.target.value); if (error?.field === 'name') setError(null) }}
          />
          {errorOn('name') && <p id="ng-name-error" role="alert" className="mt-1.5 text-sm text-neutral-negative">{errorOn('name')}</p>}
        </div>

        <div>
          <p id="ng-icon-label" className="mb-2 text-sm text-muted-foreground">Icon</p>
          <div role="radiogroup" aria-labelledby="ng-icon-label" className="flex flex-wrap gap-2">
            {GROUP_ICONS.map((i) => (
              <label key={i.emoji} className={cn(CHIP, 'size-12 px-0 text-xl has-[:checked]:bg-primary/15 has-[:checked]:text-foreground')}>
                <input type="radio" name="ng-emoji" value={i.emoji} checked={emoji === i.emoji} aria-label={i.label} onChange={() => setEmoji(i.emoji)} className={HIDDEN_RADIO} />
                <span aria-hidden>{i.emoji}</span>
              </label>
            ))}
          </div>
        </div>

        {kind === 'event' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label htmlFor="ng-start">Starts</Label>
              <Input id="ng-start" type="date" value={startsOn} className={cn(FIELD, 'mt-1')}
                aria-invalid={errorOn('startsOn') ? true : undefined}
                onChange={(e) => { setStartsOn(e.target.value); setError(null) }} />
            </div>
            <div className="min-w-0">
              <Label htmlFor="ng-end">Ends</Label>
              <Input id="ng-end" type="date" value={endsOn} min={startsOn || undefined} className={cn(FIELD, 'mt-1')}
                aria-invalid={errorOn('endsOn') ? true : undefined} aria-describedby={errorOn('endsOn') ? 'ng-end-error' : undefined}
                onChange={(e) => { setEndsOn(e.target.value); setError(null) }} />
            </div>
            {(errorOn('endsOn') || errorOn('startsOn')) && (
              <p id="ng-end-error" role="alert" className="col-span-2 text-sm text-neutral-negative">{errorOn('endsOn') ?? errorOn('startsOn')}</p>
            )}
          </div>
        )}

        {friendList.length > 0 && (
          <div>
            {errorOn('friendIds') && <p role="alert" className="mb-2 text-sm text-neutral-negative">{errorOn('friendIds')}</p>}
            <div id="ng-friends" tabIndex={-1} role="group" aria-labelledby="ng-friends-label" aria-describedby="ng-friends-hint" className="outline-none">
              <p id="ng-friends-label" className="text-sm text-muted-foreground">Friends</p>
              <p id="ng-friends-hint" className="mb-2 text-xs text-muted-foreground">Friends join straight away.</p>
              <div className="flex flex-wrap gap-2">
                {friendList.map((f) => {
                  const on = friendIds.includes(f.userId)
                  return (
                    <button key={f.userId} type="button" aria-pressed={on} onClick={() => toggleFriend(f.userId, f.name)}
                      className={cn('flex min-h-12 items-center gap-2 rounded-chip border px-3 text-sm active:scale-[0.97]',
                        on ? 'border-primary bg-primary/15 text-foreground' : 'bg-surface-2 text-muted-foreground')}>
                      <MemberAvatar name={f.name} claimed size={28} />
                      {f.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {friendList.length > 0 ? 'Anyone else joins later with the invite link.' : 'Add the people who were there. They join later with the invite link.'}
          </p>
          <Label htmlFor="ng-person">Person’s name</Label>
          <div className="flex gap-2">
            <Input
              ref={personRef} id="ng-person" value={person} maxLength={60} placeholder="Asha" className={cn(FIELD, 'flex-1')}
              aria-invalid={personError || errorOn('placeholders') ? true : undefined}
              aria-describedby={personError || errorOn('placeholders') ? 'ng-person-error' : undefined}
              onChange={(e) => { setPerson(e.target.value); setPersonError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } }}
            />
            <Button type="button" variant="outline" onClick={addPerson} className="min-h-12 gap-1.5 rounded-chip active:scale-[0.97]">
              <Plus className="size-4" aria-hidden /> Add person
            </Button>
          </div>
          {(personError || errorOn('placeholders')) && (
            <p id="ng-person-error" role="alert" className="text-sm text-neutral-negative">{personError ?? errorOn('placeholders')}</p>
          )}
          {(chosenFriends.length > 0 || people.length > 0) && (
            <ul aria-label="People in this group" className="flex flex-wrap gap-2">
              {chosenFriends.map((f) => (
                <li key={f.userId} className="flex min-h-12 items-center gap-2 rounded-chip border bg-card pl-2">
                  <MemberAvatar name={f.name} claimed size={28} />
                  <span className="text-sm">{f.name}</span>
                  <span className="rounded-full border px-1.5 text-[11px] text-muted-foreground">friend</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => toggleFriend(f.userId, f.name)}
                    className="grid size-12 place-items-center rounded-chip text-muted-foreground hover:text-foreground active:scale-[0.97]">
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
              {people.map((n) => (
                <li key={n} className="flex min-h-12 items-center gap-2 rounded-chip border bg-card pl-2">
                  <MemberAvatar name={n} claimed={false} size={28} />
                  <span className="text-sm">{n}</span>
                  <button type="button" aria-label={`Remove ${n}`} onClick={() => removePerson(n)}
                    className="grid size-12 place-items-center rounded-chip text-muted-foreground hover:text-foreground active:scale-[0.97]">
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">You’re in it too. Dashed circles are people who haven’t joined yet.</p>
        </div>
        <p role="status" className="sr-only">{announce}</p>
        {errorOn('form') && <p role="alert" className="text-sm text-neutral-negative">{errorOn('form')}</p>}
      </div>

      <div className="shrink-0 border-t bg-popover px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-6 lg:pb-5">
        <Spark>
          <Button type="submit" aria-disabled={create.isPending || undefined} className="min-h-14 w-full rounded-chip text-base active:scale-[0.97] aria-disabled:opacity-70">
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </Spark>
      </div>
    </form>
  )
}

/** Spec §3.5 "New group / event". Placeholders now, real people later through the invite link; friends straight away (§3.8). */
export function NewGroupSheet({ open, openCount, prefill, onClose }: { open: boolean; openCount: number; prefill?: GroupCreateBody; onClose: () => void }) {
  return (
    <SheetFrame open={open} onClose={onClose} initialFocus="#ng-name">
      <NewGroupForm key={openCount} prefill={prefill} onDone={onClose} />
    </SheetFrame>
  )
}
