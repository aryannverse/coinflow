import { inject } from 'vitest'

process.env.DATABASE_URL = inject('databaseUrl')
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR ?? './test-results/uploads'
