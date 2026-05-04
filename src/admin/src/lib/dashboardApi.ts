/**
 * Admin cross-service dashboard.
 *
 * Each service exposes its own thin /admin/dashboard-stats endpoint that
 * returns just the counts it owns. The admin shell fans out calls in
 * parallel and merges them into a single shape the page can render.
 *
 * Resilient by design: if any single service is down, the merged result
 * keeps the failing fields as undefined so the UI can render the rest.
 */
import { z } from 'zod'
import api from './api'

const DocumentDashboardStatsSchema = z.object({
  pendingDocuments: z.number().int().nonnegative(),
})
const GstDashboardStatsSchema = z.object({
  gstReturnsDueToday: z.number().int().nonnegative(),
})
const ItrDashboardStatsSchema = z.object({
  itrVerificationsPending: z.number().int().nonnegative(),
})
const CallbackDashboardStatsSchema = z.object({
  openCallbacks: z.number().int().nonnegative(),
})
const LoanDashboardStatsSchema = z.object({
  loanApplicationsActive: z.number().int().nonnegative(),
})

export interface DashboardStats {
  pendingDocuments?: number
  gstReturnsDueToday?: number
  itrVerificationsPending?: number
  openCallbacks?: number
  loanApplicationsActive?: number
  /** Per-section error map; populated when one or more services fail. */
  errors: Record<string, string>
}

async function safeFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  errors: Record<string, string>,
  errorKey: string,
): Promise<T | undefined> {
  try {
    const res = await api.get(path)
    return schema.parse(res.data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    errors[errorKey] = msg
    return undefined
  }
}

/**
 * Fans out 5 parallel requests to the per-service dashboard-stats endpoints
 * and merges them. Never throws — failed services land in `errors`.
 */
export async function getAdminDashboardStats(): Promise<DashboardStats> {
  const errors: Record<string, string> = {}

  const [docs, gst, itr, callbacks, loans] = await Promise.all([
    safeFetch('/documents/admin/dashboard-stats', DocumentDashboardStatsSchema, errors, 'documents'),
    safeFetch('/gst/admin/dashboard-stats', GstDashboardStatsSchema, errors, 'gst'),
    safeFetch('/itr/admin/dashboard-stats', ItrDashboardStatsSchema, errors, 'itr'),
    safeFetch('/callbacks/admin/dashboard-stats', CallbackDashboardStatsSchema, errors, 'callbacks'),
    safeFetch('/loans/admin/dashboard-stats', LoanDashboardStatsSchema, errors, 'loans'),
  ])

  return {
    pendingDocuments: docs?.pendingDocuments,
    gstReturnsDueToday: gst?.gstReturnsDueToday,
    itrVerificationsPending: itr?.itrVerificationsPending,
    openCallbacks: callbacks?.openCallbacks,
    loanApplicationsActive: loans?.loanApplicationsActive,
    errors,
  }
}
