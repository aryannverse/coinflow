import 'server-only'
import { AppError } from './errors'
import { toErrorResponse } from './http'
import { AUD_SERVICE, SERVICE_SUB, bearer, verifyInternalToken } from './internal-token'

/** /api/internal/* handlers: the agent's service token only (plan A9/A12). Never reachable with a user session. */
export function internalRoute(fn: (ctx: { req: Request; requestId: string }) => Promise<unknown>, opts: { status?: number } = {}) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID().slice(0, 8)
    try {
      const token = bearer(req)
      if (!token || verifyInternalToken(token, AUD_SERVICE) !== SERVICE_SUB) throw new AppError('unauthorized', 'Not allowed.', 401)
      const result = await fn({ req, requestId })
      return Response.json(result ?? { ok: true }, { status: opts.status ?? 200, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } })
    } catch (err) {
      return toErrorResponse(err, requestId)
    }
  }
}
