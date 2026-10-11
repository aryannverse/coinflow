'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageUp } from 'lucide-react'
import Image from 'next/image'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { qk, useMe } from '@/hooks/queries'
import { api, ApiError } from '@/lib/api-client'
import type { MeDTO } from '@/lib/api-types'

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']
const TOO_BIG = 'That image is over 2 MB. Try a smaller screenshot.'
const WRONG_TYPE = 'Please upload a PNG, JPEG or WebP image.'

/**
 * Upload, replace or remove the UPI QR image. Shared by onboarding and Profile.
 * There is no undo: the endpoints return `{ data }` without an auditId. A 401 is handled by the
 * mutation cache (sign-in redirect), so it shows no message here; server errors (2 MB, type, 422 `file`) show inline.
 */
export function UpiQrUpload() {
  const { data: me } = useMe()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLButtonElement>(null)
  const errorId = useId()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const save = useMutation({
    retry: false,
    mutationFn: (file: File) => {
      const form = new FormData()
      form.set('file', file)
      return api<{ data: MeDTO }>('/me/upi-qr', { method: 'POST', body: form }).then((r) => r.data)
    },
    onSuccess: (next) => qc.setQueryData(qk.me, next),
  })
  const remove = useMutation({
    retry: false,
    mutationFn: () => api<{ data: MeDTO }>('/me/upi-qr', { method: 'DELETE' }).then((r) => r.data),
    onSuccess: (next) => qc.setQueryData(qk.me, next),
  })
  const busy = save.isPending || remove.isPending

  function fail(err: unknown) {
    // A 401 already sent the user to sign-in; everything else is explained here, beside the control.
    if (err instanceof ApiError && err.status === 401) return
    setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.')
    pick.current?.focus()
  }

  function upload(file: File) {
    setError(null)
    setNote('')
    if (file.size > MAX_BYTES) return fail(new ApiError('file_too_big', TOO_BIG, 422, 'file'))
    if (file.type && !TYPES.includes(file.type)) return fail(new ApiError('file_type', WRONG_TYPE, 422, 'file'))
    save.mutate(file, { onError: fail, onSuccess: () => setNote('UPI QR saved.') })
  }

  const qr = me?.upiQrUrl
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-tile border bg-surface-2">
        {qr ? (
          <Image src={qr} alt="Your UPI QR code" width={112} height={112} unoptimized className="size-full object-contain" />
        ) : (
          <ImageUp className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="UPI QR image file"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload(file)
            e.target.value = ''
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            ref={pick}
            type="button"
            variant="secondary"
            className="min-h-12 rounded-chip px-4 active:scale-[0.97]"
            aria-disabled={busy || undefined}
            aria-describedby={error ? errorId : undefined}
            onClick={() => {
              if (!busy) input.current?.click()
            }}
          >
            {save.isPending ? 'Uploading…' : qr ? 'Replace QR' : 'Upload QR image'}
          </Button>
          {qr && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 rounded-chip px-4 active:scale-[0.97]"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (busy) return
                setError(null)
                setNote('')
                remove.mutate(undefined, {
                  onError: fail,
                  onSuccess: () => {
                    setNote('UPI QR removed.')
                    pick.current?.focus() // the Remove button just left the page
                  },
                })
              }}
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Friends see it when settling up (Groups, coming soon).</p>
        <p role="status" className="sr-only">
          {note}
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-neutral-negative">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
