/**
 * Deployment knobs (spec §10), kept free of `server-only` so drizzle.config.ts can use them too.
 * Locally nothing changes: one Docker database, a pool of 10, notification streams that never time out.
 */
type Env = Record<string, string | undefined>

/** Neon's pooler drops LISTEN, so the notification bus and migrations use the direct URL when there is one. */
export function directDatabaseUrl(env: Env = process.env): string | undefined {
  return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
}

/** postgres.js on serverless: a small pool that lets idle connections go (Neon's TLS comes from ?sslmode=require). */
export function poolOptions(env: Env = process.env): { max: number; idle_timeout?: number; connect_timeout?: number } {
  return env.VERCEL ? { max: 5, idle_timeout: 20, connect_timeout: 10 } : { max: 10 }
}

const VERCEL_SSE_MS = 280_000 // Hobby caps a function at 300 s: close cleanly first and let EventSource reconnect

/** How long one notification stream stays open. SSE_MAX_MS overrides; 0 means no limit (the local default). */
export function sseMaxMs(env: Env = process.env): number {
  const fallback = env.VERCEL ? VERCEL_SSE_MS : 0
  const raw = env.SSE_MAX_MS?.trim()
  if (!raw) return fallback
  const ms = Number(raw)
  return Number.isSafeInteger(ms) && ms >= 0 ? ms : fallback
}
