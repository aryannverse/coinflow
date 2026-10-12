'use client'
import { Check, Copy, Link2, MessageCircle, Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useAddFriendMember, useAddPlaceholder, useArchiveGroup, useFriends, useInvite, useLinkFriend, useRegenerateInvite,
  useRemoveMember, useUpdateGroup, useUpdateMember,
} from '@/hooks/group-queries'
import { ApiError } from '@/lib/api-client'
import type { FriendDTO, GroupDetailDTO, GroupMemberDTO } from '@/lib/api-types'
import { whatsappLink } from '@/lib/reminder'
import { useFocusAfterRemoval } from '@/hooks/use-focus-after-removal'
import { cn } from '@/lib/utils'
import { FIELD } from './field'
import { MemberAvatar } from './member-avatar'
import { GROUP_ICONS, HIDDEN_RADIO } from './new-group-sheet'
import { useReturnFocus } from './sheet-frame'

const CARD = 'rounded-tile border bg-card p-5'
const H2 = 'font-display text-lg font-bold'
const ICON_BTN = 'min-h-12 gap-1.5 rounded-chip px-3 active:scale-[0.97]'
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** 1. Spec §3.5 Members tab: the invite link, copy / WhatsApp, and "New link" (revokes the old one). */
function InviteCard({ group }: { group: GroupDetailDTO }) {
  const invite = useInvite(group.id)
  const regenerate = useRegenerateInvite()
  const [status, setStatus] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const back = useReturnFocus()
  const url = invite.data?.url ?? ''

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setStatus('Link copied')
    } catch {
      setStatus('Couldn’t copy. Select the link and copy it yourself.')
    }
  }

  return (
    <section aria-labelledby="invite-h" className={CARD}>
      <h2 id="invite-h" className={H2}>Invite people</h2>
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="invite-link">Invite link</Label>
        <Input
          id="invite-link" readOnly value={invite.isError ? 'Couldn’t load the link' : url || 'Loading…'} aria-busy={invite.isPending || undefined}
          onFocus={(e) => e.currentTarget.select()} className="min-h-12 font-mono text-xs"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void copy()} aria-disabled={!url || undefined} className={ICON_BTN}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} Copy invite link
        </Button>
        <a
          href={url ? whatsappLink(`Join ${group.name} on Coinflow: ${url}`) : undefined} target="_blank" rel="noopener noreferrer"
          aria-disabled={!url || undefined}
          className={cn(buttonVariants({ variant: 'outline' }), ICON_BTN)}
        >
          <MessageCircle className="size-4" aria-hidden /> Share via WhatsApp<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className={ICON_BTN}>
          <RefreshCw className="size-4" aria-hidden /> New link
        </Button>
      </div>
      <p role="status" className="sr-only">{status}</p>
      <p className="mt-3 text-sm text-muted-foreground">People sign in, pick their name, and see their balance. Coinflow never messages anyone.</p>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent {...back.props} className="rounded-tile sm:max-w-sm">
          <DialogTitle>Make a new link?</DialogTitle>
          <DialogDescription>The old one stops working. Anyone you already sent it to will need the new one.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" className="min-h-12 rounded-chip" onClick={() => setConfirming(false)}>Keep this link</Button>
            <Button className="min-h-12 rounded-chip" onClick={() => {
              setConfirming(false)
              setCopied(false)
              regenerate.mutate(group.id)
            }}>Make a new link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** Inline edit of a placeholder's name and UPI ID (claimed members own their profile). */
function EditMember({ group, member, onDone }: { group: GroupDetailDTO; member: GroupMemberDTO; onDone: () => void }) {
  const update = useUpdateMember()
  const [name, setName] = useState(member.displayName)
  const [upi, setUpi] = useState(member.upiId ?? '')
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const id = member.id

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (update.isPending) return
    const n = name.trim()
    if (!n) return setError({ field: 'displayName', message: 'Add a name.' })
    if (group.members.some((m) => m.id !== id && !m.removedAt && sameName(m.displayName, n))) {
      return setError({ field: 'displayName', message: `There’s already someone called ${n} here.` })
    }
    update.mutate(
      { groupId: group.id, memberId: id, patch: { displayName: n, upiId: upi.trim() || null } },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err instanceof ApiError && err.field) {
            setError({ field: err.field, message: err.message })
            document.getElementById(err.field === 'upiId' ? `em-upi-${id}` : `em-name-${id}`)?.focus()
          }
        },
      },
    )
  }

  const err = (f: string) => (error?.field === f ? error.message : null)
  return (
    <form onSubmit={save} noValidate className="mt-2 flex w-full flex-col gap-3 rounded-chip bg-surface-2/60 p-3">
      <div>
        <Label htmlFor={`em-name-${id}`}>Name</Label>
        <Input id={`em-name-${id}`} value={name} maxLength={60} className={cn(FIELD, 'mt-1 bg-card')} autoFocus
          aria-invalid={err('displayName') ? true : undefined} aria-describedby={err('displayName') ? `em-name-${id}-error` : undefined}
          onChange={(e) => { setName(e.target.value); setError(null) }} />
        {err('displayName') && <p id={`em-name-${id}-error`} role="alert" className="mt-1 text-sm text-neutral-negative">{err('displayName')}</p>}
      </div>
      <div>
        <Label htmlFor={`em-upi-${id}`}>UPI ID</Label>
        <Input id={`em-upi-${id}`} value={upi} placeholder="name@okaxis" autoCapitalize="none" spellCheck={false} className={cn(FIELD, 'mt-1 bg-card')}
          aria-invalid={err('upiId') ? true : undefined} aria-describedby={err('upiId') ? `em-upi-${id}-error` : `em-upi-${id}-hint`}
          onChange={(e) => { setUpi(e.target.value); setError(null) }} />
        {err('upiId')
          ? <p id={`em-upi-${id}-error`} role="alert" className="mt-1 text-sm text-neutral-negative">{err('upiId')}</p>
          : <p id={`em-upi-${id}-hint`} className="mt-1 text-sm text-muted-foreground">Optional. Helps people pay them before they join.</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" aria-disabled={update.isPending || undefined} className="min-h-12 rounded-chip px-5 active:scale-[0.97]">{update.isPending ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="ghost" className="min-h-12 rounded-chip" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

/** 3b. "Link to a friend": pick which friend this placeholder is, then confirm (final, like a claim). */
function LinkFriendDialog({ group, member, friends, focusProps, onLinked, onClose }: {
  group: GroupDetailDTO; member: GroupMemberDTO; friends: FriendDTO[]
  focusProps: ReturnType<typeof useReturnFocus>['props']; onLinked: () => void; onClose: () => void
}) {
  const link = useLinkFriend()
  const [choice, setChoice] = useState<string>(friends[0]?.userId ?? '')
  const [step, setStep] = useState<'pick' | 'confirm'>('pick')
  const friend = friends.find((f) => f.userId === choice)
  return (
    <DialogContent {...focusProps} className="rounded-tile sm:max-w-sm">
      <DialogTitle>Who is {member.displayName}?</DialogTitle>
      {step === 'pick' ? (
        <>
          <DialogDescription>Pick the friend who is {member.displayName}. Their account takes over this name.</DialogDescription>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Friends</legend>
            {friends.map((f) => (
              <label key={f.userId} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-chip border bg-card px-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring">
                <input type="radio" name={`link-${member.id}`} value={f.userId} checked={choice === f.userId} onChange={() => setChoice(f.userId)} className="size-5 accent-[var(--primary)]" />
                <MemberAvatar name={f.name} claimed size={32} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{f.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{f.email}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button variant="outline" className="min-h-12 rounded-chip" onClick={onClose}>Never mind</Button>
            <Button className="min-h-12 rounded-chip" disabled={!friend} onClick={() => setStep('confirm')}>Continue</Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogDescription>
            Expenses already logged for {member.displayName} will show in {friend?.name}’s Activity, and they’ll be told. This can’t be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" className="min-h-12 rounded-chip" onClick={onClose}>Never mind</Button>
            <Button className="min-h-12 rounded-chip" aria-disabled={link.isPending || undefined} onClick={() => {
              if (!friend || link.isPending) return
              link.mutate({ groupId: group.id, memberId: member.id, userId: friend.userId, name: friend.name, placeholder: member.displayName }, {
                onSuccess: () => {
                  onLinked() // the "Link to a friend" button leaves with the placeholder
                  onClose()
                },
              })
            }}>{link.isPending ? 'Linking…' : 'Link'}</Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  )
}

/** 2. Members, placeholders (dashed, "Hasn’t joined yet"), and the actions each one allows. */
function MemberList({ group, eligible }: { group: GroupDetailDTO; eligible: FriendDTO[] }) {
  const remove = useRemoveMember()
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<GroupMemberDTO | null>(null)
  const [linking, setLinking] = useState<GroupMemberDTO | null>(null)
  const removeBack = useReturnFocus()
  const linkBack = useReturnFocus()
  const active = group.members.filter((m) => !m.removedAt)
  return (
    <section aria-labelledby="members-h" className={CARD}>
      <h2 id="members-h" tabIndex={-1} className={cn(H2, 'outline-none')}>Members <span className="font-mono text-sm font-normal text-muted-foreground">{active.length}</span></h2>
      <ul aria-label="Members" className="mt-2 flex flex-col">
        {active.map((m) => (
          <li key={m.id} className="flex flex-col border-b py-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-3">
              <MemberAvatar name={m.displayName} claimed={m.claimed} size={40} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {m.displayName}{m.isMe && <span className="text-muted-foreground"> (you)</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.role === 'creator' && 'Creator · '}{m.claimed ? 'Joined' : 'Hasn’t joined yet'}
                  {m.upiId && <> · <span className="font-mono">{m.upiId}</span></>}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {!m.claimed && (
                  <Button variant="ghost" aria-label={`Edit ${m.displayName}`} aria-expanded={editing === m.id}
                    onClick={() => setEditing(editing === m.id ? null : m.id)} className={ICON_BTN}>
                    <Pencil className="size-4" aria-hidden /> Edit
                  </Button>
                )}
                {!m.claimed && eligible.length > 0 && (
                  <Button variant="ghost" aria-label={`Link ${m.displayName} to a friend`} onClick={() => setLinking(m)} className={ICON_BTN}>
                    <Link2 className="size-4" aria-hidden /> Link to a friend
                  </Button>
                )}
                {group.isCreator && !m.isMe && (
                  <Button variant="ghost" aria-label={`Remove ${m.displayName}`} onClick={() => setRemoving(m)} className={ICON_BTN}>
                    <Trash2 className="size-4" aria-hidden /> Remove
                  </Button>
                )}
              </div>
            </div>
            {editing === m.id && (
              <EditMember group={group} member={m} onDone={() => {
                setEditing(null)
                requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-label="Edit ${CSS.escape(m.displayName)}"]`)?.focus())
              }} />
            )}
          </li>
        ))}
      </ul>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent {...removeBack.props} className="rounded-tile sm:max-w-sm">
          {removing && (
            <>
              <DialogTitle>Remove {removing.displayName}?</DialogTitle>
              <DialogDescription>They leave {group.name}. Expenses they were part of stay as they are.</DialogDescription>
              <DialogFooter>
                <Button variant="outline" className="min-h-12 rounded-chip" onClick={() => setRemoving(null)}>Keep</Button>
                <Button className="min-h-12 rounded-chip" onClick={() => {
                  const r = removing
                  removeBack.redirectTo('members-h') // their row (and its Remove button) is about to go
                  setRemoving(null)
                  remove.mutate({ groupId: group.id, memberId: r.id, name: r.displayName })
                }}>Remove</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={linking !== null} onOpenChange={(o) => !o && setLinking(null)}>
        {linking && (
          <LinkFriendDialog key={linking.id} group={group} member={linking} friends={eligible} focusProps={linkBack.props}
            onLinked={() => linkBack.redirectTo('members-h')} onClose={() => setLinking(null)} />
        )}
      </Dialog>
    </section>
  )
}

/** 3a + 3. Add from friends (joined at once), or by name (a placeholder who joins with the link). */
function AddPeople({ group, eligible, hasFriends }: { group: GroupDetailDTO; eligible: FriendDTO[]; hasFriends: boolean }) {
  const addFriend = useAddFriendMember()
  const addPlaceholder = useAddPlaceholder()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const focus = useFocusAfterRemoval(eligible.map((f) => f.userId))

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (addPlaceholder.isPending) return
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) return setError('Type their name first.')
    if (group.members.some((m) => !m.removedAt && sameName(m.displayName, n))) return setError(`There’s already someone called ${n} here.`)
    addPlaceholder.mutate({ groupId: group.id, body: { displayName: n } }, {
      onSuccess: () => {
        setName('')
        input.current?.focus()
      },
      onError: (err) => {
        if (err instanceof ApiError && (err.code === 'duplicate_member' || err.field)) setError(err.message)
      },
    })
  }

  return (
    <section aria-labelledby="add-h" className={CARD}>
      <h2 id="add-h" tabIndex={-1} className={cn(H2, 'outline-none')}>Add people</h2>
      <div className="mt-3 flex flex-col gap-2">
        <p id="add-friends-label" className="text-sm font-medium">Add from friends</p>
        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hasFriends ? 'All your friends are already here. ' : 'Friends you add on the Friends page show up here. '}
            <Link href="/friends" className="inline-flex min-h-12 items-center rounded-chip underline underline-offset-4">Find friends</Link>
          </p>
        ) : (
          <ul aria-label="Add from friends" className="flex flex-col">
            {eligible.map((f, i) => (
              <li key={f.userId} className="flex min-h-14 items-center gap-3 border-b last:border-b-0">
                <MemberAvatar name={f.name} claimed size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{f.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{f.email}</span>
                </span>
                <Button variant="outline" aria-label={`Add ${f.name} to ${group.name}`} aria-disabled={addFriend.isPending || undefined}
                  data-add-friend={f.userId}
                  onClick={() => {
                    if (addFriend.isPending) return
                    // The row leaves once they are a member: focus moves to the next friend, else the heading.
                    const next = eligible[i + 1] ?? eligible[i - 1]
                    focus.arm(f.userId, next ? `[data-add-friend="${next.userId}"]` : null, 'add-h')
                    addFriend.mutate({ groupId: group.id, userId: f.userId, name: f.name }, { onError: focus.disarm })
                  }}
                  className={ICON_BTN}>
                  <UserPlus className="size-4" aria-hidden /> Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={add} noValidate className="mt-4 flex flex-col gap-1.5 border-t pt-4">
        <Label htmlFor="add-person">Add a person</Label>
        <p id="add-person-hint" className="text-sm text-muted-foreground">Not on Coinflow yet? Add their name; they join later with the invite link.</p>
        <div className="flex gap-2">
          <Input ref={input} id="add-person" value={name} maxLength={60} placeholder="Ravi" className={cn(FIELD, 'flex-1')}
            aria-invalid={error ? true : undefined} aria-describedby={error ? 'add-person-error add-person-hint' : 'add-person-hint'}
            onChange={(e) => { setName(e.target.value); setError(null) }} />
          <Button type="submit" aria-disabled={addPlaceholder.isPending || undefined} className="min-h-12 shrink-0 rounded-chip px-5 active:scale-[0.97]">Add</Button>
        </div>
        {error && <p id="add-person-error" role="alert" className="text-sm text-neutral-negative">{error}</p>}
      </form>
    </section>
  )
}

/** 4. Creator only: rename, icon and dates; archive. */
function GroupDetails({ group }: { group: GroupDetailDTO }) {
  const router = useRouter()
  const update = useUpdateGroup()
  const archive = useArchiveGroup()
  const [name, setName] = useState(group.name)
  const [emoji, setEmoji] = useState(group.emoji)
  const [startsOn, setStartsOn] = useState(group.startsOn ?? '')
  const [endsOn, setEndsOn] = useState(group.endsOn ?? '')
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const back = useReturnFocus()
  const isEvent = group.kind === 'event'
  const err = (f: string) => (error?.field === f ? error.message : null)
  const icons = GROUP_ICONS.some((i) => i.emoji === emoji) ? GROUP_ICONS : [{ emoji, label: 'Current icon' }, ...GROUP_ICONS]

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (update.isPending) return
    if (!name.trim()) return setError({ field: 'name', message: 'Name it, e.g. “Goa trip”.' })
    if (isEvent && startsOn && endsOn && endsOn < startsOn) return setError({ field: 'endsOn', message: 'The end date is before the start date.' })
    update.mutate(
      { groupId: group.id, patch: { name: name.trim(), emoji, ...(isEvent ? { startsOn: startsOn || null, endsOn: endsOn || null } : {}) } },
      {
        onError: (er) => {
          if (er instanceof ApiError && er.field) {
            setError({ field: er.field, message: er.message })
            document.getElementById(er.field === 'endsOn' ? 'gd-end' : 'gd-name')?.focus()
          }
        },
      },
    )
  }

  return (
    <section aria-labelledby="details-h" className={CARD}>
      <h2 id="details-h" className={H2}>Group details</h2>
      <form onSubmit={save} noValidate className="mt-3 flex flex-col gap-4">
        <div>
          <Label htmlFor="gd-name">Name</Label>
          <Input id="gd-name" value={name} maxLength={60} className={cn(FIELD, 'mt-1')}
            aria-invalid={err('name') ? true : undefined} aria-describedby={err('name') ? 'gd-name-error' : undefined}
            onChange={(e) => { setName(e.target.value); setError(null) }} />
          {err('name') && <p id="gd-name-error" role="alert" className="mt-1 text-sm text-neutral-negative">{err('name')}</p>}
        </div>
        <div>
          <p id="gd-icon-label" className="mb-2 text-sm text-muted-foreground">Icon</p>
          <div role="radiogroup" aria-labelledby="gd-icon-label" className="flex flex-wrap gap-2">
            {icons.map((i) => (
              <label key={i.emoji} className="relative grid size-12 cursor-pointer place-items-center rounded-chip border bg-surface-2 text-xl active:scale-[0.97] has-[:checked]:border-primary has-[:checked]:bg-primary/15 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring">
                <input type="radio" name="gd-emoji" value={i.emoji} checked={emoji === i.emoji} aria-label={i.label} onChange={() => setEmoji(i.emoji)} className={HIDDEN_RADIO} />
                <span aria-hidden>{i.emoji}</span>
              </label>
            ))}
          </div>
        </div>
        {isEvent && (
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label htmlFor="gd-start">Starts</Label>
              <Input id="gd-start" type="date" value={startsOn} className={cn(FIELD, 'mt-1')} onChange={(e) => { setStartsOn(e.target.value); setError(null) }} />
            </div>
            <div className="min-w-0">
              <Label htmlFor="gd-end">Ends</Label>
              <Input id="gd-end" type="date" value={endsOn} min={startsOn || undefined} className={cn(FIELD, 'mt-1')}
                aria-invalid={err('endsOn') ? true : undefined} aria-describedby={err('endsOn') ? 'gd-end-error' : undefined}
                onChange={(e) => { setEndsOn(e.target.value); setError(null) }} />
            </div>
            {err('endsOn') && <p id="gd-end-error" role="alert" className="col-span-2 text-sm text-neutral-negative">{err('endsOn')}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" aria-disabled={update.isPending || undefined} className="min-h-12 rounded-chip px-5 active:scale-[0.97]">{update.isPending ? 'Saving…' : 'Save details'}</Button>
          <Button type="button" variant="ghost" onClick={() => setArchiving(true)} className="min-h-12 rounded-chip px-4 active:scale-[0.97]">Archive group</Button>
        </div>
      </form>
      <Dialog open={archiving} onOpenChange={setArchiving}>
        <DialogContent {...back.props} className="rounded-tile sm:max-w-sm">
          <DialogTitle>Archive {group.name}?</DialogTitle>
          <DialogDescription>It leaves your list; balances stay as they are.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" className="min-h-12 rounded-chip" onClick={() => setArchiving(false)}>Keep it</Button>
            <Button className="min-h-12 rounded-chip" onClick={() => {
              setArchiving(false)
              archive.mutate(group.id, { onSuccess: () => router.push('/groups') })
            }}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** Spec §3.5 Members tab + §3.8 friends: invite, members, add people, and (creator) group details. */
export function MembersTab({ group }: { group: GroupDetailDTO }) {
  const friends = useFriends()
  const all = friends.data?.friends ?? []
  // Friends who are not already live, joined members here (userId is null for placeholders).
  const inGroup = new Set(group.members.filter((m) => !m.removedAt && m.userId).map((m) => m.userId))
  const eligible = all.filter((f) => !inGroup.has(f.userId))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <InviteCard group={group} />
        <AddPeople group={group} eligible={eligible} hasFriends={all.length > 0} />
      </div>
      <div className="flex flex-col gap-4">
        <MemberList group={group} eligible={eligible} />
        {group.isCreator && <GroupDetails key={group.id} group={group} />}
      </div>
    </div>
  )
}
