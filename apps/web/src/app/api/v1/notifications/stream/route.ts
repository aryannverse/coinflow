import { route } from '@/server/http'
import { logger } from '@/server/logger'
import { subscribe } from '@/server/notify-bus'
import { sseMaxMs } from '@/server/runtime-config'
import { latestSeq, listSince, unreadCount } from '@/server/services/notifications'

export const dynamic = 'force-dynamic'
// Spec §10: Vercel Hobby caps a function at 300 s. The stream ends itself first (SSE_MAX_MS, 280 s on Vercel, off
// locally) with a retry hint and its position, so EventSource reconnects and resumes from Last-Event-ID.
export const maxDuration = 300
const PING_MS = 25_000
const RETRY_MS = 2_000

/** A Last-Event-ID the client sent back (0 included: "nothing seen yet"), or null when there is none. */
function resumePoint(header: string | null): number | null {
  if (header === null || header.trim() === '') return null
  const n = Number(header)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/**
 * Spec §3.4: push new notification rows over SSE. `id:` is the row's seq, so a reconnecting EventSource resumes with
 * Last-Event-ID and misses nothing. Every wake also sends `sync` (fresh unread count), which lets clients drop rows
 * the server deleted (an undone payment mark). Clients fall back to 30 s polling when this drops.
 */
export const GET = route(async ({ req, user }) => {
  const encoder = new TextEncoder()
  let cursor = resumePoint(req.headers.get('last-event-id')) ?? (await latestSeq(user.id))
  const maxMs = sseMaxMs()
  let closed = false
  let cleanup = () => {}

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text))
      }
      const send = (event: string, data: unknown, id?: number) =>
        write(`${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      let queue = Promise.resolve()
      const drain = () => {
        queue = queue.then(async () => {
          if (closed) return
          for (const row of await listSince(user.id, cursor)) {
            cursor = row.seq
            send('notification', row, row.seq)
          }
          send('sync', { unreadCount: await unreadCount(user.id) })
        }).catch((err) => logger.warn({ err }, 'notification stream drain failed'))
      }

      const unsubscribe = await subscribe(user.id, drain)
      const ping = setInterval(() => write(': ping\n\n'), PING_MS)
      // After any drain in flight, so the id written is the last row actually sent. An id-only block sets the
      // client's Last-Event-ID without firing an event.
      const expire = maxMs > 0
        ? setTimeout(() => {
          queue = queue.then(() => {
            write(`retry: ${RETRY_MS}\nid: ${cursor}\n\n`)
            cleanup()
          })
        }, maxMs)
        : undefined
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        clearTimeout(expire)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed by the client
        }
      }
      req.signal.addEventListener('abort', cleanup, { once: true })
      send('ready', { unreadCount: await unreadCount(user.id) })
      drain() // anything that landed between the client's last event and this subscribe
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
})
