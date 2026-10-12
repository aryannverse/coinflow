import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Spec §4.2 internal token: HMAC-SHA256 JWT with AGENT_SHARED_SECRET, sub = userId, exp = 10 min, aud = 'agent'.
 * Same bytes as PyJWT in apps/agent (both test suites pin one vector). Service calls from the coach use
 * aud = 'coinflow-internal', sub = 'svc:agent' (plan A12). A missing secret disables the whole path.
 */
export const AUD_USER = 'agent'
export const AUD_SERVICE = 'coinflow-internal'
export const SERVICE_SUB = 'svc:agent'
const TTL_S = 600
const MAX_TOKEN_CHARS = 2048
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')

const envKey = () => process.env.AGENT_SHARED_SECRET || null
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const hmac = (data: string, key: string) => createHmac('sha256', key).update(data).digest('base64url')

export function signInternalToken(sub: string, opts: { aud?: string; nowSec?: number; ttlSec?: number; key?: string } = {}): string {
  const key = opts.key ?? envKey()
  if (!key) throw new Error('AGENT_SHARED_SECRET is not set')
  const iat = opts.nowSec ?? Math.floor(Date.now() / 1000)
  const body = `${HEADER}.${b64({ sub, aud: opts.aud ?? AUD_USER, iat, exp: iat + (opts.ttlSec ?? TTL_S) })}`
  return `${body}.${hmac(body, key)}`
}

/** The subject, or null for anything we did not sign, expired, or meant for another audience. Never throws. */
export function verifyInternalToken(token: string, aud: string, opts: { nowSec?: number; key?: string } = {}): string | null {
  const key = opts.key ?? envKey()
  if (!key || token.length > MAX_TOKEN_CHARS) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const expected = Buffer.from(hmac(`${h}.${p}`, key))
  const given = Buffer.from(s)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  let header: { alg?: unknown }
  let claims: { sub?: unknown; aud?: unknown; exp?: unknown }
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'))
    claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
  if (header.alg !== 'HS256' || claims.aud !== aud || typeof claims.exp !== 'number' || claims.exp <= now) return null
  if (typeof claims.sub !== 'string' || !claims.sub) return null
  if (aud === AUD_USER && claims.sub.startsWith('svc:')) return null
  return claims.sub
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization')
  return h?.startsWith('Bearer ') ? h.slice(7).trim() || null : null
}
