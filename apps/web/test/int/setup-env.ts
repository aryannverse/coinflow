import { inject } from 'vitest'

process.env.DATABASE_URL = inject('databaseUrl')
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR ?? './test-results/uploads'
process.env.INVITE_SECRET ??= 'coinflow-test-invite-secret-0123456789'
process.env.APP_URL ??= 'http://localhost:3000'
