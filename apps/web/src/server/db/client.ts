import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(postgres(url, { max: 10 }), { schema })
}

export type Db = ReturnType<typeof create>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const globalForDb = globalThis as unknown as { __coinflowDb?: Db }

/** One pool per process (survives Next dev hot reloads). */
export function getDb(): Db {
  globalForDb.__coinflowDb ??= create()
  return globalForDb.__coinflowDb
}
