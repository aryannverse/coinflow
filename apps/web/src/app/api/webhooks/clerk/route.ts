import type { NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { z } from 'zod'
import { AppError } from '@/server/errors'
import { deleteUser, upsertUserFromProfile } from '@/server/services/users'

const clerkWebhookUser = z.object({
  id: z.string().min(1),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  image_url: z.string().nullable(),
  primary_email_address_id: z.string().nullable(),
  email_addresses: z.array(z.object({ id: z.string(), email_address: z.string() })),
})

export async function POST(req: Request) {
  let evt: { type: string; data: unknown }
  try {
    evt = await verifyWebhook(req as NextRequest)
  } catch (err) {
    console.error('[clerk-webhook] signature verification failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: { code: 'bad_signature', message: 'Webhook signature check failed.' } }, { status: 400 })
  }

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const parsed = clerkWebhookUser.safeParse(evt.data)
    if (!parsed.success) {
      console.error(`[clerk-webhook] malformed ${evt.type} payload:`, parsed.error.message)
      return Response.json({ ok: true, ignored: 'malformed' })
    }
    const u = parsed.data
    const email =
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ?? u.email_addresses[0]?.email_address
    if (email) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || email.split('@')[0]
      try {
        await upsertUserFromProfile({ id: u.id, email, name, avatarUrl: u.image_url })
      } catch (err) {
        if (err instanceof AppError && err.code === 'email_in_use') {
          console.error(`[clerk-webhook] skipped ${evt.type} for ${u.id}: ${err.message}`)
          return Response.json({ ok: true, skipped: 'email_in_use' })
        }
        throw err
      }
    }
  } else if (evt.type === 'user.deleted') {
    const { id } = evt.data as { id?: string }
    if (id) await deleteUser(id)
  }
  return Response.json({ ok: true })
}
