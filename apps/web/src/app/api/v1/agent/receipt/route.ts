import { AppError, invalid } from '@/server/errors'
import { agentFetch, assertUploadSize, relayAgentError } from '@/server/agent-proxy'
import { route, sniffImageType } from '@/server/http'
import type { ReceiptDTO } from '@/lib/api-types'

const MAX_BYTES = 5 * 1024 * 1024 // spec §4.5

/** Receipt photos pass straight through to the agent and are never stored (spec §4.5). */
const tooLarge = () => new AppError('image_too_large', 'That photo is over 5 MB. Try a closer, smaller shot.', 413)

export const POST = route(async ({ req, user }) => {
  assertUploadSize(req, MAX_BYTES, tooLarge)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw invalid('file', 'Choose a photo of the receipt.')
  if (file.size > MAX_BYTES) throw tooLarge()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) throw invalid('file', 'Please use a PNG, JPEG or WebP photo.')
  const out = new FormData()
  out.append('file', new Blob([bytes], { type }), 'receipt')
  const res = await agentFetch(user.id, '/receipt', { method: 'POST', body: out, signal: req.signal })
  if (!res.ok) return relayAgentError(res)
  return { data: (await res.json()) as ReceiptDTO }
})
