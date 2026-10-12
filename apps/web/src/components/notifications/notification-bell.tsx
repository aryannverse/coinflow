'use client'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, HandCoins, Receipt, Sparkles, UserPlus, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { gk, useAcceptFriend, useDropFriendRequest, useMarkAllRead, useMarkRead, useNotifications, useResolveSettlement } from '@/hooks/group-queries'
import type { NotificationDTO } from '@/lib/api-types'
import { cn } from '@/lib/utils'
import { useNotificationStream } from './notification-stream'

/** Kind → icon. A component (not a function returning one), so React never re-creates it per render. */
export function NotificationIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind.startsWith('settlement_')) return <HandCoins className={className} aria-hidden />
  if (kind.startsWith('expense_')) return <Receipt className={className} aria-hidden />
  if (kind === 'member_claimed' || kind === 'friend_request' || kind === 'friend_accepted') return <UserPlus className={className} aria-hidden />
  if (kind === 'group_added') return <UsersRound className={className} aria-hidden />
  if (kind.startsWith('coach_')) return <Sparkles className={className} aria-hidden />
  return <Bell className={className} aria-hidden />
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

function Item({ n, onNavigate }: { n: NotificationDTO; onNavigate: () => void }) {
  const markRead = useMarkRead()
  const resolve = useResolveSettlement()
  const settlementId = typeof n.payload.settlementId === 'string' ? n.payload.settlementId : null
  const actionable = n.kind === 'settlement_marked' && !n.actedAt && settlementId
  const requestId = typeof n.payload.requestId === 'string' ? n.payload.requestId : null
  const friendAsk = n.kind === 'friend_request' && !n.actedAt && requestId
  const fromName = typeof n.payload.fromName === 'string' ? n.payload.fromName : 'them'
  const accept = useAcceptFriend()
  const drop = useDropFriendRequest()
  // Acting removes the buttons; keep focus on this notification instead of dropping it to <body>.
  const link = useRef<HTMLAnchorElement>(null)
  const keepFocus = { onSuccess: () => link.current?.focus() }
  return (
    <li className="border-b px-3 py-2 last:border-b-0">
      <Link ref={link} href={n.href ?? '/groups'} onClick={() => { if (!n.readAt) markRead.mutate(n.id); onNavigate() }}
        className="flex min-h-12 items-start gap-3 rounded-chip p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <NotificationIcon kind={n.kind} className="mt-0.5 size-5 shrink-0 text-primary" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('text-sm', !n.readAt && 'font-semibold')}>{n.title}{!n.readAt && <span className="sr-only"> (unread)</span>}</span>
          {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
          <span className="text-xs text-muted-foreground">{ago(n.createdAt)}</span>
        </span>
        {!n.readAt && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
      </Link>
      {actionable && (
        <div className="mt-1 flex gap-2 pl-9">
          <Button size="sm" className="min-h-12 rounded-chip active:scale-[0.97]" aria-disabled={resolve.isPending || undefined}
            onClick={() => { if (!resolve.isPending) resolve.mutate({ settlementId, decision: 'confirm' }, keepFocus) }}>Confirm</Button>
          <Button size="sm" variant="outline" className="min-h-12 rounded-chip active:scale-[0.97]" aria-disabled={resolve.isPending || undefined}
            onClick={() => { if (!resolve.isPending) resolve.mutate({ settlementId, decision: 'reject' }, keepFocus) }}>Not received</Button>
        </div>
      )}
      {friendAsk && (
        <div className="mt-1 flex gap-2 pl-9">
          <Button size="sm" className="min-h-12 rounded-chip active:scale-[0.97]" aria-disabled={accept.isPending || undefined}
            onClick={() => { if (!accept.isPending) accept.mutate({ requestId, name: fromName }, keepFocus) }}>Accept</Button>
          <Button size="sm" variant="outline" className="min-h-12 rounded-chip active:scale-[0.97]" aria-disabled={drop.isPending || undefined}
            onClick={() => { if (!drop.isPending) drop.mutate({ requestId, label: 'Request declined' }, keepFocus) }}>Decline</Button>
        </div>
      )}
    </li>
  )
}

/** TopBar bell (spec §3.4): unread count, aria-live polite announcement, list with Confirm / Not received. */
export function NotificationBell() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const live = useNotificationStream(() => {
    void qc.invalidateQueries({ queryKey: gk.notifications })
    void qc.invalidateQueries({ queryKey: gk.all }) // a confirmed payment or a co-member's edit changes balances
  })
  const list = useNotifications(live ? false : 30_000)
  const markAll = useMarkAllRead()
  const unread = list.data?.unreadCount ?? 0
  const items = list.data?.data ?? []
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="relative size-12 rounded-chip active:scale-[0.97]" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
            <Bell className="size-5" aria-hidden />
            {unread > 0 && (
              <span aria-hidden className="absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-[11px] font-semibold text-primary-foreground">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
          <div className="flex min-h-12 items-center justify-between border-b px-3">
            <p className="font-display text-sm font-semibold">Notifications</p>
            {unread > 0 && <Button variant="ghost" size="sm" className="min-h-12" onClick={() => markAll.mutate()}>Mark all read</Button>}
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing yet. Payments, edits and nudges show up here.</p>
          ) : (
            <ul className="max-h-[60dvh] overflow-y-auto">{items.map((n) => <Item key={n.id} n={n} onNavigate={() => setOpen(false)} />)}</ul>
          )}
        </PopoverContent>
      </Popover>
      {/* Spec §3.4: the count is announced politely whenever it changes (stream or polling). */}
      <p aria-live="polite" className="sr-only">{unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : ''}</p>
    </>
  )
}
