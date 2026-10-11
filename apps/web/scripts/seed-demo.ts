import * as nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

async function main() {
  const email = process.argv[2]
  if (!email) throw new Error('Usage: pnpm db:seed:demo <email-of-a-user-who-has-signed-in>')
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production')
  const { findUserIdByEmail, seedDemoData } = await import('../src/server/services/demo-seed')
  const userId = await findUserIdByEmail(email)
  if (!userId) throw new Error(`No user with email ${email}. Sign in once first.`)
  const result = await seedDemoData(userId)
  console.log(`Seeded ${result.transactions} transactions for ${email}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
