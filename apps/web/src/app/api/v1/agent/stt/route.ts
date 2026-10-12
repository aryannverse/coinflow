import { AppError, invalid } from '@/server/errors'
import { agentFetch, assertUploadSize, relayAgentError } from '@/server/agent-proxy'
import { route } from '@/server/http'
import { AUDIO_MAX_BYTES as MAX_BYTES } from '@/lib/upload-limits'

export const maxDuration = 300 // spec §10: Vercel Hobby's cap

const tooLarge = () => new AppError('audio_too_large', 'That recording is too long. Keep it under 30 seconds.', 413)

export const POST = route(async ({ req, user }) => {
  assertUploadSize(req, MAX_BYTES, tooLarge)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) throw invalid('file', 'Record something first.')
  if (file.size > MAX_BYTES) throw tooLarge()
  const out = new FormData()
  out.append('file', file, file.name || 'voice.webm')
  const res = await agentFetch(user.id, '/stt', { method: 'POST', body: out, signal: req.signal, timeoutMs: 30_000 })
  if (!res.ok) return relayAgentError(res)
  return { data: (await res.json()) as { text: string } }
})
