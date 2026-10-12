import 'server-only'
import { z } from 'zod'
import type { User } from '@/server/db/schema'
import { requireCurrentUser } from './auth'
import { AppError } from './errors'
import { logger } from './logger'

type Ctx<P> = { req: Request; user: User; params: P; requestId: string }

export function toErrorResponse(err: unknown, requestId: string): Response {
  const headers = { 'x-request-id': requestId, 'cache-control': 'no-store' }
  if (err instanceof AppError) {
    const error = { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) }
    return Response.json({ error, requestId }, { status: err.status, headers })
  }
  if (err instanceof z.ZodError) {
    const issue = err.issues[0]
    const field = issue?.path.join('.') || undefined
    return Response.json(
      { error: { code: 'invalid', message: issue?.message ?? 'Please check your input.', ...(field ? { field } : {}) }, requestId },
      { status: 422, headers },
    )
  }
  logger.error({ err, requestId }, 'unhandled error')
  return Response.json(
    { error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' }, requestId },
    { status: 500, headers },
  )
}

export function route<P extends Record<string, string | string[]> = Record<string, never>>(
  fn: (ctx: Ctx<P>) => Promise<unknown>,
  opts: { status?: number } = {},
) {
  return async (req: Request, segment?: { params: Promise<P> }): Promise<Response> => {
    const requestId = crypto.randomUUID().slice(0, 8)
    try {
      const user = await requireCurrentUser(req)
      const params = (segment ? await segment.params : {}) as P
      const result = await fn({ req, user, params, requestId })
      if (result instanceof Response) {
        result.headers.set('x-request-id', requestId)
        return result
      }
      return Response.json(result ?? { ok: true }, {
        status: opts.status ?? 200,
        headers: { 'x-request-id': requestId, 'cache-control': 'no-store' },
      })
    } catch (err) {
      return toErrorResponse(err, requestId)
    }
  }
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new AppError('invalid_json', 'We couldn’t read that request.', 400)
  }
  return schema.parse(body)
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  return schema.parse(params)
}

export function sniffImageType(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
    return 'image/webp'
  }
  return null
}
