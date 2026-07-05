/**
 * CA Appointment API — GAP-031 (Wave 7A, ChatService).
 *
 * RECONCILED 2026-06-12 against docs/api/endpoints.md "Wave 7A" (+ addendum)
 * and backend/Services/AssistService/Assist.WebApi/Endpoints/Chat/Appointments.cs:
 *  - Base path /appointments (ChatService :5107 — see lib/api SERVICE_PORTS)
 *  - GET  /appointments/ca-profiles                  → { items: CaProfileDto[] }
 *  - GET  /appointments/slots?caProfileId&date       → { slots: AvailableSlotDto[] }
 *  - GET  /appointments/slots/day-map?caProfileId&from&to
 *      → { days: [{ date, availableCount }] } (≤90-day range, DateStrip source)
 *  - POST /appointments { caProfileId, slotId, notes, topic } → BookAppointmentResponse
 *  - GET  /appointments?status&page&pageSize         → { items, totalCount, page, pageSize }
 *  - GET  /appointments/{id}                         → AppointmentDetailDto (IDOR-guarded)
 *  - POST /appointments/{id}/reschedule { newSlotId } (≥2h rule server-enforced;
 *    400 Appointment.TooLateToReschedule)
 *  - POST /appointments/{id}/cancel                  (400 Appointment.TooLateToCancel)
 *  - POST /appointments/{id}/rate { stars, comment } (409 Appointment.AlreadyRated)
 *
 * RESIDUALS CLOSED (Wave 7 mobile reconciliation, migration 086):
 *  - GET /appointments/{id} now exists — the list-scan workaround is gone.
 *  - `topic` is a first-class field on book/list/detail DTOs (CHECK enum
 *    ACCOUNTING|GST|ITR|LOAN|OTHER) — the "[TOPIC] " notes-prefix is gone.
 *  - GET /appointments/slots/day-map feeds the DateStrip — no client-side
 *    availability derivation.
 *  Still client-side by design: the upcoming/past partition of the list.
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types (server shapes)
// ─────────────────────────────────────────────────────────────────────────────

/** Server status enum (chat.appointments CHECK constraint, migration 080). */
export type AppointmentStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

/**
 * Consult topic (spec §1.2) — first-class server field since migration 086
 * (chat.appointments.topic, CHECK constraint on exactly these values).
 */
export type ConsultTopic = 'ACCOUNTING' | 'GST' | 'ITR' | 'LOAN' | 'OTHER';

export interface CaProfile {
  caProfileId: string;
  userId: string;
  displayName: string;
  bio?: string | null;
  specialisations?: string[] | string | null;
  averageRating?: number | null;
  ratingCount?: number;
  isActive: boolean;
}

/** UI slot shape (mapped from AvailableSlotDto — only available slots returned). */
export interface AppointmentSlot {
  slotId: string;
  /** Slot start, UTC ISO — rendered in IST on all surfaces. */
  startsAt: string;
  durationMinutes: number;
  available: boolean;
}

export interface SlotDay {
  /** Calendar date in IST, `YYYY-MM-DD`. */
  date: string;
  /** Count of still-available slots that day (0 = fully booked or none). */
  availableCount: number;
  hasSlots: boolean;
}

export interface SlotAvailabilityResponse {
  slots: AppointmentSlot[];
}

/** UI appointment shape (mapped from AppointmentSummaryDto). */
export interface Appointment {
  appointmentId: string;
  caProfileId: string;
  caName: string;
  /** UTC ISO start; rendered IST. */
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  /** Server field (migration 086). Null on legacy rows booked before 086. */
  topic?: ConsultTopic | null;
  notes?: string | null;
  meetingUrl?: string | null;
  /** 1–5 once rated; null before. */
  rating?: number | null;
  createdAt: string;
}

/** Detail-only fields returned by GET /appointments/{id} (AppointmentDetailDto). */
export interface AppointmentDetail extends Appointment {
  ratingComment?: string | null;
  ratedAt?: string | null;
  cancelledByCa?: boolean;
  caCancellationReason?: string | null;
  /**
   * Post-call summary note written by the CA after the appointment is COMPLETED.
   * DG-CHAT-05 (migration 105). Null until the CA submits one via
   * PUT /appointments/{id}/ca-summary (chat.slots.manage perm).
   */
  caSummaryNote?: string | null;
}

export interface AppointmentListResponse {
  items: Appointment[];
  totalCount: number;
}

export interface BookAppointmentRequest {
  caProfileId: string;
  slotId: string;
  topic: ConsultTopic;
  notes?: string;
}

interface AppointmentSummaryDto {
  appointmentId: string;
  caProfileId: string;
  caDisplayName: string;
  slotStartUtc: string;
  slotEndUtc: string;
  status: AppointmentStatus;
  meetLink?: string | null;
  ratingStars?: number | null;
  createdAt: string;
  /** First-class since migration 086 — null on legacy rows. */
  topic?: string | null;
  notes?: string | null;
}

/** Server AppointmentDetailDto — superset of the list-item DTO. */
interface AppointmentDetailDto extends AppointmentSummaryDto {
  ratingComment?: string | null;
  ratedAt?: string | null;
  cancelledByCa?: boolean;
  caCancellationReason?: string | null;
  /** DG-CHAT-05: CA post-call summary note (migration 105). */
  caSummaryNote?: string | null;
}

function durationMinutes(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms > 0 ? Math.round(ms / 60_000) : 30;
}

function mapSummary(dto: AppointmentSummaryDto): Appointment {
  return {
    appointmentId: dto.appointmentId,
    caProfileId: dto.caProfileId,
    caName: dto.caDisplayName,
    scheduledAt: dto.slotStartUtc,
    durationMinutes: durationMinutes(dto.slotStartUtc, dto.slotEndUtc),
    status: dto.status,
    topic: (dto.topic as ConsultTopic | null | undefined) ?? null,
    notes: dto.notes ?? null,
    meetingUrl: dto.meetLink ?? null,
    rating: dto.ratingStars ?? null,
    createdAt: dto.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

/** GET /appointments/ca-profiles — bookable CAs (activeOnly default true). */
export async function listCaProfiles(): Promise<CaProfile[]> {
  const res = await apiClient.get<{ items: CaProfile[] }>(
    '/appointments/ca-profiles',
    { params: { activeOnly: true, page: 1, pageSize: 50 } },
  );
  return res.data.items ?? [];
}

/** GET /appointments/slots?caProfileId&date — available slots for the day. */
export async function getCaSlots(
  caProfileId: string,
  date: string,
): Promise<SlotAvailabilityResponse> {
  const res = await apiClient.get<{
    slots: { slotId: string; startUtc: string; endUtc: string }[];
  }>('/appointments/slots', { params: { caProfileId, date } });
  return {
    slots: (res.data.slots ?? []).map((s) => ({
      slotId: s.slotId,
      startsAt: s.startUtc,
      durationMinutes: durationMinutes(s.startUtc, s.endUtc),
      available: true, // endpoint returns only available slots
    })),
  };
}

/**
 * GET /appointments/slots/day-map?caProfileId&from&to — per-day available-slot
 * counts (inclusive range, ≤90 days) for the DateStrip. availableCount=0 means
 * fully booked or no slots — the strip greys out that day.
 */
export async function getSlotDayMap(
  caProfileId: string,
  from: string,
  to: string,
): Promise<SlotDay[]> {
  const res = await apiClient.get<{
    days: { date: string; availableCount: number }[];
  }>('/appointments/slots/day-map', { params: { caProfileId, from, to } });
  return (res.data.days ?? []).map((d) => ({
    date: d.date,
    availableCount: d.availableCount,
    hasSlots: d.availableCount > 0,
  }));
}

/** POST /appointments — book a slot. Topic travels as its own field (086). */
export async function bookAppointment(
  req: BookAppointmentRequest,
): Promise<Appointment> {
  const res = await apiClient.post<{
    appointmentId: string;
    slotId: string;
    meetLink: string;
    slotStartUtc: string;
    slotEndUtc: string;
    status: AppointmentStatus;
    topic?: string | null;
  }>('/appointments', {
    caProfileId: req.caProfileId,
    slotId: req.slotId,
    notes: req.notes,
    topic: req.topic,
  });
  return {
    appointmentId: res.data.appointmentId,
    caProfileId: req.caProfileId,
    caName: '',
    scheduledAt: res.data.slotStartUtc,
    durationMinutes: durationMinutes(res.data.slotStartUtc, res.data.slotEndUtc),
    status: res.data.status,
    topic: (res.data.topic as ConsultTopic | null | undefined) ?? req.topic,
    notes: req.notes ?? null,
    meetingUrl: res.data.meetLink,
    rating: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * GET /appointments — org appointments. The contract has no upcoming/past
 * scope; partition client-side on slot start + status.
 */
export async function listAppointments(
  scope: 'upcoming' | 'past',
): Promise<AppointmentListResponse> {
  const res = await apiClient.get<{
    items: AppointmentSummaryDto[];
    totalCount: number;
  }>('/appointments', { params: { page: 1, pageSize: 100 } });
  const all = (res.data.items ?? []).map(mapSummary);
  const now = Date.now();
  const isUpcoming = (a: Appointment) =>
    (a.status === 'DRAFT' || a.status === 'CONFIRMED') &&
    new Date(a.scheduledAt).getTime() + a.durationMinutes * 60_000 >= now;
  const items = all.filter((a) => (scope === 'upcoming' ? isUpcoming(a) : !isUpcoming(a)));
  items.sort((a, b) =>
    scope === 'upcoming'
      ? a.scheduledAt.localeCompare(b.scheduledAt)
      : b.scheduledAt.localeCompare(a.scheduledAt),
  );
  return { items, totalCount: items.length };
}

/**
 * GET /appointments/{id} — single appointment detail (IDOR-guarded by org;
 * 404 when not found or owned by another org).
 */
export async function getAppointment(id: string): Promise<AppointmentDetail> {
  const res = await apiClient.get<AppointmentDetailDto>(`/appointments/${id}`);
  const dto = res.data;
  return {
    ...mapSummary(dto),
    ratingComment: dto.ratingComment ?? null,
    ratedAt: dto.ratedAt ?? null,
    cancelledByCa: dto.cancelledByCa ?? false,
    caCancellationReason: dto.caCancellationReason ?? null,
    caSummaryNote: dto.caSummaryNote ?? null,
  };
}

/**
 * POST /appointments/{id}/reschedule { newSlotId }.
 * ≥2h rule is server-enforced — 400 { code: "Appointment.TooLateToReschedule" }.
 */
export async function rescheduleAppointment(
  id: string,
  newSlotId: string,
): Promise<Appointment> {
  const res = await apiClient.post<{
    appointmentId: string;
    slotStartUtc?: string;
    slotEndUtc?: string;
    status?: AppointmentStatus;
  }>(`/appointments/${id}/reschedule`, { newSlotId });
  return {
    appointmentId: res.data.appointmentId ?? id,
    caProfileId: '',
    caName: '',
    scheduledAt: res.data.slotStartUtc ?? new Date().toISOString(),
    durationMinutes:
      res.data.slotStartUtc && res.data.slotEndUtc
        ? durationMinutes(res.data.slotStartUtc, res.data.slotEndUtc)
        : 30,
    status: res.data.status ?? 'CONFIRMED',
    rating: null,
    createdAt: new Date().toISOString(),
  };
}

/** POST /appointments/{id}/cancel — 400 Appointment.TooLateToCancel inside 2h. */
export async function cancelAppointment(id: string): Promise<void> {
  await apiClient.post(`/appointments/${id}/cancel`);
}

/** POST /appointments/{id}/rate { stars, comment? } — 409 if already rated. */
export async function rateAppointment(
  id: string,
  stars: number,
  comment?: string,
): Promise<void> {
  await apiClient.post(`/appointments/${id}/rate`, { stars, comment });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cutoff helper — UI mirror of the server-enforced ≥2h rule
// ─────────────────────────────────────────────────────────────────────────────

export const RESCHEDULE_CUTOFF_MS = 2 * 60 * 60 * 1000;

/** Epoch ms after which reschedule/cancel are closed (2h before start). */
export function getCutoffMs(scheduledAtIso: string): number {
  return new Date(scheduledAtIso).getTime() - RESCHEDULE_CUTOFF_MS;
}

/** True while the user may still reschedule/cancel (display only — server decides). */
export function isBeforeCutoff(scheduledAtIso: string, nowMs: number): boolean {
  return nowMs < getCutoffMs(scheduledAtIso);
}

/** Join window: 10 min before start until start + duration. */
export function isInJoinWindow(
  scheduledAtIso: string,
  durationMinutes_: number,
  nowMs: number,
): boolean {
  const start = new Date(scheduledAtIso).getTime();
  return nowMs >= start - 10 * 60 * 1000 && nowMs <= start + durationMinutes_ * 60 * 1000;
}
