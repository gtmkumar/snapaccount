/**
 * GSTN IMS (Invoice Management System) API client — GAP-101 / Board #32
 * Mandatory regulatory surface from 1 Apr 2026.
 *
 * Endpoints backed by GstService :5104 → GstIms.cs
 * All calls via shared axios instance (VITE_API_BASE_URL — never hardcoded).
 * Every response schema is Zod-validated.
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Shared enums — verbatim from ImsInvoice.cs + spec §0
// ---------------------------------------------------------------------------

export const IMS_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'PENDING_KEPT'] as const
export type ImsStatus = (typeof IMS_STATUSES)[number]

export const IMS_ACTIONS = ['ACCEPTED', 'REJECTED', 'PENDING_KEPT'] as const
export type ImsAction = (typeof IMS_ACTIONS)[number]

export const GSTR1A_STATUSES = ['DRAFT', 'SUBMITTED', 'FILED'] as const
export type Gstr1aStatus = (typeof GSTR1A_STATUSES)[number]

export const GSTR1A_AMENDMENT_TYPES = [
  'B2B_AMENDMENT',
  'B2BA',
  'CDNR_AMENDMENT',
  'CDNRA',
] as const
export type Gstr1aAmendmentType = (typeof GSTR1A_AMENDMENT_TYPES)[number]

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** IMS invoice summary — returned in list endpoint */
export const ImsInvoiceSummarySchema = z.object({
  id: z.string().uuid(),
  supplierGstin: z.string(),
  supplierName: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(), // ISO YYYY-MM-DD
  invoiceValue: z.number(),
  taxableValue: z.number(),
  igstAmount: z.number(),
  cgstAmount: z.number(),
  sgstAmount: z.number(),
  cessAmount: z.number(),
  period: z.string(), // MMYYYY
  source: z.string(), // "GSTR-1" | "IFF"
  status: z.enum(IMS_STATUSES),
  deemedAccepted: z.boolean(),
  actionedAt: z.string().nullable().optional(),
  actionedBy: z.string().uuid().nullable().optional(),
})

export type ImsInvoiceSummary = z.infer<typeof ImsInvoiceSummarySchema>

/** IMS invoice action log entry — returned in detail endpoint */
export const ImsActionLogEntrySchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  action: z.string(),
  actionedBy: z.string().uuid(),
  actionedAt: z.string(),
  reason: z.string().nullable().optional(),
  previousStatus: z.string().nullable().optional(),
  newStatus: z.string(),
})

export type ImsActionLogEntry = z.infer<typeof ImsActionLogEntrySchema>

/** Full IMS invoice detail — returned by GET /gst/ims/invoices/:id */
export const ImsInvoiceDetailSchema = ImsInvoiceSummarySchema.extend({
  rejectionReason: z.string().nullable().optional(),
  actionLog: z.array(ImsActionLogEntrySchema).optional(),
})

export type ImsInvoiceDetail = z.infer<typeof ImsInvoiceDetailSchema>

/** Paginated list response */
export const ImsInvoiceListSchema = z.object({
  items: z.array(ImsInvoiceSummarySchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export type ImsInvoiceList = z.infer<typeof ImsInvoiceListSchema>

/** IMS summary — 4 status counts + deadline info */
export const ImsSummarySchema = z.object({
  period: z.string(),
  pending: z.number(),
  accepted: z.number(),
  rejected: z.number(),
  pendingKept: z.number(),
  total: z.number(),
  deemedAccepted: z.boolean(),
  gstr2bGenerationDeadline: z.string(), // ISO date
  gstr2bGenerationPast: z.boolean(),
  totalPendingValue: z.number().optional(),
  totalAcceptedValue: z.number().optional(),
  totalRejectedValue: z.number().optional(),
})

export type ImsSummary = z.infer<typeof ImsSummarySchema>

/** Response from a single invoice action */
export const ImsActionResponseSchema = z.object({
  invoiceId: z.string().uuid(),
  previousStatus: z.string(),
  newStatus: z.string(),
  changed: z.boolean(),
  gstnRef: z.string().nullable().optional(),
})

export type ImsActionResponse = z.infer<typeof ImsActionResponseSchema>

/** Per-item result in bulk action response */
export const BulkImsActionResultSchema = z.object({
  invoiceId: z.string().uuid(),
  success: z.boolean(),
  newStatus: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
})

export type BulkImsActionResult = z.infer<typeof BulkImsActionResultSchema>

/** Bulk action response */
export const BulkImsActionResponseSchema = z.object({
  totalRequested: z.number(),
  changed: z.number(),
  skipped: z.number(),
  failed: z.number(),
  results: z.array(BulkImsActionResultSchema),
})

export type BulkImsActionResponse = z.infer<typeof BulkImsActionResponseSchema>

/** Sync response */
export const ImsSyncResponseSchema = z.object({
  inserted: z.number(),
  skipped: z.number(),
  period: z.string(),
})

export type ImsSyncResponse = z.infer<typeof ImsSyncResponseSchema>

// ---------------------------------------------------------------------------
// GSTR-1A schemas
// ---------------------------------------------------------------------------

export const Gstr1aAmendmentSummarySchema = z.object({
  id: z.string().uuid(),
  originalInvoiceNumber: z.string(),
  originalSupplierGstin: z.string(),
  originalImsInvoiceId: z.string().uuid().nullable().optional(),
  amendmentType: z.enum(GSTR1A_AMENDMENT_TYPES),
  period: z.string(), // MMYYYY
  status: z.enum(GSTR1A_STATUSES),
  arnNumber: z.string().nullable().optional(),
  filedAt: z.string().nullable().optional(),
  createdAt: z.string(),
})

export type Gstr1aAmendmentSummary = z.infer<typeof Gstr1aAmendmentSummarySchema>

export const Gstr1aAmendmentListSchema = z.object({
  items: z.array(Gstr1aAmendmentSummarySchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export type Gstr1aAmendmentList = z.infer<typeof Gstr1aAmendmentListSchema>

export const Gstr1aCreateResponseSchema = z.object({
  amendmentId: z.string().uuid(),
  status: z.enum(GSTR1A_STATUSES),
})

export type Gstr1aCreateResponse = z.infer<typeof Gstr1aCreateResponseSchema>

// ---------------------------------------------------------------------------
// API function parameter types
// ---------------------------------------------------------------------------

export interface ListImsInvoicesParams {
  organizationId: string
  period?: string
  status?: string
  supplierGstin?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface ActOnImsInvoiceRequest {
  organizationId: string
  actionedBy: string
  action: ImsAction
  reason?: string
}

export interface BulkImsActionItem {
  invoiceId: string
  action: ImsAction
  reason?: string
}

export interface BulkActOnImsInvoicesRequest {
  organizationId: string
  actionedBy: string
  items: BulkImsActionItem[]
}

export interface SyncImsInvoicesRequest {
  organizationId: string
  gstin: string
  period: string
}

export interface CreateGstr1aAmendmentRequest {
  organizationId: string
  originalInvoiceNumber: string
  originalSupplierGstin: string
  originalImsInvoiceId?: string
  amendmentType: Gstr1aAmendmentType
  amendmentPayloadJson: string
  period: string
}

export interface ListGstr1aAmendmentsParams {
  organizationId: string
  period?: string
  status?: string
  page?: number
  pageSize?: number
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** GET /gst/ims/invoices — paginated, filterable IMS inbox */
export async function listImsInvoices(params: ListImsInvoicesParams): Promise<ImsInvoiceList> {
  const res = await api.get('/gst/ims/invoices', { params })
  return ImsInvoiceListSchema.parse(res.data)
}

/** GET /gst/ims/invoices/:id — full detail + action log */
export async function getImsInvoice(id: string, organizationId: string): Promise<ImsInvoiceDetail> {
  const res = await api.get(`/gst/ims/invoices/${id}`, { params: { organizationId } })
  return ImsInvoiceDetailSchema.parse(res.data)
}

/** POST /gst/ims/invoices/:id/action — single action (accept/reject/keep-pending) */
export async function actOnImsInvoice(
  invoiceId: string,
  body: ActOnImsInvoiceRequest,
): Promise<ImsActionResponse> {
  const res = await api.post(`/gst/ims/invoices/${invoiceId}/action`, body)
  return ImsActionResponseSchema.parse(res.data)
}

/** POST /gst/ims/actions/bulk — bulk action (max 100 items) */
export async function bulkActOnImsInvoices(
  body: BulkActOnImsInvoicesRequest,
): Promise<BulkImsActionResponse> {
  const res = await api.post('/gst/ims/actions/bulk', body)
  return BulkImsActionResponseSchema.parse(res.data)
}

/** GET /gst/ims/summary — status counts + deadline info for a period */
export async function getImsSummary(organizationId: string, period: string): Promise<ImsSummary> {
  const res = await api.get('/gst/ims/summary', { params: { organizationId, period } })
  return ImsSummarySchema.parse(res.data)
}

/** POST /gst/ims/sync — pull invoices from GSTN for a period */
export async function syncImsInvoices(body: SyncImsInvoicesRequest): Promise<ImsSyncResponse> {
  const res = await api.post('/gst/ims/sync', body)
  return ImsSyncResponseSchema.parse(res.data)
}

/** GET /gst/gstr1a — list GSTR-1A amendments */
export async function listGstr1aAmendments(
  params: ListGstr1aAmendmentsParams,
): Promise<Gstr1aAmendmentList> {
  const res = await api.get('/gst/gstr1a', { params })
  return Gstr1aAmendmentListSchema.parse(res.data)
}

/** POST /gst/gstr1a — create a GSTR-1A amendment draft */
export async function createGstr1aAmendment(
  body: CreateGstr1aAmendmentRequest,
): Promise<Gstr1aCreateResponse> {
  const res = await api.post('/gst/gstr1a', body)
  return Gstr1aCreateResponseSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Period format helpers (MMYYYY ↔ display label)
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Convert MMYYYY API period to human-readable label.
 * "032026" → "March 2026"
 */
export function periodToLabel(mmyyyy: string): string {
  if (!mmyyyy || mmyyyy.length < 6) return mmyyyy
  const mm = parseInt(mmyyyy.slice(0, 2), 10)
  const yyyy = mmyyyy.slice(2)
  if (mm < 1 || mm > 12) return mmyyyy
  return `${MONTH_NAMES[mm - 1]} ${yyyy}`
}

/**
 * Convert MMYYYY to short label.
 * "032026" → "Mar 2026"
 */
export function periodToShortLabel(mmyyyy: string): string {
  if (!mmyyyy || mmyyyy.length < 6) return mmyyyy
  const mm = parseInt(mmyyyy.slice(0, 2), 10)
  const yyyy = mmyyyy.slice(2)
  if (mm < 1 || mm > 12) return mmyyyy
  return `${MONTH_NAMES[mm - 1].slice(0, 3)} ${yyyy}`
}

/**
 * Generate a list of the last N period strings (MMYYYY), newest first.
 * Useful for the period selector dropdown.
 */
export function getLastNPeriods(n = 12): string[] {
  const periods: string[] = []
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1 // 1-based

  for (let i = 0; i < n; i++) {
    const mm = String(month).padStart(2, '0')
    periods.push(`${mm}${year}`)
    month--
    if (month < 1) {
      month = 12
      year--
    }
  }

  return periods
}

/**
 * Get the current open period (most recent month whose 14th has not passed).
 */
export function getCurrentOpenPeriod(): string {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1 // 1-based

  // If today is past the 14th, the current month is "open" for next month's 14th
  // If today is on or before the 14th, the previous month's invoices are actionable
  if (now.getDate() > 14) {
    // Current month's invoices — deadline is 14th of next month
  } else {
    // Previous month's invoices — deadline was 14th of this month (still open)
    month--
    if (month < 1) {
      month = 12
      year--
    }
  }

  return `${String(month).padStart(2, '0')}${year}`
}

/** Format a date string as DD/MM/YYYY for list display */
export function formatDateDMY(isoDate: string): string {
  if (!isoDate) return ''
  try {
    const d = new Date(isoDate)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    const yr = d.getFullYear()
    return `${day}/${mon}/${yr}`
  } catch {
    return isoDate
  }
}

/** Format a date string as DD MMM YYYY for banners/detail */
export function formatDateDMMMY(isoDate: string): string {
  if (!isoDate) return ''
  try {
    const d = new Date(isoDate)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = d.toLocaleString('en-IN', { month: 'short' })
    const yr = d.getFullYear()
    return `${day} ${mon} ${yr}`
  } catch {
    return isoDate
  }
}

/** Format a timestamp as "DD MMM YYYY, HH:mm" in IST */
export function formatTimestampIST(isoTimestamp: string): string {
  if (!isoTimestamp) return ''
  try {
    const d = new Date(isoTimestamp)
    const day = String(d.getDate()).padStart(2, '0')
    const mon = d.toLocaleString('en-IN', { month: 'short' })
    const yr = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${day} ${mon} ${yr}, ${hh}:${mm}`
  } catch {
    return isoTimestamp
  }
}

/**
 * Calculate days until deemed-acceptance deadline from today.
 * Returns negative if deadline has passed.
 */
export function daysUntilDeadline(deadlineIso: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const deadline = new Date(deadlineIso)
  deadline.setHours(0, 0, 0, 0)
  return Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * True if the given IMS status allows accepting.
 */
export function canAccept(status: ImsStatus): boolean {
  return status === 'PENDING' || status === 'PENDING_KEPT'
}

/**
 * True if the given IMS status allows rejecting.
 */
export function canReject(status: ImsStatus): boolean {
  return status === 'PENDING' || status === 'PENDING_KEPT'
}

/**
 * True if the given IMS status allows keep-pending.
 */
export function canKeepPending(status: ImsStatus): boolean {
  return status === 'PENDING'
}
