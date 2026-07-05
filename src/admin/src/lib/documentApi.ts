/**
 * Document Service API client
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 *
 * Endpoints backed by the real backend (Documents.cs):
 *   GET    /documents            — paginated list (filters: status, categoryId, page, pageSize)
 *   GET    /documents/{id}       — single document + OCR fields
 *   PUT    /documents/{id}/category  — categorize (returns 204)
 *   POST   /documents/{id}/ocr  — request OCR processing (returns 202)
 *   POST   /documents/{id}/share — share document
 *   GET    /documents/admin/dashboard-stats — admin stats
 *   GET    /documents/admin/activity        — daily activity series
 *   GET    /documents/admin/users/{userId}/documents — user docs
 *   GET    /documents/admin/queue           — DG-DOC-04: admin queue with server SLA fields
 *
 * Review-decision endpoints (B15 — backend now implemented):
 *   POST   /documents/{id}/approve              — approve (requires document.review)
 *   POST   /documents/{id}/reject               — reject with reason (requires document.review)
 *   POST   /documents/{id}/request-clarification — ask user for clarification (requires document.review)
 *   POST   /documents/{id}/archive              — archive (requires document.archive)
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Confidence level derived by backend (>= 0.8 → GREEN, >= 0.5 → YELLOW, else RED). */
export const OcrConfidenceLevelSchema = z.enum(['GREEN', 'YELLOW', 'RED'])
export type OcrConfidenceLevel = z.infer<typeof OcrConfidenceLevelSchema>

export const OcrFieldSchema = z.object({
  name: z.string(),
  value: z.string().nullable(),
  /** Normalised 0-1 float. May be absent when field was hand-typed. */
  confidence: z.number().nullable(),
})
export type OcrField = z.infer<typeof OcrFieldSchema>

/** Paginated list item — returned by GET /documents */
export const DocumentListItemSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  status: z.string(),
  vendorName: z.string().nullable(),
  amount: z.number().nullable(),
  documentDate: z.string().nullable(),
  uploadedAt: z.string(),
})
export type DocumentListItem = z.infer<typeof DocumentListItemSchema>

export const DocumentsPageSchema = z.object({
  items: z.array(DocumentListItemSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
})
export type DocumentsPage = z.infer<typeof DocumentsPageSchema>

/** Full document detail — returned by GET /documents/{id} */
export const DocumentDetailSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number().nullable(),
  status: z.string(),
  /** Signed GCS URL — may be null if storage upload is pending. */
  storageUrl: z.string().nullable(),
  amount: z.number().nullable(),
  vendorName: z.string().nullable(),
  documentDate: z.string().nullable(),
  uploadedAt: z.string(),
  /** Overall OCR confidence (0-1 scale), present when OCR has run. */
  ocrConfidence: z.number().nullable(),
  /** Backend-computed band: GREEN / YELLOW / RED. */
  ocrConfidenceLevel: OcrConfidenceLevelSchema.nullable(),
  /** Individual field extractions from the latest OCR result. */
  fields: z.array(OcrFieldSchema).nullable(),
})
export type DocumentDetail = z.infer<typeof DocumentDetailSchema>

/** Response for POST /documents/{id}/share */
export const ShareResponseSchema = z.object({
  shareId: z.string().uuid(),
  shareUrl: z.string().optional(),
  expiresAt: z.string().nullable(),
})
export type ShareResponse = z.infer<typeof ShareResponseSchema>

/** Admin dashboard stats — GET /documents/admin/dashboard-stats */
export const DocumentDashboardStatsSchema = z.object({
  pendingCount: z.number(),
  ocrCompleteCount: z.number().optional(),
  inReviewCount: z.number().optional(),
})
export type DocumentDashboardStats = z.infer<typeof DocumentDashboardStatsSchema>

/** Admin activity series — GET /documents/admin/activity */
export const DocumentActivityItemSchema = z.object({
  date: z.string(),
  count: z.number(),
})
export const DocumentActivitySchema = z.array(DocumentActivityItemSchema)
export type DocumentActivity = z.infer<typeof DocumentActivitySchema>

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export interface ListDocumentsParams {
  page?: number
  pageSize?: number
  status?: string
  categoryId?: string
  fromDate?: string
  toDate?: string
}

/** GET /documents — paginated list with optional filters. */
export async function listDocuments(params: ListDocumentsParams = {}): Promise<DocumentsPage> {
  const res = await api.get('/documents', { params })
  return DocumentsPageSchema.parse(res.data)
}

/** GET /documents/{id} — full document detail with OCR fields. */
export async function getDocument(id: string): Promise<DocumentDetail> {
  const res = await api.get(`/documents/${id}`)
  return DocumentDetailSchema.parse(res.data)
}

/**
 * PUT /documents/{id}/category — assign a document to a category.
 * Returns 204 No Content on success.
 */
export async function categorizeDocument(documentId: string, categoryId: string): Promise<void> {
  await api.put(`/documents/${documentId}/category`, { categoryId })
}

/**
 * POST /documents/{id}/ocr — queue OCR processing for a document.
 * Returns 202 Accepted.
 */
export async function requestOcr(documentId: string): Promise<void> {
  await api.post(`/documents/${documentId}/ocr`)
}

export interface ShareDocumentRequest {
  shareType: string
  sharedWith?: string
  externalEmail?: string
  expiresAt?: string
}

/** POST /documents/{id}/share — create a share link/grant. */
export async function shareDocument(
  documentId: string,
  body: ShareDocumentRequest,
): Promise<ShareResponse> {
  const res = await api.post(`/documents/${documentId}/share`, body)
  return ShareResponseSchema.parse(res.data)
}

/** GET /documents/admin/dashboard-stats — pending document count for cross-service dashboard. */
export async function getDocumentDashboardStats(): Promise<DocumentDashboardStats> {
  const res = await api.get('/documents/admin/dashboard-stats')
  return DocumentDashboardStatsSchema.parse(res.data)
}

/** GET /documents/admin/activity?range=7D|30D|90D — daily creation series. */
export async function getDocumentActivity(range: '7D' | '30D' | '90D' = '7D'): Promise<DocumentActivity> {
  const res = await api.get('/documents/admin/activity', { params: { range } })
  return DocumentActivitySchema.parse(res.data)
}

/** GET /documents/admin/users/{userId}/documents — recent documents for a specific user. */
export async function getAdminUserDocuments(userId: string, limit = 20): Promise<DocumentListItem[]> {
  const res = await api.get(`/documents/admin/users/${userId}/documents`, { params: { limit } })
  return z.array(DocumentListItemSchema).parse(res.data)
}

// ---------------------------------------------------------------------------
// DG-DOC-04: Admin document queue with server-computed SLA fields
// Endpoint: GET /documents/admin/queue (GetAdminDocumentQueueQuery, document.admin)
// ---------------------------------------------------------------------------

/**
 * DG-DOC-04: Admin queue item with server-computed SLA fields.
 * ocrConfidence is optional — the current backend queue DTO does not project it
 * (it requires a join to ocr_result). When the backend adds it, this schema will
 * parse it automatically without any further frontend changes.
 */
export const AdminDocumentQueueItemSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  status: z.string(),
  categoryCode: z.string().nullable(),
  categoryName: z.string().nullable(),
  vendorName: z.string().nullable(),
  amount: z.number().nullable(),
  documentDate: z.string().nullable(),
  uploadedAt: z.string(),
  /** Server-computed deadline = uploadedAt + category.SlaHours. Null if no category SLA. */
  slaDeadline: z.string().nullable(),
  /** Hours remaining until SLA breach. Negative = already overdue. Null if no category SLA. */
  slaHoursRemaining: z.number().nullable(),
  /** True when past SLA deadline and document is still pending (not yet APPROVED/REJECTED/ARCHIVED). */
  isOverdue: z.boolean(),
  organizationId: z.string().uuid().nullable(),
  /**
   * Overall OCR confidence (0-1 scale). Optional — backend queue DTO does not yet project this
   * field; when added, it will surface here automatically. Frontend passes ocrConfidence filter
   * params to the backend now so the wire-up is ready.
   */
  ocrConfidence: z.number().nullable().optional(),
})
export type AdminDocumentQueueItem = z.infer<typeof AdminDocumentQueueItemSchema>

export const AdminDocumentQueuePageSchema = z.object({
  items: z.array(AdminDocumentQueueItemSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
})
export type AdminDocumentQueuePage = z.infer<typeof AdminDocumentQueuePageSchema>

export type AdminQueueSortBy = 'sla_asc' | 'uploaded_desc'
export type OcrConfidenceBand = 'high' | 'medium' | 'low'

export interface GetAdminDocumentQueueParams {
  page?: number
  pageSize?: number
  status?: string
  categoryId?: string
  overdueOnly?: boolean
  /** Sort order: 'sla_asc' (overdue first) | 'uploaded_desc' (default). */
  sortBy?: AdminQueueSortBy
  /**
   * OCR confidence band filter. Translates to approximate server-side thresholds:
   *   high   → ocrMinConfidence=0.8
   *   medium → ocrMinConfidence=0.5 & ocrMaxConfidence=0.8
   *   low    → ocrMaxConfidence=0.5
   * Backend ignores unknown params, so this is forward-compatible once the server
   * implements the filter.
   */
  ocrBand?: OcrConfidenceBand
}

/** GET /documents/admin/queue — DG-DOC-04: admin queue with server-computed SLA / overdue fields. */
export async function getAdminDocumentQueue(
  params: GetAdminDocumentQueueParams = {},
): Promise<AdminDocumentQueuePage> {
  // Translate ocrBand -> numeric confidence range query params
  const { ocrBand, ...rest } = params
  const ocrParams: Record<string, number> = {}
  if (ocrBand === 'high') {
    ocrParams.ocrMinConfidence = 0.8
  } else if (ocrBand === 'medium') {
    ocrParams.ocrMinConfidence = 0.5
    ocrParams.ocrMaxConfidence = 0.8
  } else if (ocrBand === 'low') {
    ocrParams.ocrMaxConfidence = 0.5
  }
  const res = await api.get('/documents/admin/queue', { params: { ...rest, ...ocrParams } })
  return AdminDocumentQueuePageSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Review-decision API responses (B15)
// ---------------------------------------------------------------------------

/** Standard message response for review-decision endpoints */
const ReviewDecisionResponseSchema = z.object({
  message: z.string(),
})
export type ReviewDecisionResponse = z.infer<typeof ReviewDecisionResponseSchema>

/**
 * POST /documents/{id}/approve
 * Transitions the document to Approved status. Requires document.review permission.
 */
export async function approveDocument(documentId: string): Promise<ReviewDecisionResponse> {
  const res = await api.post(`/documents/${documentId}/approve`)
  return ReviewDecisionResponseSchema.parse(res.data)
}

/**
 * POST /documents/{id}/reject
 * Rejects the document with a mandatory reason (≤2000 chars). Requires document.review permission.
 */
export async function rejectDocument(
  documentId: string,
  reason: string,
): Promise<ReviewDecisionResponse> {
  const res = await api.post(`/documents/${documentId}/reject`, { reason })
  return ReviewDecisionResponseSchema.parse(res.data)
}

/**
 * POST /documents/{id}/request-clarification
 * Sends a clarification request back to the user. Requires document.review permission.
 */
export async function requestDocumentClarification(
  documentId: string,
  message: string,
): Promise<ReviewDecisionResponse> {
  const res = await api.post(`/documents/${documentId}/request-clarification`, { message })
  return ReviewDecisionResponseSchema.parse(res.data)
}

/**
 * POST /documents/{id}/archive
 * Archives the document. Requires document.archive permission.
 */
export async function archiveDocument(documentId: string): Promise<ReviewDecisionResponse> {
  const res = await api.post(`/documents/${documentId}/archive`)
  return ReviewDecisionResponseSchema.parse(res.data)
}
