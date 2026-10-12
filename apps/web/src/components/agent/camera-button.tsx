'use client'
import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useGroupSheets } from '@/components/groups/group-sheets'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { api, ApiError } from '@/lib/api-client'
import type { ReceiptDTO } from '@/lib/api-types'
import { receiptNotice, receiptToDraft } from '@/lib/proposal-apply'
import { useAgent } from './agent-provider'

const MAX_BYTES = 5 * 1024 * 1024

/** Spec §4.5: a receipt photo fills the itemized canvas (on a group page) or quick add for a single total. */
export function CameraButton({ available }: { available: boolean }) {
  const agent = useAgent()
  const quick = useQuickAdd()
  const sheets = useGroupSheets()
  const input = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<string | null>(null)

  async function scan(file: File) {
    if (file.size > MAX_BYTES) return setNote('That photo is over 5 MB. Try a closer, smaller shot.')
    setNote(null)
    agent.chat.setStatus('reading')
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await api<{ data: ReceiptDTO }>('/agent/receipt', { method: 'POST', body: form })
      agent.chat.setStatus('idle')
      const notice = receiptNotice(data)
      agent.close()
      if (agent.context.groupId) {
        sheets.openExpense({ groupId: agent.context.groupId, prefill: receiptToDraft(data), notice })
      } else {
        quick.open({ type: 'expense', amount: data.totalPaise, note: data.merchant, source: 'scan' })
        if (notice) toast.message(notice)
      }
    } catch (err) {
      agent.chat.setStatus('idle')
      setNote(err instanceof ApiError ? err.message : 'Couldn’t read that receipt. Try a sharper photo.')
    }
  }

  return (
    <div className="relative">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" tabIndex={-1} aria-hidden className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void scan(f)
        }} />
      <button type="button" aria-label="Scan a receipt" aria-disabled={!available || undefined} aria-describedby={note ? 'camera-note' : undefined}
        onClick={() => (available ? input.current?.click() : setNote('Receipt scanning isn’t set up on this assistant.'))}
        className={`grid size-12 shrink-0 place-items-center rounded-chip border bg-surface-2 active:scale-[0.97] ${available ? '' : 'opacity-60'}`}>
        <Camera className="size-5" aria-hidden />
      </button>
      {/* role="alert": announced on insertion, and it keeps the panel's single role="status" line unambiguous. */}
      {note && <p id="camera-note" role="alert" className="absolute bottom-14 left-0 z-10 w-56 rounded-chip border bg-popover p-2 text-xs shadow">{note}</p>}
    </div>
  )
}
