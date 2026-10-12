import { route } from '@/server/http'
import { logger } from '@/server/logger'
import { subscribe } from '@/server/notify-bus'
import { latestSeq, listSince, unreadCount } from '@/server/services/notifications'

export const dynamic = 'force-dynamic'
const PING_MS = 25_000

/**
 * Spec §3.4: push new notification rows over SSE. `id:` is the row's seq, so a reconnecting EventSource resumes with
 * Last-Event-ID and misses nothing. Every wake also sends `sync` (fresh unread count), which lets clients drop rows
 * the server deleted (an undone payment mark). Clients fall back to 30 s polling when this drops.
 */
export const GET = route(async ({ req, user }) => {
  const encoder = new TextEncoder()
  const resumeFrom = Number(req.headers.get('last-event-id'))
  let cursor = Number.isSafeInteger(resumeFrom) && resumeFrom > 0 ? resumeFrom : await latestSeq(user.id)
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
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
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
