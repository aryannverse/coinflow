function pgField(err: unknown, field: string): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const own = (err as Record<string, unknown>)[field]
  if (typeof own === 'string') return own
  const cause = (err as { cause?: unknown }).cause
  if (typeof cause !== 'object' || cause === null) return undefined
  const wrapped = (cause as Record<string, unknown>)[field]
  return typeof wrapped === 'string' ? wrapped : undefined
}

/** Drizzle 0.45 wraps pg errors in DrizzleQueryError, so the pg fields may sit on `err.cause`. */
export function pgErrorCode(err: unknown): string | undefined {
  return pgField(err, 'code')
}

export function pgConstraint(err: unknown): string | undefined {
  return pgField(err, 'constraint_name')
}
