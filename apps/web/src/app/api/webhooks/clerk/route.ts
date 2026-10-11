import type { NextRequest } from 'next/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { deleteUser, upsertUserFromProfile } from '@/server/services/users'

interface ClerkWebhookUser {
  id: string
  first_name: string | null
  last_name: string | null
  image_url: string | null
  primary_email_address_id: string | null
  email_addresses: { id: string; email_address: string }[]
}

export async function POST(req: Request) {
  let evt: { type: string; data: unknown }
  try {
    evt = await verifyWebhook(req as NextRequest)
  } catch {
    return Response.json({ error: { code: 'bad_signature', message: 'Webhook signature check failed.' } }, { status: 400 })
  }

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const u = evt.data as ClerkWebhookUser
    const email =
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ?? u.email_addresses[0]?.email_address
    if (email) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || email.split('@')[0]
      await upsertUserFromProfile({ id: u.id, email, name, avatarUrl: u.image_url })
    }
  } else if (evt.type === 'user.deleted') {
    const { id } = evt.data as { id?: string }
    if (id) await deleteUser(id)
  }
  return Response.json({ ok: true })
}
