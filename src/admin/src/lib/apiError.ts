/**
 * apiError.ts — small helpers for classifying Axios/API errors in the UI.
 *
 * The single most important distinction these draw is 403 (authorized user, but
 * lacks permission for THIS resource) vs. a genuine empty result (200 with no rows).
 * Several pages historically rendered a 403 as a benign "0 records" empty state,
 * hiding a real authorization failure from the user (ACM-08/09). Use isForbiddenError
 * to branch to an access-denied state instead.
 */
import { AxiosError } from 'axios'

/** HTTP status from an Axios error, or undefined for non-HTTP failures. */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (error instanceof AxiosError) return error.response?.status
  // Defensive: some callers hand us a plain object shaped like an Axios error.
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/** True when the error is an HTTP 403 (permission denied). */
export function isForbiddenError(error: unknown): boolean {
  return getApiErrorStatus(error) === 403
}
