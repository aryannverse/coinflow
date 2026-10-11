import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { invalid } from '@/server/errors'
import { route, sniffImageType } from '@/server/http'
import { getStorage } from '@/server/storage'

const MAX_BYTES = 2 * 1024 * 1024
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const

export const POST = route(async ({ req, user }) => {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw invalid('file', 'Choose an image of your UPI QR code.')
  if (file.size > MAX_BYTES) throw invalid('file', 'That image is over 2 MB. Try a smaller screenshot.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) throw invalid('file', 'Please upload a PNG, JPEG or WebP image.')

  const key = `qr/${user.id}/${crypto.randomUUID()}.${EXT[type]}`
  const storage = getStorage()
  await storage.put(key, bytes, type)
  if (user.upiQrUrl) await storage.remove(user.upiQrUrl.replace('/api/v1/files/', ''))
  const [updated] = await getDb().update(users).set({ upiQrUrl: `/api/v1/files/${key}` }).where(eq(users.id, user.id)).returning()
  return { data: updated }
}, { status: 201 })

export const DELETE = route(async ({ user }) => {
  if (user.upiQrUrl) await getStorage().remove(user.upiQrUrl.replace('/api/v1/files/', ''))
  const [updated] = await getDb().update(users).set({ upiQrUrl: null }).where(eq(users.id, user.id)).returning()
  return { data: updated }
})
