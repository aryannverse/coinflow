/** Minimal Server-Sent Events codec shared by the Next proxy (server) and the agent panel (browser). */
export type SSEEvent = { event: string; data: string; id?: string }

function parseBlock(block: string): SSEEvent | null {
  let event = 'message'
  let id: string | undefined
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const i = line.indexOf(':')
    const field = i === -1 ? line : line.slice(0, i)
    let value = i === -1 ? '' : line.slice(i + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    else if (field === 'id') id = value
  }
  return data.length ? { event, data: data.join('\n'), ...(id !== undefined ? { id } : {}) } : null
}

export function createSSEParser() {
  const decoder = new TextDecoder()
  let buf = ''
  return {
    push(chunk: Uint8Array | string): SSEEvent[] {
      buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      buf = buf.replace(/\r\n/g, '\n')
      const out: SSEEvent[] = []
      for (let i = buf.indexOf('\n\n'); i !== -1; i = buf.indexOf('\n\n')) {
        const ev = parseBlock(buf.slice(0, i))
        buf = buf.slice(i + 2)
        if (ev) out.push(ev)
      }
      return out
    },
    flush(): SSEEvent[] {
      const ev = buf.trim() ? parseBlock(buf) : null
      buf = ''
      return ev ? [ev] : []
    },
  }
}

export const formatSSE = (e: SSEEvent) =>
  `${e.id !== undefined ? `id: ${e.id}\n` : ''}event: ${e.event}\n${e.data.split('\n').map((l) => `data: ${l}`).join('\n')}\n\n`
