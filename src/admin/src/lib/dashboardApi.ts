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

// ─────────────────────────────────────────────────────────────────────────
// Activity series — daily creation counts merged into one chart series
// ─────────────────────────────────────────────────────────────────────────

const DailyActivityPointSchema = z.object({
  date: z.string(),                  // ISO date 'YYYY-MM-DD'
  count: z.number().int().nonnegative(),
})
const ActivitySeriesSchema = z.array(DailyActivityPointSchema)

export type ActivityRange = '7D' | '30D' | '90D'

export interface ActivityChartPoint {
  date: string         // formatted for chart axis (e.g. '28 Mar', 'Today')
  documents: number
  returns: number
  itrs: number
}

/**
 * Fans out the 3 per-service /admin/activity endpoints, merges by date,
 * fills missing days with zeros, and formats the date column for the chart.
 */
export async function getAdminDashboardActivity(range: ActivityRange): Promise<ActivityChartPoint[]> {
  const errors: Record<string, string> = {}

  const [docs, gst, itrs] = await Promise.all([
    safeFetch(`/documents/admin/activity?range=${range}`, ActivitySeriesSchema, errors, 'documents'),
    safeFetch(`/gst/admin/activity?range=${range}`,       ActivitySeriesSchema, errors, 'gst'),
    safeFetch(`/itr/admin/activity?range=${range}`,       ActivitySeriesSchema, errors, 'itr'),
  ])

  const days = range === '90D' ? 90 : range === '30D' ? 30 : 7
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build the day spine from N days ago through today (inclusive).
  const spine: ActivityChartPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    spine.push({
      date: i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      documents: 0,
      returns: 0,
      itrs: 0,
    })
  }

  // Build a Map<isoDate, indexInSpine> for O(1) merge.
  const indexByIso = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    indexByIso.set(d.toISOString().slice(0, 10), i)
  }

  const merge = (rows: { date: string; count: number }[] | undefined, key: 'documents' | 'returns' | 'itrs') => {
    if (!rows) return
    for (const row of rows) {
      const idx = indexByIso.get(row.date)
      if (idx !== undefined) spine[idx][key] = row.count
    }
  }

  merge(docs, 'documents')
  merge(gst,  'returns')
  merge(itrs, 'itrs')

  return spine
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
