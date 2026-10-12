'use client'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useGroup } from '@/hooks/group-queries'
import type { GroupDetailDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import { reminderText, whatsappLink } from '@/lib/reminder'
import { cn } from '@/lib/utils'
import { SheetFrame } from './sheet-frame'

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

/** The message is the user's: prefilled from spec §3.5's polite nudge, editable, then copied or shared by them. */
function ReminderBody({ group, fromMemberId, amountPaise }: { group: GroupDetailDTO; fromMemberId: string; amountPaise: number }) {
  const debtor = group.members.find((m) => m.id === fromMemberId)
  const me = group.members.find((m) => m.isMe)
  const name = debtor?.displayName ?? 'them'
  // Initialised once per opening (the frame keys this body by its open count).
  const [text, setText] = useState(() => reminderText({ toName: name, amountPaise, groupName: group.name, myUpiId: me?.upiId ?? null }))
  const [status, setStatus] = useState('')
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setStatus('Message copied')
    } catch {
      setStatus('Couldn’t copy. Select the message and copy it yourself.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 lg:px-6 lg:pb-6">
      <div className="flex flex-col gap-1 pr-12">
        <DialogTitle className="font-display text-xl">Remind {firstName(name)}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          <span className="amount">{formatINR(amountPaise)}</span> · {group.emoji} {group.name}
        </DialogDescription>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reminder-text">Message</Label>
        <Textarea
          id="reminder-text" aria-label="Reminder message" rows={4} value={text} maxLength={500}
          onChange={(e) => { setText(e.target.value); setCopied(false) }}
          className="min-h-28 rounded-chip bg-surface-2 text-base"
        />
        <p className="text-sm text-muted-foreground">Change anything you like before you send it.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={() => void copy()} className="min-h-12 flex-1 gap-2 rounded-chip active:scale-[0.97]">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} Copy message
        </Button>
        <a
          href={whatsappLink(text)} target="_blank" rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-12 flex-1 gap-2 rounded-chip active:scale-[0.97]')}
        >
          <MessageCircle className="size-4" aria-hidden /> Share via WhatsApp<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <p role="status" className="sr-only">{status}</p>
      {status && status !== 'Message copied' && <p className="text-sm text-neutral-negative">{status}</p>}
      <p className="text-xs text-muted-foreground">Coinflow never sends messages for you.</p>
    </div>
  )
}

export function ReminderSheet({ open, openCount, groupId, fromMemberId, amountPaise, onClose }: {
  open: boolean; openCount: number; groupId: string; fromMemberId: string; amountPaise: number; onClose: () => void
}) {
  const group = useGroup(groupId)
  return (
    <SheetFrame open={open} onClose={onClose} initialFocus="#reminder-text">
      {group.data ? (
        <ReminderBody key={openCount} group={group.data} fromMemberId={fromMemberId} amountPaise={amountPaise} />
      ) : (
        <div className="p-6">
          <DialogTitle className="sr-only">Send a reminder</DialogTitle>
          <DialogDescription className="sr-only">Loading</DialogDescription>
          <p role="status">Loading…</p>
        </div>
      )}
    </SheetFrame>
  )
}
