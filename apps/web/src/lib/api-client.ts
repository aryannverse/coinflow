export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly field?: string,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type ErrorBody = { error?: { code: string; message: string; field?: string }; requestId?: string }

/** Typed fetch for `/api/v1`. Resolves with the parsed JSON body; rejects with `ApiError`. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      ...rest,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(headers as Record<string, string>) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError('offline', 'You’re offline — changes will sync when you’re back.', 0)
  }
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => null)) as ErrorBody | null
  throw new ApiError(
    body?.error?.code ?? 'http_error',
    body?.error?.message ?? 'Something went wrong. Please try again.',
    res.status,
    body?.error?.field,
    body?.requestId,
  )
}
