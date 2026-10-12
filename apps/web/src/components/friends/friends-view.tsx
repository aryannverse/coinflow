'use client'
import { Check, Search, UserMinus, UserPlus } from 'lucide-react'
import { useRef, useState } from 'react'
import { MemberAvatar } from '@/components/groups/member-avatar'
import { FIELD } from '@/components/groups/field'
import { useReturnFocus } from '@/components/groups/sheet-frame'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAcceptFriend, useDropFriendRequest, useFriends, useFriendSearch, useSendFriendRequest, useUnfriend,
} from '@/hooks/group-queries'
import { useFocusAfterRemoval } from '@/hooks/use-focus-after-removal'
import { ApiError } from '@/lib/api-client'
import type { FriendDTO, FriendsDTO, FriendSearchDTO } from '@/lib/api-types'
import { cn } from '@/lib/utils'

const CARD = 'rounded-tile border bg-card p-5'
const H2 = 'font-display text-lg font-bold outline-none'
const BTN = 'min-h-12 gap-1.5 rounded-chip px-4 active:scale-[0.97]'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEBOUNCE_MS = 300

function Person({ name, email, children, note }: { name: string; email: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <MemberAvatar name={name} claimed size={40} />
      <div className="flex min-w-[9rem] flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

/** 1. Search by exact email (spec §3.8): one result or none, never a directory. */
function FindFriend() {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const email = query.trim().toLowerCase()
  const complete = EMAIL.test(email)
  const search = useFriendSearch(email)
  const send = useSendFriendRequest()
  const accept = useAcceptFriend()
  const drop = useDropFriendRequest()
  const result: FriendSearchDTO | undefined = search.data

  function onType(v: string) {
    setText(v)
    setError(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setQuery(v), DEBOUNCE_MS)
  }

  function sendRequest() {
    if (send.isPending || !complete) return
    send.mutate(email, {
      onSuccess: () => input.current?.focus(),
      onError: (err) => {
        if (err instanceof ApiError && err.field) {
          setError(err.message)
          input.current?.focus()
        }
      },
    })
  }

  let body: React.ReactNode = null
  if (complete && search.isFetching && result === undefined) body = <p className="py-3 text-sm text-muted-foreground">Looking…</p>
  else if (complete && search.isError) body = <p className="py-3 text-sm text-muted-foreground">Couldn’t search just now. Try again in a moment.</p>
  else if (complete && result === null) body = <p className="py-3 text-sm text-muted-foreground">No Coinflow account uses that email. Invite them with a group link instead.</p>
  else if (complete && result?.relation === 'self') body = <p className="py-3 text-sm text-muted-foreground">That’s you.</p>
  else if (complete && result) {
    const r = result
    body = (
      <Person name={r.name} email={r.email}>
        {r.relation === 'none' && (
          <Button type="button" onClick={sendRequest} aria-disabled={send.isPending || undefined} className={BTN}>
            <UserPlus className="size-4" aria-hidden /> Add friend
          </Button>
        )}
        {r.relation === 'outgoing' && r.requestId && (
          <>
            <span className="inline-flex min-h-12 items-center rounded-chip border border-dashed px-3 text-sm text-muted-foreground">Requested</span>
            <Button type="button" variant="outline" aria-disabled={drop.isPending || undefined} className={BTN}
              onClick={() => { if (!drop.isPending && r.requestId) drop.mutate({ requestId: r.requestId, label: 'Request cancelled' }, { onSuccess: () => input.current?.focus() }) }}>
              Cancel request
            </Button>
          </>
        )}
        {r.relation === 'incoming' && r.requestId && (
          <Button type="button" aria-disabled={accept.isPending || undefined} className={BTN}
            onClick={() => { if (!accept.isPending && r.requestId) accept.mutate({ requestId: r.requestId, name: r.name }, { onSuccess: () => input.current?.focus() }) }}>
            <Check className="size-4" aria-hidden /> Accept
          </Button>
        )}
        {r.relation === 'friends' && <span className="inline-flex min-h-12 items-center gap-1.5 text-sm text-primary"><Check className="size-4" aria-hidden /> Friends</span>}
      </Person>
    )
  }

  return (
    <section aria-labelledby="find-h" className={CARD}>
      <h2 id="find-h" tabIndex={-1} className={H2}>Find a friend</h2>
      <form role="search" aria-label="Find a friend" noValidate className="mt-3 flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          // Enter right after typing: search now instead of waiting for the debounce.
          if (timer.current) clearTimeout(timer.current)
          setQuery(text)
          if (result && result.relation === 'none' && text.trim().toLowerCase() === email) sendRequest()
        }}>
        <Label htmlFor="friend-email">Their email</Label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input} id="friend-email" type="email" inputMode="email" autoComplete="off" spellCheck={false} autoCapitalize="none"
            value={text} placeholder="asha@example.com" className={cn(FIELD, 'pl-9')}
            aria-invalid={error ? true : undefined} aria-describedby={error ? 'friend-email-error friend-email-hint' : 'friend-email-hint'}
            onChange={(e) => onType(e.target.value)}
          />
        </div>
        <p id="friend-email-hint" className="text-sm text-muted-foreground">Type their whole email. Coinflow only finds exact matches.</p>
        {error && <p id="friend-email-error" role="alert" className="text-sm text-neutral-negative">{error}</p>}
      </form>
      <div aria-live="polite" className="mt-1">{body}</div>
    </section>
  )
}

/** 2. Incoming (Accept / Decline) and outgoing (Cancel) requests. */
function Requests({ data }: { data: FriendsDTO }) {
  const accept = useAcceptFriend()
  const drop = useDropFriendRequest()
  const rows = [...data.incoming.map((r) => ({ ...r, dir: 'in' as const })), ...data.outgoing.map((r) => ({ ...r, dir: 'out' as const }))]
  const focus = useFocusAfterRemoval(rows.map((r) => r.requestId))
  if (rows.length === 0) return null

  /**
   * After this row goes: the next row's first button. If it was the last request this whole card unmounts, so fall
   * back to a heading that stays: "Your friends" after an accept (that is where they now appear), else "Find a friend".
   */
  const armFor = (requestId: string, accepted: boolean) => {
    const i = rows.findIndex((r) => r.requestId === requestId)
    const next = rows[i + 1] ?? rows[i - 1]
    focus.arm(requestId, next ? `[data-request="${next.requestId}"] button` : null, next ? 'requests-h' : accepted ? 'friends-h' : 'find-h')
  }

  return (
    <section aria-labelledby="requests-h" className={CARD}>
      <h2 id="requests-h" tabIndex={-1} className={H2}>Requests</h2>
      <ul aria-label="Friend requests" className="mt-1 flex flex-col divide-y">
        {rows.map((r) => (
          <li key={r.requestId} data-request={r.requestId}>
            {r.dir === 'in' ? (
              <Person name={r.name} email={r.email} note="wants to be friends">
                <Button aria-label={`Accept ${r.name}`} aria-disabled={accept.isPending || undefined} className={BTN}
                  onClick={() => {
                    if (accept.isPending) return
                    armFor(r.requestId, true)
                    accept.mutate({ requestId: r.requestId, name: r.name }, { onError: focus.disarm })
                  }}>
                  <Check className="size-4" aria-hidden /> Accept
                </Button>
                <Button variant="outline" aria-label={`Decline ${r.name}`} aria-disabled={drop.isPending || undefined} className={BTN}
                  onClick={() => {
                    if (drop.isPending) return
                    armFor(r.requestId, false)
                    drop.mutate({ requestId: r.requestId, label: 'Request declined' }, { onError: focus.disarm })
                  }}>
                  Decline
                </Button>
              </Person>
            ) : (
              <Person name={r.name} email={r.email} note="Waiting for them to accept">
                <Button variant="outline" aria-label={`Cancel request to ${r.name}`} aria-disabled={drop.isPending || undefined} className={BTN}
                  onClick={() => {
                    if (drop.isPending) return
                    armFor(r.requestId, false)
                    drop.mutate({ requestId: r.requestId, label: 'Request cancelled' }, { onError: focus.disarm })
                  }}>
                  Cancel
                </Button>
              </Person>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 3. Friends, with Unfriend behind a confirmation (memberships and balances never change). */
function FriendList({ friends }: { friends: FriendDTO[] }) {
  const unfriend = useUnfriend()
  const [confirming, setConfirming] = useState<FriendDTO | null>(null)
  const back = useReturnFocus()
  const focus = useFocusAfterRemoval(friends.map((f) => f.userId))
  return (
    <section aria-labelledby="friends-h" className={CARD}>
      <h2 id="friends-h" tabIndex={-1} className={H2}>Your friends <span className="font-mono text-sm font-normal text-muted-foreground">{friends.length}</span></h2>
      {friends.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No friends yet. Search by email above.</p>
      ) : (
        <ul aria-label="Your friends" className="mt-1 flex flex-col divide-y">
          {friends.map((f) => (
            <li key={f.userId} data-friend={f.userId}>
              <Person name={f.name} email={f.email}>
                <Button variant="ghost" aria-label={`Unfriend ${f.name}`} onClick={() => setConfirming(f)} className={BTN}>
                  <UserMinus className="size-4" aria-hidden /> Unfriend
                </Button>
              </Person>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent {...back.props} className="rounded-tile sm:max-w-sm">
          {confirming && (
            <>
              <DialogTitle>Unfriend {confirming.name}?</DialogTitle>
              <DialogDescription>You stay in the same groups; nothing you share changes.</DialogDescription>
              <DialogFooter>
                <Button variant="outline" className="min-h-12 rounded-chip" onClick={() => setConfirming(null)}>Keep</Button>
                <Button className="min-h-12 rounded-chip" onClick={() => {
                  const f = confirming
                  const i = friends.findIndex((x) => x.userId === f.userId)
                  const next = friends[i + 1] ?? friends[i - 1]
                  // Their row is about to go: land on the heading now, then the next friend once the list refreshes.
                  back.redirectTo('friends-h')
                  focus.arm(f.userId, next ? `[data-friend="${next.userId}"] button` : null, 'friends-h')
                  setConfirming(null)
                  unfriend.mutate({ userId: f.userId, name: f.name }, { onError: focus.disarm })
                }}>Unfriend</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** Spec §3.8 /friends: find by exact email, answer requests, manage friends. Reached from Groups and Profile. */
export function FriendsView({ initial }: { initial: FriendsDTO }) {
  const { data = initial, isPending } = useFriends(initial)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold">Friends</h1>
        <p className="text-muted-foreground">Friends can add each other to groups straight away — no invite link.</p>
      </div>
      {/* grid-cols-1 = minmax(0, 1fr): an implicit auto column grows to a long unbroken email or name and scrolls the page at 320 px. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <FindFriend />
          <Requests data={data} />
        </div>
        {isPending ? <Skeleton className="h-48 rounded-tile" /> : <FriendList friends={data.friends} />}
      </div>
    </div>
  )
}
