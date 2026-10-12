import 'server-only'
import postgres from 'postgres'
import { logger } from './logger'
import { directDatabaseUrl } from './runtime-config'

export const NOTIFY_CHANNEL = 'coinflow_notifications'

type Listener = () => void
type Bus = { listeners: Map<string, Set<Listener>>; started: Promise<void> | null; sql: postgres.Sql | null }
const g = globalThis as unknown as { __coinflowBus?: Bus }
const bus: Bus = (g.__coinflowBus ??= { listeners: new Map(), started: null, sql: null })

/** One LISTEN connection per process (it survives Next dev hot reloads); fans `pg_notify(userId)` out to that user's streams. */
function start(): Promise<void> {
  bus.started ??= (async () => {
    const url = directDatabaseUrl() // LISTEN needs a direct connection: Neon's pooler drops it (spec §10)
    if (!url) throw new Error('DATABASE_URL is not set')
    bus.sql = postgres(url, { max: 1 })
    await bus.sql.listen(NOTIFY_CHANNEL, (userId) => {
      for (const fn of bus.listeners.get(userId) ?? []) {
        try {
          fn()
        } catch (err) {
          logger.warn({ err }, 'notification listener failed')
        }
      }
    })
  })().catch((err) => {
    bus.started = null
    throw err
  })
  return bus.started
}

export async function subscribe(userId: string, fn: Listener): Promise<() => void> {
  await start()
  const set = bus.listeners.get(userId) ?? new Set<Listener>()
  set.add(fn)
  bus.listeners.set(userId, set)
  return () => {
    set.delete(fn)
    if (set.size === 0) bus.listeners.delete(userId)
  }
}

/** Tests only: drop the LISTEN connection so the process can exit. */
export async function closeBus(): Promise<void> {
  await bus.sql?.end({ timeout: 1 })
  bus.sql = null
  bus.started = null
  bus.listeners.clear()
}
