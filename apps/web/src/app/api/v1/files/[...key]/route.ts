import { notFound } from '@/server/errors'
import { route } from '@/server/http'
import { getStorage } from '@/server/storage'

export const GET = route<{ key: string[] }>(async ({ user, params }) => {
  const key = params.key.join('/')
  // Part A: a user may only read their own uploads. Part B widens this to group members.
  if (!key.startsWith(`qr/${user.id}/`)) throw notFound('file')
  const file = await getStorage().get(key)
  if (!file) throw notFound('file')
  return new Response(file.data as BodyInit, {
    headers: { 'content-type': file.contentType, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
  })
})
