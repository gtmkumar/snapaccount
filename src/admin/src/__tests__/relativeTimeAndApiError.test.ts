/**
 * relativeTimeAndApiError.test.ts
 *
 *  - formatRelativeTime must not render sentinel/epoch timestamps as
 *    "over 2025 years ago" (ACM-15).
 *  - isForbiddenError must distinguish an HTTP 403 (permission denied) from
 *    other errors, so pages can show an access-denied state instead of a
 *    misleading empty state (ACM-08/09).
 */
import { describe, it, expect } from 'vitest'
import { AxiosError } from 'axios'
import { formatRelativeTime } from '@/lib/utils'
import { isForbiddenError, getApiErrorStatus } from '@/lib/apiError'

describe('formatRelativeTime — sentinel-date guard', () => {
  it('returns empty string for null/undefined/invalid input', () => {
    expect(formatRelativeTime(null)).toBe('')
    expect(formatRelativeTime(undefined)).toBe('')
    expect(formatRelativeTime('not-a-date')).toBe('')
  })

  it('returns empty string for DateTime.MinValue / epoch sentinels (ACM-15)', () => {
    expect(formatRelativeTime('0001-01-01T00:00:00Z')).toBe('')
    expect(formatRelativeTime('1970-01-01T00:00:00Z')).toBe('')
    expect(formatRelativeTime(new Date(0))).toBe('')
  })

  it('formats a plausible recent date with an "ago" suffix', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const out = formatRelativeTime(twoHoursAgo)
    expect(out).toMatch(/ago/)
    expect(out).not.toMatch(/years ago/)
  })
})

describe('isForbiddenError / getApiErrorStatus', () => {
  function axiosErrWithStatus(status: number): AxiosError {
    const err = new AxiosError('failed')
    // @ts-expect-error partial response is enough for status classification
    err.response = { status }
    return err
  }

  it('is true only for HTTP 403', () => {
    expect(isForbiddenError(axiosErrWithStatus(403))).toBe(true)
    expect(isForbiddenError(axiosErrWithStatus(401))).toBe(false)
    expect(isForbiddenError(axiosErrWithStatus(404))).toBe(false)
    expect(isForbiddenError(axiosErrWithStatus(500))).toBe(false)
  })

  it('is false for non-HTTP / undefined errors', () => {
    expect(isForbiddenError(null)).toBe(false)
    expect(isForbiddenError(undefined)).toBe(false)
    expect(isForbiddenError(new Error('network'))).toBe(false)
  })

  it('reads status from plain axios-shaped objects too', () => {
    expect(getApiErrorStatus({ response: { status: 403 } })).toBe(403)
    expect(isForbiddenError({ response: { status: 403 } })).toBe(true)
  })
})
