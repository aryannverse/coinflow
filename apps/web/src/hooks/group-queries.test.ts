import { describe, expect, it } from 'vitest'
import { STREAM_KEYS } from './group-queries'
import { qk } from './queries'

describe('live notification stream', () => {
  it('refreshes Home too: a co-member’s edit moves my mirrors and Safe-to-Spend, not just the bell and the group', () => {
    expect(STREAM_KEYS).toEqual(expect.arrayContaining([['notifications'], ['groups'], qk.sts, ['transactions']]))
  })
})
