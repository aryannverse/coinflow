'use client'
import { Mic } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useAgent } from './agent-provider'

const MAX_MS = 30_000 // spec §4.5
const MIN_MS = 350 // shorter than this was a tap, not speech
type Rec = { recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; timer: number; chunks: Blob[]; cancelled: boolean; startedAt: number }

function teardown(r: Rec, cancel: boolean) {
  r.cancelled = cancel || performance.now() - r.startedAt < MIN_MS
  window.clearTimeout(r.timer)
  cancelAnimationFrame(r.raf)
  if (r.recorder.state !== 'inactive') r.recorder.stop()
  r.stream.getTracks().forEach((t) => t.stop())
  void r.ctx.close()
}

/**
 * Hold to talk (spec §4.7): press and hold (pointer, Space or Enter), release to send, Esc to cancel. A live waveform
 * while recording, or a static level bar under reduced motion. "Listening…"/"Transcribing…" come from the panel status.
 */
export function MicButton({ available }: { available: boolean }) {
  const agent = useAgent()
  const reduced = useReducedMotion()
  const [level, setLevel] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const rec = useRef<Rec | null>(null)
  const holding = useRef(false)
  const recording = agent.chat.state.status === 'listening'

  // Esc cancels a recording wherever focus is. Window capture runs before Radix's document listener, and
  // preventDefault there keeps the panel open: Esc means "never mind that clip", not "close the assistant".
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    release(true)
  })
  useEffect(() => {
    if (!recording) return
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [recording])

  // Unmount (the panel closed mid-recording): stop the microphone and drop the clip.
  useEffect(() => () => {
    holding.current = false
    const r = rec.current
    rec.current = null
    if (r) teardown(r, true)
  }, [])

  async function start() {
    if (!available) return setNote('Voice isn’t available on this assistant. Type instead.')
    if (rec.current || holding.current || agent.chat.state.status !== 'idle') return
    holding.current = true
    agent.chat.setStatus('listening') // spec §4.7: "Listening…" as text at once, before the permission prompt resolves
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      holding.current = false
      agent.chat.setStatus('idle')
      return setNote('The microphone is blocked. Allow it in your browser settings, or type your message.')
    }
    if (!holding.current) {
      // Let go before the microphone opened (often: answering the permission prompt). Nothing was recorded.
      stream.getTracks().forEach((t) => t.stop())
      agent.chat.setStatus('idle')
      return setNote('Hold the mic while you speak, then let go to send.')
    }
    let r: Rec
    let mime = ''
    let analyser: AnalyserNode
    try {
      mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const ctx = new AudioContext()
      analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      r = { recorder, stream, ctx, raf: 0, timer: 0, chunks: [], cancelled: false, startedAt: performance.now() }
    } catch {
      holding.current = false
      stream.getTracks().forEach((t) => t.stop())
      agent.chat.setStatus('idle')
      return setNote('This browser can’t record here. Type your message instead.')
    }
    const buf = new Uint8Array(analyser.frequencyBinCount)
    let last = 0
    const tick = (t: number) => {
      if (t - last > (reduced ? 250 : 50)) {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64))
        last = t
      }
      r.raf = requestAnimationFrame(tick)
    }
    r.raf = requestAnimationFrame(tick)
    r.recorder.ondataavailable = (e) => {
      if (e.data.size) r.chunks.push(e.data)
    }
    r.recorder.onstop = () => void finish(r, r.recorder.mimeType || mime || 'audio/webm')
    r.timer = window.setTimeout(() => release(false), MAX_MS)
    rec.current = r
    r.recorder.start()
    setNote(null)
  }

  function release(cancel: boolean) {
    holding.current = false
    const r = rec.current
    if (!r) return
    rec.current = null
    teardown(r, cancel)
    setLevel(0)
  }

  async function finish(r: Rec, type: string) {
    if (r.cancelled || r.chunks.length === 0) {
      agent.chat.setStatus('idle')
      setNote(r.cancelled ? 'Hold the mic while you speak, then let go to send.' : null)
      return
    }
    agent.chat.setStatus('transcribing')
    const form = new FormData()
    form.append('file', new Blob(r.chunks, { type }), type.includes('mp4') ? 'voice.mp4' : 'voice.webm')
    try {
      const { data } = await api<{ data: { text: string } }>('/agent/stt', { method: 'POST', body: form })
      if (!data.text.trim()) {
        agent.chat.setStatus('idle')
        return setNote('I didn’t catch that. Try again, or type.')
      }
      void agent.chat.send(data.text, { source: 'voice', context: agent.context })
    } catch (err) {
      agent.chat.setStatus('idle')
      setNote(err instanceof ApiError ? err.message : 'Couldn’t turn that into text. Type instead?')
    }
  }

  return (
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        aria-label="Hold to talk"
        aria-pressed={recording}
        aria-disabled={!available || undefined}
        aria-describedby={note ? 'mic-note' : undefined}
        aria-keyshortcuts="Space"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); void start() }}
        onPointerUp={() => release(false)}
        onPointerCancel={() => release(true)}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void start() }
        }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') release(false) }}
        className={cn('grid size-12 shrink-0 touch-none select-none place-items-center rounded-chip border active:scale-[0.97]',
          recording ? 'border-primary bg-primary text-primary-foreground' : 'bg-surface-2 text-foreground', !available && 'opacity-60')}
      >
        <Mic className="size-5" aria-hidden />
      </button>
      {recording && (
        <div aria-hidden className="absolute -top-8 flex h-6 items-center gap-0.5 rounded-full bg-popover px-2 shadow">
          {reduced ? (
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-primary" style={{ width: `${Math.round(level * 100)}%` }} /></span>
          ) : (
            [0.6, 1, 0.8, 1, 0.6].map((k, i) => (
              <span key={i} className="w-1 rounded-full bg-primary transition-transform duration-75" style={{ height: 18, transform: `scaleY(${0.15 + level * k})` }} />
            ))
          )}
        </div>
      )}
      {/* role="alert": announced on insertion, and it keeps the panel's single role="status" line unambiguous. */}
      {note && <p id="mic-note" role="alert" className="absolute bottom-14 left-0 z-10 w-56 rounded-chip border bg-popover p-2 text-xs shadow">{note}</p>}
    </div>
  )
}
