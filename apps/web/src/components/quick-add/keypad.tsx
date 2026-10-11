'use client'
import { Delete } from 'lucide-react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

/** On-screen amount pad for touch. Hidden on desktop, where the real keyboard types into the amount field. */
export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div role="group" aria-label="Number pad" className="grid grid-cols-3 gap-2 lg:hidden">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
          className="grid min-h-12 place-items-center rounded-chip bg-surface-2 font-display text-xl outline-none transition active:scale-[0.95] active:bg-accent focus-visible:ring-3 focus-visible:ring-ring"
        >
          {k === 'back' ? <Delete className="size-5" aria-hidden /> : k}
        </button>
      ))}
    </div>
  )
}
