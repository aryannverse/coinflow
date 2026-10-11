import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { invalid } from '@/server/errors'
import { route, sniffImageType } from '@/server/http'
import { logger } from '@/server/logger'
import { getStorage } from '@/server/storage'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_BODY_BYTES = MAX_BYTES + 64 * 1024 // multipart overhead allowance
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const
const FILES_PREFIX = '/api/v1/files/'
const tooBig = () => invalid('file', 'That image is over 2 MB. Try a smaller screenshot.')

async function removeQuietly(key: string, requestId: string): Promise<void> {
  try {
    await getStorage().remove(key)
  } catch (err) {
    logger.warn({ err, requestId, key }, 'old QR cleanup failed')
  }
}

export const POST = route(async ({ req, user, requestId }) => {
  const declared = Number(req.headers.get('content-length'))
  if (declared > MAX_BODY_BYTES) throw tooBig()
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw invalid('file', 'Choose an image of your UPI QR code.')
  if (file.size > MAX_BYTES) throw tooBig()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) throw invalid('file', 'Please upload a PNG, JPEG or WebP image.')

  const key = `qr/${user.id}/${crypto.randomUUID()}.${EXT[type]}`
  await getStorage().put(key, bytes, type)
  let updated
  try {
    ;[updated] = await getDb().update(users).set({ upiQrUrl: `${FILES_PREFIX}${key}` }).where(eq(users.id, user.id)).returning()
  } catch (err) {
    await removeQuietly(key, requestId) // don't orphan the new file
    throw err
  }
  if (user.upiQrUrl) await removeQuietly(user.upiQrUrl.replace(FILES_PREFIX, ''), requestId)
  return { data: updated }
}, { status: 201 })

export const DELETE = route(async ({ user, requestId }) => {
  const [updated] = await getDb().update(users).set({ upiQrUrl: null }).where(eq(users.id, user.id)).returning()
  if (user.upiQrUrl) await removeQuietly(user.upiQrUrl.replace(FILES_PREFIX, ''), requestId)
  return { data: updated }
})
