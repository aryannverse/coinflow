import { describe, expect, it } from 'vitest'
import { directDatabaseUrl, poolOptions, sseMaxMs } from './runtime-config'

const POOLED = 'postgres://u:p@ep-x-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require'
const DIRECT = 'postgres://u:p@ep-x.ap-south-1.aws.neon.tech/neondb?sslmode=require'

describe('deployment runtime config (spec §10)', () => {
  it('LISTEN and migrations use the direct URL when there is one (Neon’s pooler drops LISTEN)', () => {
    expect(directDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT })).toBe(DIRECT)
    expect(directDatabaseUrl({ DATABASE_URL: POOLED })).toBe(POOLED) // local: the one Docker database
    expect(directDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: '' })).toBe(POOLED)
    expect(directDatabaseUrl({})).toBeUndefined()
  })

  it('sizes postgres.js for serverless only on Vercel; local keeps its pool of 10', () => {
    expect(poolOptions({ VERCEL: '1' })).toEqual({ max: 5, idle_timeout: 20, connect_timeout: 10 })
    expect(poolOptions({})).toEqual({ max: 10 })
  })

  it('closes notification streams before Vercel’s 300 s cap, and never locally', () => {
    expect(sseMaxMs({ VERCEL: '1' })).toBe(280_000)
    expect(sseMaxMs({})).toBe(0) // 0 = off
    expect(sseMaxMs({ SSE_MAX_MS: '1500' })).toBe(1500)
    expect(sseMaxMs({ VERCEL: '1', SSE_MAX_MS: '0' })).toBe(0)
    expect(sseMaxMs({ VERCEL: '1', SSE_MAX_MS: 'soon' })).toBe(280_000) // unreadable: the safe default
  })
})
