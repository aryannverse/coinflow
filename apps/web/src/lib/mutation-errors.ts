import { ApiError } from './api-client'

export type ErrorToast = { message: string; description: string | undefined; retry: boolean }

/**
 * What useLedgerMutation shows when a save fails, or null when something else already shows it: a field error (the
 * form, inline), signed out (the session handler), or a save started from an agent proposal chip (`chip`), whose
 * failed state and Approve button are the single way to retry. A toast Retry next to it could save the same thing twice.
 */
export function ledgerErrorToast(err: unknown, opts: { chip?: boolean } = {}): ErrorToast | null {
  if (err instanceof ApiError && (err.status === 401 || err.field)) return null
  if (opts.chip) return null
  return {
    message: err instanceof ApiError ? err.message : 'Something went wrong.',
    description: err instanceof ApiError && err.requestId ? `Ref ${err.requestId}` : undefined,
    // A still-saving temp id can never succeed on retry, so that message stands alone.
    retry: !(err instanceof ApiError && err.code === 'still_saving'),
  }
}
