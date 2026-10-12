'use client'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAgent } from './agent-provider'
import { CameraButton } from './camera-button'
import { MicButton } from './mic-button'

export function Composer() {
  const agent = useAgent()
  const busy = agent.chat.state.status !== 'idle'
  const caps = agent.health?.capabilities

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = agent.draft.trim()
    if (!text || busy) return
    agent.setDraft('')
    void agent.chat.send(text, { context: agent.context })
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-1.5 border-t bg-popover p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <CameraButton available={Boolean(caps?.vision)} />
      <MicButton available={Boolean(caps?.stt)} />
      <div className="min-w-0 flex-1">
        <label htmlFor="agent-input" className="sr-only">Message</label>
        <textarea
          id="agent-input" rows={1} maxLength={2000} value={agent.draft} placeholder="Ask, or say “250 lunch with Asha”"
          onChange={(e) => agent.setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          className="max-h-32 min-h-12 w-full resize-none rounded-chip border bg-surface-2 px-3 py-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring"
        />
      </div>
      <Button type="submit" aria-label="Send" aria-disabled={busy || !agent.draft.trim() || undefined} className="size-12 shrink-0 rounded-chip active:scale-[0.97]">
        <ArrowUp className="size-5" aria-hidden />
      </Button>
    </form>
  )
}
