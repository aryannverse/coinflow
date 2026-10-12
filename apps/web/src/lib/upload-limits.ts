/**
 * Upload caps (spec §10). Vercel refuses request bodies over 4.5 MB, so receipts and voice notes stop at 4 MB on the
 * browser, the web proxy and the agent alike.
 */
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024
export const AUDIO_MAX_BYTES = 4 * 1024 * 1024
export const RECEIPT_TOO_LARGE = 'That photo is over 4 MB. Try a closer, smaller shot.'
/** Receipt photos are redrawn with their longest side at most this many pixels before upload. */
export const RECEIPT_MAX_SIDE = 2000

export function fitWithin(width: number, height: number, maxSide = RECEIPT_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
