/**
 * Audit log API client
 * Endpoint: GET /auth/admin/audit-events
 * Permission: admin.dashboard.read
 *
 * All calls go through the shared axios instance in ./api.ts
 */
import { z } from 'zod'
import api from './api'

// ── Zod schema ────────────────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  id: z.string(),
  eventTime: z.string(),
  service: z.string(),
  entityType: z.string(),
  action: z.string(),
  actorUserId: z.string().nullable().optional(),
  actorType: z.string(),
})
export type AuditEvent = z.infer<typeof AuditEventSchema>

// ── API functions ─────────────────────────────────────────────────────────────

export async function getAuditEvents(params?: {
  limit?: number
  actorUserId?: string
}): Promise<AuditEvent[]> {
  const res = await api.get('/auth/admin/audit-events', { params })
  return z.array(AuditEventSchema).parse(res.data)
}
