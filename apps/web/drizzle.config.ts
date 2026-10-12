import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'
import { directDatabaseUrl } from './src/server/runtime-config'

loadEnvConfig(process.cwd(), true) // dev mode: never load .env.production*

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  // Migrations run on a direct connection (DATABASE_URL_UNPOOLED on Neon, spec §10); locally that is DATABASE_URL.
  dbCredentials: { url: directDatabaseUrl()! },
  strict: true,
  verbose: true,
})
