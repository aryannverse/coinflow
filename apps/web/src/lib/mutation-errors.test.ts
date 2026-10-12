import { describe, expect, it } from 'vitest'
import { ApiError } from './api-client'
import { ledgerErrorToast } from './mutation-errors'

const serverError = new ApiError('server_error', 'Something went wrong on our side.', 500, undefined, 'abc123')

describe('ledgerErrorToast', () => {
  it('a plain save failure gets a toast with Retry and the request ref', () => {
    expect(ledgerErrorToast(serverError)).toEqual({ message: 'Something went wrong on our side.', description: 'Ref abc123', retry: true })
  })

  it('a save started from an agent chip gets no toast: the chip shows the error and its Approve is the only retry', () => {
    // Two retry paths (toast Retry + chip Approve) once saved the same expense twice.
    expect(ledgerErrorToast(serverError, { chip: true })).toBeNull()
  })

  it('field errors are inline, signed-out is handled elsewhere, and a still-saving id never offers Retry', () => {
    expect(ledgerErrorToast(new ApiError('invalid', 'Pick a category.', 422, 'categoryId'))).toBeNull()
    expect(ledgerErrorToast(new ApiError('unauthenticated', 'Sign in again.', 401))).toBeNull()
    expect(ledgerErrorToast(new ApiError('still_saving', 'Still saving…', 409))).toMatchObject({ retry: false })
    expect(ledgerErrorToast(new Error('boom'))).toEqual({ message: 'Something went wrong.', description: undefined, retry: true })
  })
})
