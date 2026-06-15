/**
 * Callback Service API client (12th microservice)
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const CallbackStatus = z.enum([
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'FOLLOW_UP_NEEDED',
  'ESCALATED_TO_CA',
  'CANCELLED',
])
export type CallbackStatus = z.infer<typeof CallbackStatus>

export const CallbackCategory = z.enum([
  'GST',
  'ITR',
  'DOC',
  'LOAN',
  'BILLING',
  'OTHER',
])
export type CallbackCategory = z.infer<typeof CallbackCategory>

export const CallbackPriority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
export type CallbackPriority = z.infer<typeof CallbackPriority>

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const CallNoteSchema = z.object({
  id: z.string(),
  callbackId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  authorAvatarUrl: z.string().nullable().optional(),
  body: z.string(),
  outcome: z.enum(['RESOLVED', 'NEEDS_FOLLOW_UP', 'ESCALATED', 'NO_ANSWER', 'WRONG_NUMBER', 'USER_DECLINED']).nullable().optional(),
  durationMinutes: z.number().nullable().optional(),
  isInternal: z.boolean(),
  recordedAt: z.string(),
  editableUntil: z.string().nullable().optional(),
})
export type CallNote = z.infer<typeof CallNoteSchema>

export const CallbackTimelineEventSchema = z.object({
  id: z.string(),
  eventType: z.enum([
    'REQUESTED',
    'ASSIGNED',
    'SCHEDULED',
    'RESCHEDULED',
    'CALL_STARTED',
    'NOTE_ADDED',
    'CALL_COMPLETED',
    'FOLLOW_UP_FLAGGED',
    'ESCALATED',
    'CANCELLED',
    'NOTIFICATION_SENT',
  ]),
  actorId: z.string().nullable().optional(),
  actorName: z.string(),
  actorAvatarUrl: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  occurredAt: z.string(),
})
export type CallbackTimelineEvent = z.infer<typeof CallbackTimelineEventSchema>

export const LinkedEntitySchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  displayLabel: z.string(),
  status: z.string().optional(),
  amount: z.number().optional(),
})
export type LinkedEntity = z.infer<typeof LinkedEntitySchema>

export const CallbackSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  userPhone: z.string(),
  userAvatarUrl: z.string().nullable().optional(),
  organizationId: z.string(),
  status: CallbackStatus,
  category: CallbackCategory,
  priority: CallbackPriority,
  issueDescription: z.string().nullable().optional(),
  preferredWindowStart: z.string().nullable().optional(),
  preferredWindowEnd: z.string().nullable().optional(),
  assignedAgentId: z.string().nullable().optional(),
  assignedAgentName: z.string().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  requestedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  linkedEntity: LinkedEntitySchema.nullable().optional(),
  slaExpiresAt: z.string().nullable().optional(),
  notes: z.array(CallNoteSchema).optional(),
  timeline: z.array(CallbackTimelineEventSchema).optional(),
  notificationsFired: z.array(z.object({
    id: z.string(),
    channel: z.enum(['PUSH', 'SMS', 'EMAIL', 'IN_APP']),
    templateCode: z.string(),
    sentAt: z.string(),
    status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED']),
  })).optional(),
})
export type Callback = z.infer<typeof CallbackSchema>

export const CallbackListSchema = z.object({
  items: z.array(CallbackSchema),
  page: z.number(),
  total: z.number(),
  summary: z.object({
    open: z.number(),
    scheduled: z.number(),
    breached: z.number(),
    avgTtrMinutes: z.number(),
  }).optional(),
})

export const CallbackKpiSchema = z.object({
  organizationId: z.string().optional(),
  open: z.number(),
  avgTtrSeconds: z.number(),
  /**
   * CONTRACT — ratio 0..1 as sent by the backend (e.g. 0.943 = 94.3%).
   * getCallbackKpi() converts this to a percentage (×100, max 1 decimal) before
   * returning, so callers always receive a value in the range 0..100.
   * Special case: 1.0 → 100 (no floating-point overshoot).
   * The raw ratio is validated here (z.number()) because Zod parses the
   * backend response before the normalisation step multiplies by 100.
   */
  slaCompliance: z.number(),
  // Backend may send `totalCompleted` instead of (or in addition to) `completed`.
  // Normalisation happens in getCallbackKpi() before .parse() so this field is
  // always present in the parsed output regardless of which backend field name is used.
  completed: z.number().default(0),
  deltas: z.object({
    open: z.number(),
    avgTtrSeconds: z.number(),
    /**
     * CONTRACT — ratio delta 0..1 from the backend (e.g. 0.012 = +1.2 percentage points).
     * getCallbackKpi() converts this to percentage points (×100, max 1 decimal).
     */
    slaCompliance: z.number(),
    completed: z.number(),
  }),
  statusDistribution: z.array(z.object({
    date: z.string(),
    PENDING: z.number().optional(),
    SCHEDULED: z.number().optional(),
    IN_PROGRESS: z.number().optional(),
    FOLLOW_UP_NEEDED: z.number().optional(),
    ESCALATED_TO_CA: z.number().optional(),
    COMPLETED: z.number().optional(),
    CANCELLED: z.number().optional(),
  })),
  dailyVolume: z.array(z.object({
    date: z.string(),
    requested: z.number(),
    completed: z.number(),
  })),
  ttrHistogram: z.array(z.object({
    bucket: z.string(),
    count: z.number(),
    withinSla: z.boolean(),
  })),
  categoryMix: z.array(z.object({
    category: CallbackCategory,
    count: z.number(),
  })),
  teamPerformance: z.array(z.object({
    agentId: z.string(),
    agentName: z.string(),
    agentAvatarUrl: z.string().nullable().optional(),
    assigned: z.number(),
    completed: z.number(),
    avgTtrMinutes: z.number(),
    slaPercent: z.number(),
    followUps: z.number(),
  })),
  slaBreaches: z.array(z.object({
    callbackId: z.string(),
    userName: z.string(),
    userAvatarUrl: z.string().nullable().optional(),
    category: CallbackCategory,
    breachMinutes: z.number(),
    resolvedInMinutes: z.number().nullable().optional(),
  })),
})
export type CallbackKpi = z.infer<typeof CallbackKpiSchema>

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export interface ListCallbacksParams {
  userId?: string
  agentId?: string
  status?: string
  category?: string
  priority?: string
  breached?: boolean
  q?: string
  page?: number
  size?: number
  sort?: string
}

export async function listCallbacks(params: ListCallbacksParams = {}) {
  const res = await api.get('/callbacks', { params })
  return CallbackListSchema.parse(res.data)
}

export async function getCallback(id: string) {
  const res = await api.get(`/callbacks/${id}`)
  return CallbackSchema.parse(res.data)
}

export interface CreateCallbackRequest {
  phoneNumber: string
  category: CallbackCategory
  priority?: CallbackPriority
  issueDescription?: string
  preferredWindowStart?: string
  preferredWindowEnd?: string
}

export async function createCallback(body: CreateCallbackRequest) {
  const res = await api.post('/callbacks', body)
  return z.object({ callbackId: z.string(), status: CallbackStatus }).parse(res.data)
}

export async function assignCallback(id: string, agentId: string) {
  await api.post(`/callbacks/${id}/assign`, { agentId })
}

export async function confirmCallback(id: string, scheduledAt: string) {
  await api.post(`/callbacks/${id}/confirm`, { scheduledAt })
}

export async function completeCallback(id: string, resolutionSummary?: string) {
  await api.post(`/callbacks/${id}/complete`, { resolutionSummary })
}

export async function escalateCallback(id: string, reason: string) {
  await api.post(`/callbacks/${id}/escalate`, { reason })
}

export async function cancelCallback(id: string, reason?: string) {
  await api.post(`/callbacks/${id}/cancel`, { reason })
}

export async function rescheduleCallback(id: string, newWindowStart: string, newWindowEnd: string) {
  await api.post(`/callbacks/${id}/reschedule`, { newWindowStart, newWindowEnd })
}

export interface AddNoteRequest {
  content: string
  isInternal: boolean
  outcome?: string
  durationMinutes?: number
}

export async function addCallbackNote(id: string, body: AddNoteRequest) {
  const res = await api.post(`/callbacks/${id}/notes`, body)
  return CallNoteSchema.parse(res.data)
}

export async function getCallbackNotifications(id: string) {
  const res = await api.get(`/callbacks/${id}/notifications`)
  return z.array(z.object({
    id: z.string(),
    channel: z.enum(['PUSH', 'SMS', 'EMAIL', 'IN_APP']),
    templateCode: z.string(),
    sentAt: z.string(),
    status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED']),
  })).parse(res.data)
}

export interface CallbackKpiParams {
  range?: '24h' | '7d' | '30d' | 'fy'
  category?: CallbackCategory
  assigned?: string
  from?: string
  to?: string
}

export async function getCallbackKpi(params: CallbackKpiParams = {}) {
  const res = await api.get('/callbacks/kpi', { params })
  // Normalise: backend sends `totalCompleted` at top level; schema expects `completed`.
  // Merge so both naming conventions are handled transparently.
  const raw = res.data as Record<string, unknown>
  const normalised = {
    ...raw,
    completed: raw['completed'] ?? raw['totalCompleted'] ?? 0,
  }
  const parsed = CallbackKpiSchema.parse(normalised)

  // Convert slaCompliance and its delta from 0..1 ratio to 0..100 percentage.
  // Backend contract: ratio (e.g. 0.943). UI contract: percentage (e.g. 94.3).
  // Special case: 1.0 exactly → 100 (avoids 100.0 display).
  const toPercent = (ratio: number): number => {
    const pct = ratio * 100
    return pct >= 100 ? 100 : Math.round(pct * 10) / 10
  }

  return {
    ...parsed,
    slaCompliance: toPercent(parsed.slaCompliance),
    deltas: {
      ...parsed.deltas,
      slaCompliance: toPercent(parsed.deltas.slaCompliance),
    },
  }
}
