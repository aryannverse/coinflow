import { describe, expect, it } from 'vitest'
import { createSSEParser, formatSSE } from './sse'

describe('SSE parser', () => {
  it('handles events split across chunks, ids, comments and multi-line data', () => {
    const p = createSSEParser()
    expect(p.push('event: token\nda')).toEqual([])
    expect(p.push('ta: {"text":"Hi"}\n\n: ping\n\nid: 7\nevent: notification\ndata: a\ndata: b\n\n')).toEqual([
      { event: 'token', data: '{"text":"Hi"}' },
      { event: 'notification', data: 'a\nb', id: '7' },
    ])
  })
  it('decodes bytes and flushes a trailing event with no blank line', () => {
    const p = createSSEParser()
    expect(p.push(new TextEncoder().encode('event: done\ndata: {}'))).toEqual([])
    expect(p.flush()).toEqual([{ event: 'done', data: '{}' }])
  })
  it('round-trips through formatSSE', () => {
    const ev = { event: 'proposal', data: '{"x":1}\n{"y":2}', id: '3' }
    expect(createSSEParser().push(formatSSE(ev))).toEqual([ev])
  })
})
