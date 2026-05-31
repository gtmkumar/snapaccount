/**
 * SnapAccount internal-staff (Team) API client — design Screens 87/89/90.
 *
 * Three screens, one data spine:
 *  - Staff List (87)        — getStaffList(): roster of operational-role staff.
 *  - Workload grid (89)     — getStaffWorkloadGrid(): staff × queue-type matrix,
 *                             fanning out the per-service /admin/workload-by-user
 *                             endpoints and merging by userId.
 *  - KPI dashboard (90)     — the page reuses getCallbackKpi() (callbackApi) for
 *                             callback SLA/TTR metrics and getStaffWorkloadGrid()
 *                             for the per-staff rollup table.
 *
 * Honest by design: only queues whose service tracks a per-staff assignee are
 * aggregated (GST notices→AssignedCaId, ITR grievances→AssignedTo, Chat threads,
 * Callbacks). Documents have no assignee and Loans are assigned to a bank (not a
 * staff member), so neither contributes a column. Resilient: a single failing
 * service leaves its column at 0 rather than blanking the whole grid.
 */
import { z } from 'zod'
import api from './api'

// ── Staff roster (Screen 87) ───────────────────────────────────────────────

export const StaffMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  roleDisplayName: z.string(),
  status: z.enum(['active', 'suspended']),
  joinedAt: z.string().nullable().optional(),
  lastActiveAt: z.string().nullable().optional(),
})
export type StaffMember = z.infer<typeof StaffMemberSchema>

const StaffListSchema = z.array(StaffMemberSchema)

export async function getStaffList(role?: string): Promise<StaffMember[]> {
  const res = await api.get('/auth/admin/staff', { params: role ? { role } : undefined })
  return StaffListSchema.parse(res.data)
}

// ── Per-service workload (Screen 89) ────────────────────────────────────────

const UserWorkloadSchema = z.object({
  userId: z.string(),
  assigned: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
})
const UserWorkloadListSchema = z.array(UserWorkloadSchema)

/** The queue types that track a per-staff assignee and so form grid columns. */
export const QUEUE_KEYS = ['gst', 'itr', 'chat', 'callbacks'] as const
export type QueueKey = (typeof QUEUE_KEYS)[number]

export interface StaffWorkloadRow extends StaffMember {
  /** Open (assigned, not completed) items per queue. */
  queues: Record<QueueKey, number>
  /** Completed items per queue. */
  completedByQueue: Record<QueueKey, number>
  /** Sum of open items across all queues — the staff member's current load. */
  totalAssigned: number
  /** Sum of completed items across all queues. */
  totalCompleted: number
}

/** Per-section fetch error map; a failed service lands here, its column stays 0. */
export interface WorkloadGridResult {
  rows: StaffWorkloadRow[]
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
    errors[errorKey] = e instanceof Error ? e.message : 'unknown error'
    return undefined
  }
}

const QUEUE_ENDPOINTS: Record<QueueKey, string> = {
  gst: '/gst/admin/workload-by-user',
  itr: '/itr/admin/workload-by-user',
  chat: '/chat/admin/workload-by-user',
  callbacks: '/callbacks/admin/workload-by-user',
}

const emptyQueues = (): Record<QueueKey, number> =>
  ({ gst: 0, itr: 0, chat: 0, callbacks: 0 })

/**
 * Fans out the staff roster + 4 per-service workload endpoints in parallel and
 * merges by userId. Every staff member appears, even with zero assignments.
 * Sorted by current load (totalAssigned) descending.
 */
export async function getStaffWorkloadGrid(): Promise<WorkloadGridResult> {
  const errors: Record<string, string> = {}

  const [staff, gst, itr, chat, callbacks] = await Promise.all([
    safeFetch('/auth/admin/staff', StaffListSchema, errors, 'staff'),
    safeFetch(QUEUE_ENDPOINTS.gst, UserWorkloadListSchema, errors, 'gst'),
    safeFetch(QUEUE_ENDPOINTS.itr, UserWorkloadListSchema, errors, 'itr'),
    safeFetch(QUEUE_ENDPOINTS.chat, UserWorkloadListSchema, errors, 'chat'),
    safeFetch(QUEUE_ENDPOINTS.callbacks, UserWorkloadListSchema, errors, 'callbacks'),
  ])

  if (!staff) return { rows: [], errors }

  const byQueue: Record<QueueKey, z.infer<typeof UserWorkloadListSchema> | undefined> = {
    gst, itr, chat, callbacks,
  }

  const rows: StaffWorkloadRow[] = staff.map(member => {
    const queues = emptyQueues()
    const completedByQueue = emptyQueues()
    for (const key of QUEUE_KEYS) {
      const hit = byQueue[key]?.find(w => w.userId === member.userId)
      if (hit) {
        queues[key] = hit.assigned
        completedByQueue[key] = hit.completed
      }
    }
    const totalAssigned = QUEUE_KEYS.reduce((sum, k) => sum + queues[k], 0)
    const totalCompleted = QUEUE_KEYS.reduce((sum, k) => sum + completedByQueue[k], 0)
    return { ...member, queues, completedByQueue, totalAssigned, totalCompleted }
  })

  rows.sort((a, b) => b.totalAssigned - a.totalAssigned)
  return { rows, errors }
}

// ── Load-level helper (shared by Staff + Workload tabs) ─────────────────────

export type LoadLevel = 'idle' | 'normal' | 'busy' | 'heavy' | 'overloaded'

/** Maps an open-item count to a load level, per design Screen 89 thresholds. */
export function loadLevel(count: number): LoadLevel {
  if (count === 0) return 'idle'
  if (count <= 10) return 'normal'
  if (count <= 20) return 'busy'
  if (count <= 30) return 'heavy'
  return 'overloaded'
}
