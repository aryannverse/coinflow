export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what: string) => new AppError('not_found', `We couldn’t find that ${what}.`, 404)
export const invalid = (field: string, message: string) => new AppError('invalid', message, 422, field)
export const conflict = (code: string, message: string) => new AppError(code, message, 409)
