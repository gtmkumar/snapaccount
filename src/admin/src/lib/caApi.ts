/**
 * CA (Chartered Accountant) Consultation API client — Wave 7 GAP-031
 * Wave 7A addendum: CA profiles list, CA-cancel, recurring availability rules CRUD + generation.
 * All calls go through the shared axios instance from lib/api.ts.
 *
 * Contract source: ChatService.Api/Endpoints/Appointments.cs (Wave 7A addendum)
 *   GET    /appointments/ca-profiles                     perm: chat.appointments.book
 *   POST   /appointments/{id}/cancel-by-ca               perm: chat.slots.manage
 *   POST   /appointments/availability-rules              perm: chat.slots.manage
 *   GET    /appointments/availability-rules              perm: chat.slots.manage
 *   DELETE /appointments/availability-rules/{id}         perm: chat.slots.manage
 *   POST   /appointments/availability-rules/generate     perm: chat.slots.manage
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Appointment status enum
// ---------------------------------------------------------------------------

export const AppointmentStatusSchema = z.enum([
  'REQUESTED',
  'PENDING',
  'CONFIRMED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
])
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>

// ---------------------------------------------------------------------------
// CA Profile
// Reconciled against ListCaProfilesQuery.CaProfileSummaryDto:
//   caProfileId, userId, displayName, bio, specialisations, averageRating,
//   ratingCount, isActive, createdAt
// Frontend uses caId as the stable key (maps from caProfileId).
// ---------------------------------------------------------------------------

/** Raw backend DTO from GET /appointments/ca-profiles */
const CaProfileSummaryDtoSchema = z.object({
  caProfileId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  bio: z.string().nullable().optional(),
  specialisations: z.string().nullable().optional(),
  averageRating: z.number(),
  ratingCount: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
})

const ListCaProfilesResponseSchema = z.object({
  items: z.array(CaProfileSummaryDtoSchema),
  totalCount: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

/** Frontend-normalised CA profile (caId = caProfileId) */
export const CaProfileSchema = z.object({
  caId: z.string(),          // = caProfileId from backend
  userId: z.string(),
  displayName: z.string(),
  bio: z.string().nullable().optional(),
  specialisations: z.string().nullable().optional(),
  averageRating: z.number(),
  ratingCount: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
})
export type CaProfile = z.infer<typeof CaProfileSchema>

// ---------------------------------------------------------------------------
// Availability rules
// Reconciled against AvailabilityRuleResponse (CreateAvailabilityRuleCommand.cs):
//   ruleId, caProfileId, weekday (int 0=Sun..6=Sat), startTimeIst (TimeSpan "HH:MM:SS"),
//   endTimeIst, slotDurationMinutes, effectiveFrom (DateOnly "YYYY-MM-DD"),
//   effectiveTo, isActive, createdAt
// ---------------------------------------------------------------------------

/**
 * Weekday as string enum used in the UI.
 * Backend uses int (0=Sunday, 1=Monday, ..., 6=Saturday) following .NET DayOfWeek.
 */
export const WeekdaySchema = z.enum([
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
])
export type Weekday = z.infer<typeof WeekdaySchema>

/** .NET DayOfWeek int → frontend Weekday string */
const DOW_TO_WEEKDAY: Record<number, Weekday> = {
  0: 'SUNDAY',
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
}

/** Frontend Weekday string → .NET DayOfWeek int */
const WEEKDAY_TO_DOW: Record<Weekday, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
}

/**
 * Convert backend TimeSpan string ("HH:MM:SS" or "H:MM:SS") to "HH:mm" for
 * the HTML time input.
 */
function timeSpanToHHmm(ts: string): string {
  const parts = ts.split(':')
  if (parts.length < 2) return ts
  const h = parts[0].padStart(2, '0')
  const m = parts[1].padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Convert "HH:mm" from time input to TimeSpan string "HH:MM:00" for the backend.
 */
function hhmmToTimeSpan(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return `${(h ?? '00').padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}:00`
}

/** Raw backend availability rule DTO */
const AvailabilityRuleDtoSchema = z.object({
  ruleId: z.string().uuid(),
  caProfileId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  startTimeIst: z.string(),   // TimeSpan "HH:MM:SS"
  endTimeIst: z.string(),     // TimeSpan "HH:MM:SS"
  slotDurationMinutes: z.number().int(),
  effectiveFrom: z.string(),  // DateOnly "YYYY-MM-DD"
  effectiveTo: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
})
type AvailabilityRuleDto = z.infer<typeof AvailabilityRuleDtoSchema>

/** Frontend-normalised availability rule (weekday as string enum, times as "HH:mm") */
export const AvailabilityRuleSchema = z.object({
  id: z.string(),
  caId: z.string(),         // = caProfileId
  weekday: WeekdaySchema,
  startTime: z.string(),    // "HH:mm" IST
  endTime: z.string(),      // "HH:mm" IST
  slotDurationMinutes: z.number().int(),
  effectiveFrom: z.string(), // "YYYY-MM-DD"
  effectiveTo: z.string().nullable().optional(),
  active: z.boolean(),
  createdAt: z.string(),
})
export type AvailabilityRule = z.infer<typeof AvailabilityRuleSchema>

function mapDtoToRule(dto: AvailabilityRuleDto): AvailabilityRule {
  return {
    id: dto.ruleId,
    caId: dto.caProfileId,
    weekday: DOW_TO_WEEKDAY[dto.weekday] ?? 'MONDAY',
    startTime: timeSpanToHHmm(dto.startTimeIst),
    endTime: timeSpanToHHmm(dto.endTimeIst),
    slotDurationMinutes: dto.slotDurationMinutes,
    effectiveFrom: dto.effectiveFrom,
    effectiveTo: dto.effectiveTo ?? null,
    active: dto.isActive,
    createdAt: dto.createdAt,
  }
}

const ListAvailabilityRulesResponseSchema = z.object({
  items: z.array(AvailabilityRuleDtoSchema),
})

// ---------------------------------------------------------------------------
// Availability blocks (no backend endpoint — kept as stubs so BlockEditor compiles)
// ---------------------------------------------------------------------------

export const AvailabilityBlockSchema = z.object({
  id: z.string(),
  caId: z.string(),
  blockStart: z.string(),
  blockEnd: z.string(),
  reason: z.string().nullable().optional(),
})
export type AvailabilityBlock = z.infer<typeof AvailabilityBlockSchema>

// ---------------------------------------------------------------------------
// Generate slots response
// Reconciled against GenerateSlotsFromRulesResponse:
//   caProfileId, rulesProcessed, slotsCreated, slotsSkipped
// ---------------------------------------------------------------------------

export const GenerateSlotsResponseSchema = z.object({
  caProfileId: z.string().uuid(),
  rulesProcessed: z.number().int(),
  slotsCreated: z.number().int(),
  slotsSkipped: z.number().int(),
})
export type GenerateSlotsResponse = z.infer<typeof GenerateSlotsResponseSchema>

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export const SlotPartOfDay = z.enum(['MORNING', 'AFTERNOON', 'EVENING'])
export type SlotPartOfDay = z.infer<typeof SlotPartOfDay>

export const AppointmentSlotSchema = z.object({
  slotId: z.string(),
  caId: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  available: z.boolean(),
  partOfDay: SlotPartOfDay,
})
export type AppointmentSlot = z.infer<typeof AppointmentSlotSchema>

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export const AppointmentTopicSchema = z.enum([
  'ACCOUNTING', 'GST', 'ITR', 'LOAN', 'OTHER',
])
export type AppointmentTopic = z.infer<typeof AppointmentTopicSchema>

export const AppointmentSchema = z.object({
  id: z.string(),
  caId: z.string(),
  caName: z.string(),
  caAvatarUrl: z.string().nullable().optional(),
  clientUserId: z.string(),
  clientName: z.string(),
  clientBusinessName: z.string().nullable().optional(),
  topic: AppointmentTopicSchema,
  topicNote: z.string().nullable().optional(),
  status: AppointmentStatusSchema,
  slotStart: z.string(),
  slotEnd: z.string(),
  durationMinutes: z.number(),
  channel: z.string().default('GOOGLE_MEET'),
  meetLink: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  ratingComment: z.string().nullable().optional(),
  cancelledReason: z.string().nullable().optional(),
  // Wave 7A: CA-cancel fields
  cancelledByCa: z.boolean().optional(),
  caCancellationReason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
})
export type Appointment = z.infer<typeof AppointmentSchema>

export const AppointmentListSchema = z.object({
  items: z.array(AppointmentSchema),
  totalCount: z.number(),
})

// ---------------------------------------------------------------------------
// Preview slots
// ---------------------------------------------------------------------------

export const PreviewSlotsSchema = z.object({
  date: z.string(),
  slots: z.array(AppointmentSlotSchema),
  hasBookings: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface ListSlotsParams {
  caId: string
  date: string
}

export interface BookAppointmentRequest {
  caId: string
  slotId: string
  topic: AppointmentTopic
  topicNote?: string
}

export interface ListAppointmentsParams {
  status?: AppointmentStatus | AppointmentStatus[]
  caId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
  upcoming?: boolean
}

export interface RescheduleRequest {
  newSlotId: string
}

export interface SaveRuleRequest {
  weekday: Weekday
  startTime: string     // "HH:mm"
  endTime: string       // "HH:mm"
  slotDurationMinutes: number
  effectiveFrom?: string  // "YYYY-MM-DD"
  effectiveTo?: string    // "YYYY-MM-DD" | null
}

export interface SaveBlockRequest {
  caId: string
  blockStart: string
  blockEnd: string
  reason?: string
}

export interface GenerateSlotsRequest {
  caProfileId?: string
  weeksAhead?: number
}

// ---------------------------------------------------------------------------
// CA profiles — real endpoint (Wave 7A addendum)
// GET /appointments/ca-profiles?activeOnly=true&page=1&pageSize=20
// perm: chat.appointments.book
// ---------------------------------------------------------------------------

export async function listCaProfiles(activeOnly = true): Promise<CaProfile[]> {
  const res = await api.get('/appointments/ca-profiles', { params: { activeOnly, pageSize: 100 } })
  const parsed = ListCaProfilesResponseSchema.parse(res.data)
  return parsed.items.map(dto => ({
    caId: dto.caProfileId,
    userId: dto.userId,
    displayName: dto.displayName,
    bio: dto.bio ?? null,
    specialisations: dto.specialisations ?? null,
    averageRating: dto.averageRating,
    ratingCount: dto.ratingCount,
    isActive: dto.isActive,
    createdAt: dto.createdAt,
  }))
}

// ---------------------------------------------------------------------------
// Availability rules — real endpoints (Wave 7A addendum)
// perm: chat.slots.manage
// ---------------------------------------------------------------------------

/**
 * GET /appointments/availability-rules?caProfileId=&activeOnly=true
 * Admin can pass caProfileId; CA user omits it (backend resolves from ICurrentUser).
 */
export async function listAvailabilityRules(caProfileId?: string, activeOnly = true): Promise<AvailabilityRule[]> {
  const params: Record<string, unknown> = { activeOnly }
  if (caProfileId) params.caProfileId = caProfileId
  const res = await api.get('/appointments/availability-rules', { params })
  const parsed = ListAvailabilityRulesResponseSchema.parse(res.data)
  return parsed.items.map(mapDtoToRule)
}

/**
 * POST /appointments/availability-rules
 * Body: { weekday (int), startTimeIst, endTimeIst, slotDurationMinutes, effectiveFrom, effectiveTo? }
 */
export async function createAvailabilityRule(req: SaveRuleRequest): Promise<AvailabilityRule> {
  const today = new Date().toISOString().split('T')[0]
  const body = {
    weekday: WEEKDAY_TO_DOW[req.weekday],
    startTimeIst: hhmmToTimeSpan(req.startTime),
    endTimeIst: hhmmToTimeSpan(req.endTime),
    slotDurationMinutes: req.slotDurationMinutes,
    effectiveFrom: req.effectiveFrom ?? today,
    effectiveTo: req.effectiveTo ?? null,
  }
  const res = await api.post('/appointments/availability-rules', body)
  return mapDtoToRule(AvailabilityRuleDtoSchema.parse(res.data))
}

/**
 * DELETE /appointments/availability-rules/{id}
 * Soft-deletes (deactivates) a rule. Does not delete generated slots.
 */
export async function deleteAvailabilityRule(ruleId: string): Promise<void> {
  await api.delete(`/appointments/availability-rules/${ruleId}`)
}

/**
 * POST /appointments/availability-rules/generate
 * Body: { caProfileId?, weeksAhead? (1–52, default 4) }
 * Idempotent — existing slots are skipped.
 */
export async function generateSlotsFromRules(req: GenerateSlotsRequest = {}): Promise<GenerateSlotsResponse> {
  const res = await api.post('/appointments/availability-rules/generate', req)
  return GenerateSlotsResponseSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Availability blocks — no backend endpoint yet; stubs return empty
// ---------------------------------------------------------------------------

export async function listAvailabilityBlocks(_caId: string): Promise<AvailabilityBlock[]> {
  return []
}

export async function createAvailabilityBlock(req: SaveBlockRequest): Promise<AvailabilityBlock> {
  return { id: `stub-${Date.now()}`, caId: req.caId, blockStart: req.blockStart, blockEnd: req.blockEnd, reason: req.reason }
}

export async function deleteAvailabilityBlock(_caId: string, _blockId: string): Promise<void> {
  // no-op: no backend endpoint
}

export async function getAvailabilityPreview(_caId: string, _days = 7): Promise<PreviewSlotsSchema[]> {
  return []
}

type PreviewSlotsSchema = z.infer<typeof PreviewSlotsSchema>

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export async function listSlots(params: ListSlotsParams): Promise<AppointmentSlot[]> {
  const res = await api.get('/appointments/slots', {
    params: { caProfileId: params.caId, date: params.date },
  })
  return z.array(AppointmentSlotSchema).parse(res.data)
}

// ---------------------------------------------------------------------------
// Appointments
// GET    /appointments?status=&page=&pageSize=
// POST   /appointments
// POST   /appointments/:id/reschedule
// POST   /appointments/:id/cancel
// POST   /appointments/:id/cancel-by-ca   ← Wave 7A addendum (real endpoint)
// POST   /appointments/:id/rate
// ---------------------------------------------------------------------------

export async function listAppointments(params: ListAppointmentsParams = {}): Promise<{
  items: Appointment[]
  totalCount: number
}> {
  const res = await api.get('/appointments', { params })
  return AppointmentListSchema.parse(res.data)
}

export async function getAppointment(id: string): Promise<Appointment> {
  const res = await api.get(`/appointments/${id}`)
  return AppointmentSchema.parse(res.data)
}

export async function bookAppointment(req: BookAppointmentRequest): Promise<Appointment> {
  const res = await api.post('/appointments', {
    caProfileId: req.caId,
    slotId: req.slotId,
    notes: req.topicNote,
  })
  return AppointmentSchema.parse(res.data)
}

export async function rescheduleAppointment(id: string, req: RescheduleRequest): Promise<Appointment> {
  const res = await api.post(`/appointments/${id}/reschedule`, { newSlotId: req.newSlotId })
  return AppointmentSchema.parse(res.data)
}

export async function cancelAppointment(id: string): Promise<void> {
  await api.post(`/appointments/${id}/cancel`)
}

export async function rateAppointment(id: string, rating: number, comment?: string): Promise<void> {
  await api.post(`/appointments/${id}/rate`, { stars: rating, comment })
}

/**
 * CA-initiated cancel — Wave 7A addendum.
 * POST /appointments/{id}/cancel-by-ca { reason }
 * perm: chat.slots.manage
 * No 2h window restriction (unlike user cancel). Reason is mandatory (validated on backend).
 */
export async function cancelAppointmentAsCA(id: string, reason: string): Promise<void> {
  await api.post(`/appointments/${id}/cancel-by-ca`, { reason })
}
