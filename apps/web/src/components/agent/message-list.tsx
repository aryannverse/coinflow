'use client'
import { Camera, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatItem } from '@/lib/agent-chat'
import { cn } from '@/lib/utils'
import { useAgent } from './agent-provider'
import { ProposalChip } from './proposal-chip'

const HINTS = ['What can I spend today?', '250 lunch with Asha', 'Plan a Goa trip for 5 on ₹40k', 'Remind Ravi about the cab']

export function MessageList({ items }: { items: ChatItem[] }) {
  const agent = useAgent()
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3 py-4">
        <p className="text-sm text-muted-foreground">Ask about your money, or tell me what you spent. I draft things; you approve them.</p>
        <div className="flex flex-wrap gap-2">
          {HINTS.map((h) => (
            <Button key={h} variant="outline" className="min-h-12 rounded-chip text-sm" onClick={() => agent.setDraft(h)}>{h}</Button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <ol className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.id}>
          {it.role === 'user' && (
            <p className="ml-auto max-w-[85%] rounded-tile rounded-br-md bg-primary/15 px-3 py-2 text-sm">
              <span className="sr-only">You said: </span>
              {it.source === 'voice' && <Mic className="mr-1 inline size-3.5 text-muted-foreground" aria-label="by voice" />}
              {it.source === 'scan' && <Camera className="mr-1 inline size-3.5 text-muted-foreground" aria-label="from a receipt" />}
              {it.text}
            </p>
          )}
          {it.role === 'assistant' && (
            <p className={cn('max-w-[90%] whitespace-pre-wrap rounded-tile rounded-bl-md bg-surface-2 px-3 py-2 text-sm', !it.done && 'opacity-90')}>
              <span className="sr-only">Coinflow: </span>{it.text}
            </p>
          )}
          {it.role === 'proposal' && <ProposalChip item={it} />}
          {it.role === 'error' && (
            <div role="alert" className="rounded-tile border border-dashed p-3 text-sm">
              <p>{it.message}</p>
              {it.retry && (
                <Button variant="outline" className="mt-2 min-h-12 rounded-chip"
                  onClick={() => void agent.chat.send(it.retry!.text, { source: it.retry!.source, context: agent.context })}>Retry</Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
