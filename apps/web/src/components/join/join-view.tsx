'use client'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FIELD } from '@/components/groups/field'
import { MemberAvatar } from '@/components/groups/member-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError } from '@/lib/api-client'
import type { InvitePreviewDTO } from '@/lib/api-types'
import { dateRange } from '@/lib/group-display'
import type { ClaimBody } from '@/lib/schemas/groups'

const NEW = 'new'
const ROW = 'flex min-h-14 cursor-pointer items-center gap-3 rounded-chip border bg-card px-4 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring'

/** "Which one is you?" (spec §3.3): pick a placeholder, or "I’m not listed" to join under a new name. */
export function JoinView({ token, preview, defaultName }: { token: string; preview: InvitePreviewDTO; defaultName: string }) {
  const router = useRouter()
  const [choice, setChoice] = useState<string>(preview.placeholders[0]?.id ?? NEW)
  const [newName, setNewName] = useState(defaultName)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const claim = useMutation({
    mutationFn: (body: ClaimBody) => api<{ data: { groupId: string; memberId: string } }>(`/join/${token}`, { method: 'POST', json: body }),
  })
  const range = dateRange(preview.group.startsOn, preview.group.endsOn)

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (claim.isPending) return
    if (choice === NEW && !newName.trim()) return setError({ field: 'newName', message: 'Add the name your friends know you by.' })
    try {
      const { data } = await claim.mutateAsync(choice === NEW ? { newName: newName.trim() } : { memberId: choice })
      router.replace(`/groups/${data.groupId}`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_member') return router.replace(`/groups/${preview.group.id}`)
      if (err instanceof ApiError) {
        setError({ field: err.field, message: err.message })
        if (err.code === 'already_claimed') router.refresh() // reload the list without the taken name
      } else {
        setError({ message: 'Couldn’t join. Check your connection and try again.' })
      }
    }
  }

  return (
    <form onSubmit={join} noValidate className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden className="grid size-16 place-items-center rounded-tile bg-surface-2 text-3xl">{preview.group.emoji}</span>
        <h1 className="font-display text-2xl font-bold">Join {preview.group.name}</h1>
        {range && <p className="text-sm text-muted-foreground">{range}</p>}
      </header>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-display text-lg">Which one is you?</legend>
        {preview.placeholders.map((p) => (
          <label key={p.id} className={ROW}>
            <input type="radio" name="who" value={p.id} checked={choice === p.id} className="size-5 accent-[var(--primary)]"
              onChange={() => { setChoice(p.id); setError(null) }} />
            <MemberAvatar name={p.displayName} claimed={false} size={36} />
            <span>{p.displayName}</span>
          </label>
        ))}
        <label className={ROW}>
          <input type="radio" name="who" value={NEW} checked={choice === NEW} className="size-5 accent-[var(--primary)]"
            onChange={() => { setChoice(NEW); setError(null) }} />
          <span>I’m not listed</span>
        </label>
        {choice === NEW && (
          <div className="mt-2">
            <Label htmlFor="join-name">Your name in this group</Label>
            <Input id="join-name" value={newName} maxLength={60} className={`${FIELD} mt-1`}
              aria-invalid={error?.field === 'newName' || undefined} aria-describedby={error?.field === 'newName' ? 'join-error' : undefined}
              onChange={(e) => { setNewName(e.target.value); setError(null) }} />
          </div>
        )}
      </fieldset>
      {error && <p id="join-error" role="alert" className="text-sm text-neutral-negative">{error.message}</p>}
      <Button type="submit" aria-disabled={claim.isPending || undefined} className="min-h-14 rounded-chip text-base active:scale-[0.97]">
        {claim.isPending ? 'Joining…' : 'Join group'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">You’ll see your share of every expense. Your own Coinflow stays private.</p>
    </form>
  )
}
