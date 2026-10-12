'use client'
import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useReturnFocus } from '@/components/groups/sheet-frame'
import { useMediaQuery } from '@/hooks/use-media-query'
import { lastFinishedReply, STATUS_TEXT } from '@/lib/agent-chat'
import { useAgent } from './agent-provider'
import { Composer } from './composer'
import { MessageList } from './message-list'
import { speak, useReadAloudPref } from './read-aloud'

/** Spec §4.7: a right-side panel on desktop, a bottom sheet on mobile. */
export function AgentPanel() {
  const agent = useAgent()
  const desktop = useMediaQuery('(min-width: 1024px)') ?? false
  const [readAloud, setReadAloud] = useReadAloudPref()
  const { state } = agent.chat
  const listRef = useRef<HTMLDivElement>(null)
  const focus = useReturnFocus()
  const spoken = useRef<string | null>(null)
  const ttsAvailable = Boolean(agent.health?.capabilities?.tts)
  const reply = lastFinishedReply(state)
  const drafts = state.items.filter((it) => it.role === 'proposal' && it.state === 'pending').length
  const announcement = [reply?.text, drafts ? `${drafts === 1 ? 'One draft' : `${drafts} drafts`} to review: Approve, Edit or Dismiss.` : '']
    .filter(Boolean).join(' ')
  const statusText = state.status === 'thinking' && state.toolLabel ? state.toolLabel : STATUS_TEXT[state.status]

  // DOM-only effects (no setState): keep the newest message in view; read finished replies aloud when asked to.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [state.items])
  useEffect(() => {
    if (!readAloud || !ttsAvailable || !reply || spoken.current === reply.id) return
    spoken.current = reply.id
    void speak(reply.text)
  }, [reply, readAloud, ttsAvailable])

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-14 items-center gap-2 border-b px-4 pr-14">
        <Sparkles className="size-5 text-primary" aria-hidden />
        <DialogTitle className="font-display text-lg">Ask Coinflow</DialogTitle>
        <DialogDescription className="sr-only">Chat, talk or scan a receipt. Nothing is saved until you approve it.</DialogDescription>
        <label className="ml-auto flex min-h-12 items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">Read aloud</span>
          <Switch checked={readAloud && ttsAvailable} disabled={!ttsAvailable} onCheckedChange={setReadAloud} aria-label="Read replies aloud" />
        </label>
        <Button variant="ghost" className="min-h-12 rounded-chip" onClick={agent.chat.reset}>New chat</Button>
      </header>
      {/* aria-live off: tokens stream in word by word, which a screen reader would read as fragments. The finished
          reply (and how many drafts await review) is announced once, below. */}
      <div ref={listRef} role="log" aria-live="off" aria-label="Conversation" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <MessageList items={state.items} />
      </div>
      {/* Spec §4.7: system status as text within 100 ms (Listening…, Transcribing…, Thinking…). */}
      <p id="agent-status" role="status" className="min-h-6 px-4 pb-1 text-sm text-muted-foreground">{statusText}</p>
      <p aria-live="polite" className="sr-only">{state.status === 'idle' ? announcement : ''}</p>
      <Composer />
    </div>
  )
  const close = (
    <DialogClose asChild>
      <Button variant="ghost" className="absolute right-2 top-1 size-12 rounded-chip"><X className="size-5" aria-hidden /><span className="sr-only">Close</span></Button>
    </DialogClose>
  )
  return (
    <Sheet open={agent.isOpen} onOpenChange={(o) => (o ? agent.open() : agent.close())}>
      <SheetContent
        side={desktop ? 'right' : 'bottom'} showCloseButton={false}
        className={desktop ? 'flex max-w-[100vw] flex-col gap-0 p-0 data-[side=right]:w-[440px] data-[side=right]:sm:max-w-[440px]' : 'flex flex-col gap-0 rounded-t-tile p-0 data-[side=bottom]:h-[88dvh]'}
        onOpenAutoFocus={(e) => {
          focus.props.onOpenAutoFocus()
          e.preventDefault()
          document.getElementById('agent-input')?.focus()
        }}
        onCloseAutoFocus={(e) => {
          // Edit/Approve can hand off to another sheet (quick add, a group sheet): leave focus with it.
          if (document.querySelector('[role="dialog"][data-state="open"]')) return e.preventDefault()
          focus.props.onCloseAutoFocus(e)
        }}
      >
        {body}
        {close}
      </SheetContent>
    </Sheet>
  )
}
