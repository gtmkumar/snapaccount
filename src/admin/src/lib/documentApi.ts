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
