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
// Audit events — cross-service tail from shared.audit_log
// ─────────────────────────────────────────────────────────────────────────

const AuditEventSchema = z.object({
  id: z.string(),
  eventTime: z.string(),
  service: z.string(),
  entityType: z.string(),
  action: z.string(),
  actorUserId: z.string().nullable().optional(),
  actorType: z.string(),
})
const AuditEventsSchema = z.array(AuditEventSchema)
export type AuditEvent = z.infer<typeof AuditEventSchema>

export async function getAdminAuditEvents(limit = 20, actorUserId?: string): Promise<AuditEvent[]> {
  const errors: Record<string, string> = {}
  const qs = new URLSearchParams({ limit: String(limit) })
  if (actorUserId) qs.set('actorUserId', actorUserId)
  const items = await safeFetch(
    `/auth/admin/audit-events?${qs.toString()}`,
    AuditEventsSchema, errors, 'audit',
  )
  return items ?? []
}

// ─────────────────────────────────────────────────────────────────────────
// Team workload — per-user assigned/completed counts merged across services
// ─────────────────────────────────────────────────────────────────────────

const TeamMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.string(),
})
const TeamMembersSchema = z.array(TeamMemberSchema)
export type TeamMember = z.infer<typeof TeamMemberSchema>

/**
 * Fetches operational team members. With `role` set, returns just that
 * role (e.g. "CA" for the GST filing-queue assign-to dropdown). Without
 * a role, returns all operational roles (used by the team-workload widget
 * via the higher-level getAdminTeamWorkload).
 */
export async function getAdminTeamMembers(role?: string): Promise<TeamMember[]> {
  const errors: Record<string, string> = {}
  const path = role
    ? `/auth/admin/team-members?role=${encodeURIComponent(role)}`
    : '/auth/admin/team-members'
  const items = await safeFetch(path, TeamMembersSchema, errors, 'teamMembers')
  return items ?? []
}

const UserWorkloadSchema = z.object({
  userId: z.string(),
  assigned: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
})
const UserWorkloadListSchema = z.array(UserWorkloadSchema)

export interface TeamWorkloadRow {
  userId: string
  name: string
  role: string
  assigned: number
  completed: number
  slaBreaches: number
}

/**
 * Fans out 3 calls — operational team list (AuthService), per-user callback
 * workload, per-user chat workload — and merges by userId. Members with no
 * assignments still appear (assigned=0, completed=0). Sorted by assigned DESC.
 *
 * SLA breach data is not yet tracked anywhere in the schema; field is left
 * at 0 for all rows. Will need a separate SLA-tracking slice to populate.
 */
export async function getAdminTeamWorkload(): Promise<TeamWorkloadRow[]> {
  const errors: Record<string, string> = {}

  const [members, callbackWorkload, chatWorkload] = await Promise.all([
    safeFetch('/auth/admin/team-members',           TeamMembersSchema,    errors, 'authMembers'),
    safeFetch('/callbacks/admin/workload-by-user',  UserWorkloadListSchema, errors, 'callbacks'),
    safeFetch('/chat/admin/workload-by-user',       UserWorkloadListSchema, errors, 'chat'),
  ])

  if (!members) return []

  const sumByUser = new Map<string, { assigned: number; completed: number }>()
  for (const w of [...(callbackWorkload ?? []), ...(chatWorkload ?? [])]) {
    const prev = sumByUser.get(w.userId) ?? { assigned: 0, completed: 0 }
    sumByUser.set(w.userId, {
      assigned: prev.assigned + w.assigned,
      completed: prev.completed + w.completed,
    })
  }

  const rows: TeamWorkloadRow[] = members.map(m => {
    const w = sumByUser.get(m.userId) ?? { assigned: 0, completed: 0 }
    return {
      userId: m.userId,
      name: m.name,
      role: m.role,
      assigned: w.assigned,
      completed: w.completed,
      slaBreaches: 0, // TODO: backend SLA tracker not yet implemented
    }
  })

  return rows.sort((a, b) => b.assigned - a.assigned)
}

// ─────────────────────────────────────────────────────────────────────────
// Chat queue snapshot — top-N oldest open unassigned threads
// ─────────────────────────────────────────────────────────────────────────

const ChatQueueItemSchema = z.object({
  threadId: z.string(),
  category: z.string(),
  subject: z.string().nullable().optional(),
  initiatedByUserId: z.string(),
  createdAt: z.string(),
  waitMins: z.number().int().nonnegative(),
})
const ChatQueueSnapshotSchema = z.array(ChatQueueItemSchema)
export type ChatQueueItem = z.infer<typeof ChatQueueItemSchema>

export async function getAdminChatQueueSnapshot(limit = 10): Promise<ChatQueueItem[]> {
  const errors: Record<string, string> = {}
  const items = await safeFetch(
    `/chat/admin/queue-snapshot?limit=${limit}`,
    ChatQueueSnapshotSchema, errors, 'chat',
  )
  return items ?? []
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
