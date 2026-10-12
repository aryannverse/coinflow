import { notFound } from '@/server/errors'
import { route } from '@/server/http'
import { sharesGroupWith } from '@/server/services/groups/permissions'
import { getStorage } from '@/server/storage'

export const GET = route<{ key: string[] }>(async ({ user, params }) => {
  const key = params.key.join('/')
  // qr/<ownerId>/<file>: the owner, or anyone in a group with them (settle up shows the payee's QR, spec §3.5).
  const [prefix, ownerId] = key.split('/')
  if (prefix !== 'qr' || !ownerId || !(await sharesGroupWith(user.id, ownerId))) throw notFound('file')
  const file = await getStorage().get(key)
  if (!file) throw notFound('file')
  return new Response(file.data as BodyInit, {
    headers: { 'content-type': file.contentType, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
  })
})
