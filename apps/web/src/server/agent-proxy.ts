import 'server-only'
import { expenseMemberIds, groupExpenseInputSchema } from '@/lib/schemas/groups'
import { proposalSchema } from '@/lib/schemas/proposals'
import { checkPayers, computeSplit } from '@/lib/split'
import { createSSEParser, formatSSE, type SSEEvent } from '@/lib/sse'
import { AppError } from './errors'
import { signInternalToken } from './internal-token'
import { getGroup } from './services/groups/groups'

export const agentUrl = () => process.env.AGENT_URL ?? 'http://127.0.0.1:8100'
/** Spec §4.7: when the agent is down or unconfigured the app says so plainly and everything else keeps working. */
export const agentOffline = () => new AppError('agent_offline', 'Assistant offline. Everything else still works.', 503)
export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

/** Calls the agent as `userId` with a fresh 10-minute internal token. Network failure → agent_offline (503). */
export async function agentFetch(userId: string, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  if (!process.env.AGENT_SHARED_SECRET) throw agentOffline()
  const { timeoutMs = 65_000, signal, headers, ...rest } = init
  const timeout = AbortSignal.timeout(timeoutMs)
  try {
    return await fetch(`${agentUrl()}${path}`, {
      ...rest,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { ...(headers as Record<string, string> | undefined), authorization: `Bearer ${signInternalToken(userId)}` },
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw agentOffline()
  }
}

/** The agent's `{error}` in Coinflow's shape. A bare 5xx means offline to the user. */
export async function relayAgentError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
  // The agent refusing OUR token is a configuration problem (secrets differ), never the user's session: a 401 here
  // must not reach the browser, which would treat it as "signed out".
  if (res.status === 401 || res.status === 403) throw agentOffline()
  if (res.status >= 500 && !body?.error) throw agentOffline()
  throw new AppError(body?.error?.code ?? 'agent_error', body?.error?.message ?? 'The assistant couldn’t do that.', res.status >= 500 ? 503 : res.status)
}

/**
 * Spec §4.4: proposals are validated against the same Zod schemas as the API, including group membership.
 * A group expense must also split cleanly with the group's member order, so Approve never meets a 422.
 */
export async function validateProposal(userId: string, raw: unknown): Promise<boolean> {
  const parsed = proposalSchema.safeParse(raw)
  if (!parsed.success) return false
  const p = parsed.data
  if (p.kind !== 'group_expense' && p.kind !== 'settle_reminder') return true
  try {
    const group = await getGroup(userId, p.groupId)
    const active = new Set(group.members.filter((m) => !m.removedAt).map((m) => m.id))
    if (p.kind === 'settle_reminder') return active.has(p.payload.memberId)
    if (!expenseMemberIds(p.payload).every((id) => active.has(id))) return false
    const body = groupExpenseInputSchema.parse(p.payload)
    const s = body.split
    const lists = s.mode === 'equal' ? [s.memberIds] : s.mode === 'itemized' ? s.items.map((it) => it.memberIds) : [s.entries.map((e) => e.memberId)]
    if (lists.some((ids) => new Set(ids).size !== ids.length)) return false // the API refuses "listed twice"
    checkPayers(body.amountPaise, body.payers)
    computeSplit(body.amountPaise, body.split, group.members.map((m) => m.id))
    return true
  } catch {
    return false // not a member (404), a stranger in the split, or a split that doesn't add up
  }
}

/**
 * Refuses an upload by its declared size before the body is read, so an oversized photo or recording is never buffered.
 * The multipart envelope adds a little over the file itself, hence the slack.
 */
export function assertUploadSize(req: Request, maxBytes: number, err: () => AppError): void {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > maxBytes + 64 * 1024) throw err()
}

const DROPPED: SSEEvent = {
  event: 'error',
  data: JSON.stringify({ code: 'invalid_proposal', message: 'I drafted something that didn’t check out, so I left it out. Could you rephrase?' }),
}

/** Passes every SSE event through, except proposals that fail validation, which become a friendly error event. */
export function proposalFilter(validate: (raw: unknown) => Promise<boolean>): TransformStream<Uint8Array, Uint8Array> {
  const parser = createSSEParser()
  const encoder = new TextEncoder()
  const forward = async (ev: SSEEvent, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (ev.event !== 'proposal') return controller.enqueue(encoder.encode(formatSSE(ev)))
    let ok = false
    try {
      ok = await validate(JSON.parse(ev.data))
    } catch {
      ok = false
    }
    controller.enqueue(encoder.encode(formatSSE(ok ? ev : DROPPED)))
  }
  return new TransformStream({
    async transform(chunk, controller) {
      for (const ev of parser.push(chunk)) await forward(ev, controller)
    },
    async flush(controller) {
      for (const ev of parser.flush()) await forward(ev, controller)
    },
  })
}
