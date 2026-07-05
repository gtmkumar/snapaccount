/**
 * GST Service API client
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Zod schemas — existing
// ---------------------------------------------------------------------------

export const GstReturnSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  gstin: z.string(),
  businessName: z.string(),
  returnType: z.enum(['GSTR-1', 'GSTR-3B', 'GSTR-9']),
  period: z.string(),
  financialYear: z.string(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'FILED', 'REVISION_NEEDED']),
  dueDate: z.string(),
  taxPayable: z.number(),
  assignedCa: z.string().nullable(),
  slaExpiresAt: z.string(),
  arn: z.string().nullable().optional(),
  arnSavedAt: z.string().nullable().optional(),
  arnSavedBy: z.string().nullable().optional(),
})

export type GstReturn = z.infer<typeof GstReturnSchema>

export const GstReturnsListSchema = z.object({
  items: z.array(GstReturnSchema),
  totalCount: z.number(),
})

export const GstInvoiceLineItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  hsnSacCode: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  gstRate: z.number(),
  taxableValue: z.number(),
  cgst: z.number(),
  sgst: z.number(),
  igst: z.number(),
  cess: z.number(),
})

export type GstInvoiceLineItem = z.infer<typeof GstInvoiceLineItemSchema>

export const GstInvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  organizationId: z.string(),
  gstin: z.string(),
  buyerGstin: z.string().nullable(),
  invoiceDate: z.string(),
  totalTaxableValue: z.number(),
  totalGst: z.number(),
  totalAmount: z.number(),
  documentType: z.string(),
  placeOfSupply: z.string(),
  isInterstate: z.boolean(),
  lineItems: z.array(GstInvoiceLineItemSchema).optional(),
  irnNumber: z.string().nullable().optional(),
  ewbNumber: z.string().nullable().optional(),
})

export type GstInvoice = z.infer<typeof GstInvoiceSchema>

export const GstInvoicesListSchema = z.object({
  items: z.array(GstInvoiceSchema),
  totalCount: z.number(),
})

export const AuditEventSchema = z.object({
  id: z.string(),
  eventType: z.enum(['FILED', 'APPROVED', 'REJECTED', 'AMENDED', 'REVISION_REQUESTED', 'ASSIGNED', 'CREATED', 'UPDATED']),
  actorEmail: z.string(),
  actorDisplayName: z.string().nullable().optional(),
  timestamp: z.string(),
  detail: z.string().nullable().optional(),
  previousStatus: z.string().nullable().optional(),
  arnReceived: z.string().nullable().optional(),
  diffAvailable: z.boolean().optional(),
})

export type AuditEvent = z.infer<typeof AuditEventSchema>

export const AuditListSchema = z.object({
  items: z.array(AuditEventSchema),
  totalCount: z.number(),
  page: z.number(),
})

export const ArnSaveResponseSchema = z.object({
  arn: z.string(),
  savedAt: z.string(),
  savedBy: z.string(),
})

export type ArnSaveResponse = z.infer<typeof ArnSaveResponseSchema>

// ---------------------------------------------------------------------------
// Phase 6B: Notices
// ---------------------------------------------------------------------------

export const GstNoticeStatusSchema = z.enum(['RECEIVED', 'UNDER_REVIEW', 'RESPONDED', 'CLOSED'])
export type GstNoticeStatus = z.infer<typeof GstNoticeStatusSchema>

export const GstNoticeTypeSchema = z.enum([
  'ASMT-10',
  'ASMT-11',
  'DRC-01',
  'DRC-01A',
  'DRC-01B',
  'DRC-01C',
  'DRC-03',
  'ADT-01',
  'REG-17',
  'OTHER',
])
export type GstNoticeType = z.infer<typeof GstNoticeTypeSchema>

// GAP-108 Wave 7: GSTAT appeal stage enum [confirm 7B]
export const GstatStageEnum = z.enum([
  'ORIGINAL_ORDER',
  'APPEAL_FILED',
  'APPELLATE_ORDER',
  'GSTAT_FILED',
  'GSTAT_HEARING',
  'GSTAT_ORDER',
  'CLOSED',
]).optional()
export type GstatStageType = z.infer<typeof GstatStageEnum>

export const GstNoticeAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  fileSizeBytes: z.number(),
  gcsUri: z.string(),
  signedUrl: z.string().optional(),
  uploadedAt: z.string(),
  uploadedBy: z.string(),
})

export type GstNoticeAttachment = z.infer<typeof GstNoticeAttachmentSchema>

export const GstNoticeSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  gstin: z.string(),
  businessName: z.string().optional(),
  noticeNumber: z.string(),
  noticeType: GstNoticeTypeSchema,
  noticeDate: z.string(),
  dueDate: z.string().nullable(),
  // GAP-108 Wave 7: statutory response deadline [confirm 7B] field name may differ
  statutoryDeadline: z.string().nullable().optional(),
  responseDueDate: z.string().nullable().optional(),
  status: GstNoticeStatusSchema,
  description: z.string().nullable().optional(),
  assignedCaId: z.string().nullable().optional(),
  assignedCaName: z.string().nullable().optional(),
  responseText: z.string().nullable().optional(),
  respondedAt: z.string().nullable().optional(),
  respondedBy: z.string().nullable().optional(),
  submissionChannel: z.string().nullable().optional(),
  attachments: z.array(GstNoticeAttachmentSchema).optional(),
  // GAP-108 Wave 7: GSTAT appeal stage [confirm 7B]
  gstatStage: GstatStageEnum,
  gstatStageTimestamps: z.record(z.string(), z.string()).optional(),
  isGstatBacklogEligible: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type GstNotice = z.infer<typeof GstNoticeSchema>

export const GstNoticesListSchema = z.object({
  items: z.array(GstNoticeSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

/** Backend list DTO from GET /gst/notices (Finance ListNoticesQuery). */
const GstNoticeListItemBackendSchema = z.object({
  id: z.string(),
  noticeNumber: z.string(),
  noticeType: z.string(),
  formType: z.string().optional(),
  status: z.string(),
  issuedDate: z.string(),
  statutoryDeadline: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  deadlineOverridden: z.boolean().optional(),
  description: z.string().nullable().optional(),
  assignedCaId: z.string().nullable().optional(),
  respondedAt: z.string().nullable().optional(),
  appealStage: z.string().optional(),
  appealDeadline: z.string().nullable().optional(),
  isGstatBacklogFlagged: z.boolean().optional(),
})

const GstNoticesListBackendSchema = z.object({
  items: z.array(GstNoticeListItemBackendSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

/** Backend detail DTO from GET /gst/notices/{id}. */
const GstNoticeDetailBackendSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  noticeNumber: z.string(),
  noticeType: z.string(),
  formType: z.string().optional(),
  issuedBy: z.string().nullable().optional(),
  status: z.string(),
  issuedDate: z.string(),
  statutoryDeadline: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  deadlineOverridden: z.boolean().optional(),
  daysRemaining: z.number().nullable().optional(),
  isOverdue: z.boolean().optional(),
  description: z.string().nullable().optional(),
  assignedCaId: z.string().nullable().optional(),
  respondedAt: z.string().nullable().optional(),
  respondedBy: z.string().nullable().optional(),
  attachmentsJson: z.string().nullable().optional(),
  responseAttachmentsJson: z.string().nullable().optional(),
  appealStage: z.string().optional(),
  appealDeadline: z.string().nullable().optional(),
  appealDaysRemaining: z.number().nullable().optional(),
  isGstatBacklogFlagged: z.boolean().optional(),
})

function normalizeNoticeType(raw: string): string {
  return raw.trim().replace(/_/g, '-').toUpperCase()
}

function parseNoticeType(raw: string): GstNoticeType {
  const normalized = normalizeNoticeType(raw)
  const parsed = GstNoticeTypeSchema.safeParse(normalized)
  return parsed.success ? parsed.data : 'OTHER'
}

function parseNoticeStatus(raw: string): GstNoticeStatus {
  const parsed = GstNoticeStatusSchema.safeParse(raw)
  return parsed.success ? parsed.data : 'RECEIVED'
}

function mapBackendListItem(
  item: z.infer<typeof GstNoticeListItemBackendSchema>,
): GstNotice {
  return {
    id: String(item.id),
    organizationId: '',
    gstin: '',
    noticeNumber: item.noticeNumber,
    noticeType: parseNoticeType(item.noticeType),
    noticeDate: item.issuedDate,
    dueDate: item.dueDate ?? null,
    statutoryDeadline: item.statutoryDeadline ?? null,
    status: parseNoticeStatus(item.status),
    description: item.description ?? null,
    assignedCaId: item.assignedCaId ? String(item.assignedCaId) : null,
    gstatStage: item.appealStage as GstatStageType,
    isGstatBacklogEligible: item.isGstatBacklogFlagged,
    createdAt: item.issuedDate,
    updatedAt: item.respondedAt ?? item.issuedDate,
  }
}

function mapBackendDetail(
  item: z.infer<typeof GstNoticeDetailBackendSchema>,
): GstNotice {
  return {
    id: String(item.id),
    organizationId: String(item.organizationId),
    gstin: '',
    noticeNumber: item.noticeNumber,
    noticeType: parseNoticeType(item.noticeType),
    noticeDate: item.issuedDate,
    dueDate: item.dueDate ?? null,
    statutoryDeadline: item.statutoryDeadline ?? null,
    status: parseNoticeStatus(item.status),
    description: item.description ?? null,
    assignedCaId: item.assignedCaId ? String(item.assignedCaId) : null,
    respondedAt: item.respondedAt ?? null,
    respondedBy: item.respondedBy ? String(item.respondedBy) : null,
    gstatStage: item.appealStage as GstatStageType,
    isGstatBacklogEligible: item.isGstatBacklogFlagged,
    createdAt: item.issuedDate,
    updatedAt: item.respondedAt ?? item.issuedDate,
  }
}

// ---------------------------------------------------------------------------
// Phase 6B: E-Invoice (IRP)
// ---------------------------------------------------------------------------

export const IrnGenerateResponseSchema = z.object({
  irnNumber: z.string(),
  ackNumber: z.string(),
  ackDate: z.string(),
  signedInvoice: z.string().optional(),
  signedQRCode: z.string().optional(),
  status: z.enum(['GENERATED', 'CANCELLED', 'PENDING', 'NOT_APPLICABLE']),
})

export type IrnGenerateResponse = z.infer<typeof IrnGenerateResponseSchema>

export const IrnStatusSchema = z.object({
  invoiceId: z.string(),
  irnNumber: z.string().nullable(),
  ackNumber: z.string().nullable(),
  ackDate: z.string().nullable(),
  signedQRCode: z.string().nullable(),
  status: z.enum(['GENERATED', 'CANCELLED', 'PENDING', 'NOT_APPLICABLE']),
  cancelledAt: z.string().nullable().optional(),
  cancelRemark: z.string().nullable().optional(),
})

export type IrnStatus = z.infer<typeof IrnStatusSchema>

// ---------------------------------------------------------------------------
// Phase 6B: E-Way Bill (EWB)
// ---------------------------------------------------------------------------

export const EwbStatusSchema = z.object({
  invoiceId: z.string(),
  ewbNumber: z.string().nullable(),
  ewbDate: z.string().nullable(),
  validUpto: z.string().nullable(),
  vehicleNo: z.string().nullable().optional(),
  transportMode: z.string().nullable().optional(),
  status: z.enum(['GENERATED', 'CANCELLED', 'EXPIRED', 'PENDING', 'NOT_REQUIRED']),
})

export type EwbStatus = z.infer<typeof EwbStatusSchema>

export const EwbGenerateResponseSchema = z.object({
  ewbNumber: z.string(),
  ewbDate: z.string(),
  validUpto: z.string(),
})

export type EwbGenerateResponse = z.infer<typeof EwbGenerateResponseSchema>

// ---------------------------------------------------------------------------
// Phase 6B: HSN/SAC search
// ---------------------------------------------------------------------------

export const HsnSacCodeSchema = z.object({
  code: z.string(),
  description: z.string(),
  gstRate: z.number(),
  type: z.enum(['HSN', 'SAC']),
})

export type HsnSacCode = z.infer<typeof HsnSacCodeSchema>

export const HsnSacListSchema = z.object({
  items: z.array(HsnSacCodeSchema),
})

// ---------------------------------------------------------------------------
// GSTR-1 return invoices — matches backend ReturnInvoiceDto
// (different field names from the generic GstInvoiceSchema which targets
//  the /gst/invoices list endpoint)
// ---------------------------------------------------------------------------

export const ReturnInvoiceDtoSchema = z.object({
  invoiceId: z.string(),
  invoiceType: z.enum(['B2B', 'B2C', 'CREDIT_NOTE', 'DEBIT_NOTE', 'EXPORT']),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),          // DateOnly serialised as "YYYY-MM-DD"
  supplierGstin: z.string(),
  supplierName: z.string(),
  buyerGstin: z.string().nullable(),
  taxableValue: z.number(),
  igstAmount: z.number(),
  cgstAmount: z.number(),
  sgstAmount: z.number(),
  cessAmount: z.number(),
  totalInvoiceValue: z.number(),
  irnStatus: z.string().nullable(),
})

export type ReturnInvoiceDto = z.infer<typeof ReturnInvoiceDtoSchema>

export const ReturnInvoicesListSchema = z.object({
  items: z.array(ReturnInvoiceDtoSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export type ReturnInvoicesList = z.infer<typeof ReturnInvoicesListSchema>

// ---------------------------------------------------------------------------
// B2C summary row — derived client-side by aggregating B2C invoices by tax rate
// ---------------------------------------------------------------------------

export interface B2CSummaryRow {
  /** e.g. "5", "12", "18", "28" */
  gstRate: string
  taxableAmount: number
  igstAmount: number
  cgstAmount: number
  sgstAmount: number
  totalTax: number
  invoiceCount: number
}

/** Aggregate B2C invoices into per-rate summary rows. */
export function aggregateB2CSummary(invoices: ReturnInvoiceDto[]): B2CSummaryRow[] {
  const b2c = invoices.filter(i => i.invoiceType === 'B2C')
  const rateMap = new Map<string, B2CSummaryRow>()

  for (const inv of b2c) {
    // Derive effective GST rate from tax amounts
    const totalTax = inv.igstAmount + inv.cgstAmount + inv.sgstAmount + inv.cessAmount
    const effectiveRate = inv.taxableValue > 0
      ? Math.round((totalTax / inv.taxableValue) * 100)
      : 0
    const rateKey = String(effectiveRate)

    const existing = rateMap.get(rateKey)
    if (existing) {
      existing.taxableAmount += inv.taxableValue
      existing.igstAmount += inv.igstAmount
      existing.cgstAmount += inv.cgstAmount
      existing.sgstAmount += inv.sgstAmount
      existing.totalTax += totalTax
      existing.invoiceCount += 1
    } else {
      rateMap.set(rateKey, {
        gstRate: rateKey,
        taxableAmount: inv.taxableValue,
        igstAmount: inv.igstAmount,
        cgstAmount: inv.cgstAmount,
        sgstAmount: inv.sgstAmount,
        totalTax,
        invoiceCount: 1,
      })
    }
  }

  return Array.from(rateMap.values()).sort((a, b) => Number(a.gstRate) - Number(b.gstRate))
}

// ---------------------------------------------------------------------------
// HSN summary row — derived client-side (no backend HSN-summary endpoint yet)
// ---------------------------------------------------------------------------

export interface HsnSummaryRow {
  hsnCode: string
  description: string
  totalTaxableValue: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  cessAmount: number
  invoiceCount: number
}

/**
 * Aggregate all invoices by their HSN/SAC code (uses supplierName as a fallback
 * description since ReturnInvoiceDto does not carry a per-line HSN — this is a
 * placeholder until a backend HSN-summary endpoint is added).
 * Groups by supplierGstin when hsnCode is unknown (empty group).
 */
export function aggregateHsnSummary(invoices: ReturnInvoiceDto[]): HsnSummaryRow[] {
  // Group by supplierGstin as a coarse proxy until per-line HSN data is available
  const map = new Map<string, HsnSummaryRow>()

  for (const inv of invoices) {
    if (inv.invoiceType === 'CREDIT_NOTE' || inv.invoiceType === 'DEBIT_NOTE') continue
    // We don't have HSN at the invoice level, group under supplierGstin
    const key = inv.supplierGstin || 'UNKNOWN'
    const existing = map.get(key)
    if (existing) {
      existing.totalTaxableValue += inv.taxableValue
      existing.cgstAmount += inv.cgstAmount
      existing.sgstAmount += inv.sgstAmount
      existing.igstAmount += inv.igstAmount
      existing.cessAmount += inv.cessAmount
      existing.invoiceCount += 1
    } else {
      map.set(key, {
        hsnCode: '',
        description: inv.supplierName,
        totalTaxableValue: inv.taxableValue,
        cgstAmount: inv.cgstAmount,
        sgstAmount: inv.sgstAmount,
        igstAmount: inv.igstAmount,
        cessAmount: inv.cessAmount,
        invoiceCount: 1,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalTaxableValue - a.totalTaxableValue)
}

// ---------------------------------------------------------------------------
// Document issue detection — client-side from invoice data
// ---------------------------------------------------------------------------

export type DocumentIssueType =
  | 'missingBuyerGstin'
  | 'missingInvoiceNumber'
  | 'zeroTaxableValue'
  | 'missingHsn'

export interface DocumentIssueRow {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  invoiceType: ReturnInvoiceDto['invoiceType']
  issues: DocumentIssueType[]
}

export function detectDocumentIssues(invoices: ReturnInvoiceDto[]): DocumentIssueRow[] {
  const result: DocumentIssueRow[] = []
  for (const inv of invoices) {
    const issues: DocumentIssueType[] = []
    if (!inv.buyerGstin && inv.invoiceType === 'B2B') {
      issues.push('missingBuyerGstin')
    }
    if (!inv.invoiceNumber || inv.invoiceNumber.trim() === '') {
      issues.push('missingInvoiceNumber')
    }
    if (inv.taxableValue === 0) {
      issues.push('zeroTaxableValue')
    }
    if (issues.length > 0) {
      result.push({
        invoiceId: inv.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        invoiceType: inv.invoiceType,
        issues,
      })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// API functions — existing
// ---------------------------------------------------------------------------

export interface ListReturnsParams {
  /** Required: backend returns 500 without org context. Gate useQuery with enabled: !!organizationId */
  organizationId: string
  financialYear?: string
  page?: number
  pageSize?: number
}

export async function listGstReturns(params: ListReturnsParams) {
  if (!params.organizationId) {
    throw new Error('listGstReturns: organizationId is required — do not call before org context resolves')
  }
  const res = await api.get('/gst/returns', { params })
  return GstReturnsListSchema.parse(res.data)
}

export async function getGstReturn(id: string) {
  const res = await api.get(`/gst/returns/${id}`)
  return GstReturnSchema.parse(res.data)
}

export interface ListInvoicesParams {
  organizationId?: string
  returnId?: string
  financialYear?: string
  page?: number
  pageSize?: number
}

export async function listGstInvoices(params: ListInvoicesParams = {}) {
  const res = await api.get('/gst/invoices', { params })
  return GstInvoicesListSchema.parse(res.data)
}

export async function listReturnInvoices(returnId: string, params: ListInvoicesParams = {}) {
  const res = await api.get(`/gst/returns/${returnId}/invoices`, { params })
  return ReturnInvoicesListSchema.parse(res.data)
}

// Add a line-item invoice to a GSTR-1 / GSTR-1A return.
// POST /gst/returns/{id}/invoices — supplier GSTIN/name are resolved server-side
// from the return's organization; the client supplies the buyer + tax breakdown.
export interface AddReturnInvoiceRequest {
  invoiceNumber: string
  invoiceType: ReturnInvoiceDto['invoiceType']
  invoiceDate: string
  buyerGstin?: string
  taxableValue: number
  igstAmount: number
  cgstAmount: number
  sgstAmount: number
  cessAmount: number
}

export async function addReturnInvoice(returnId: string, body: AddReturnInvoiceRequest): Promise<void> {
  await api.post(`/gst/returns/${returnId}/invoices`, body)
}

export interface CreateInvoiceRequest {
  organizationId: string
  gstin: string
  buyerGstin?: string
  invoiceDate: string
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    gstRate: number
    sacCode?: string
  }>
  placeOfSupply: string
  isInterstate: boolean
  documentType: string
}

export async function createGstInvoice(body: CreateInvoiceRequest) {
  const res = await api.post('/gst/invoices', body)
  return GstInvoiceSchema.parse(res.data)
}

/** Fetch audit trail for a GST return */
export async function getGstReturnAudit(returnId: string, page = 1) {
  const res = await api.get(`/gst/returns/${returnId}/audit`, { params: { page, pageSize: 20 } })
  return AuditListSchema.parse(res.data)
}

/** Save / update the ARN for a filed return */
export async function saveGstReturnArn(returnId: string, arn: string) {
  const res = await api.patch(`/gst/returns/${returnId}/arn`, { arn })
  return ArnSaveResponseSchema.parse(res.data)
}

/** Submit the return for filing */
export async function submitGstReturnForFiling(returnId: string) {
  const res = await api.post(`/gst/returns/${returnId}/submit`)
  return GstReturnSchema.parse(res.data)
}

/** Approve the return */
export async function approveGstReturn(returnId: string) {
  const res = await api.post(`/gst/returns/${returnId}/approve`)
  return GstReturnSchema.parse(res.data)
}

/** Flag revision needed */
export async function flagGstReturnRevision(returnId: string, note: string) {
  const res = await api.post(`/gst/returns/${returnId}/revision`, { note })
  return GstReturnSchema.parse(res.data)
}

/** Assign CA to a return */
export async function assignGstReturn(returnId: string, caId: string) {
  const res = await api.post(`/gst/returns/${returnId}/assign`, { caId })
  return GstReturnSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Phase 6B API functions — Notices
// ---------------------------------------------------------------------------

export interface ListNoticesParams {
  orgId?: string
  status?: string
  gstin?: string
  assigneeId?: string
  dueBucket?: 'overdue' | 'this_week' | 'this_month'
  search?: string
  page?: number
  pageSize?: number
}

export async function listGstNotices(params: ListNoticesParams = {}) {
  const { orgId, ...rest } = params
  const res = await api.get('/gst/notices', {
    params: {
      ...rest,
      ...(orgId ? { organizationId: orgId } : {}),
    },
  })
  const parsed = GstNoticesListBackendSchema.parse(res.data)
  return {
    items: parsed.items.map(mapBackendListItem),
    totalCount: parsed.totalCount,
    page: parsed.page,
    pageSize: parsed.pageSize,
  }
}

export async function getGstNotice(id: string) {
  const res = await api.get(`/gst/notices/${id}`)
  return mapBackendDetail(GstNoticeDetailBackendSchema.parse(res.data))
}

export interface CreateNoticeRequest {
  orgId: string
  gstin: string
  noticeNumber: string
  noticeType: GstNoticeType
  noticeDate: string
  dueDate?: string
  description?: string
}

export async function createGstNotice(body: CreateNoticeRequest) {
  const res = await api.post('/gst/notices', body)
  return z.object({ noticeId: z.string(), status: GstNoticeStatusSchema }).parse(res.data)
}

export interface RespondToNoticeRequest {
  respondedByUserId: string
  responseText?: string
  submissionChannel: string
  responseReference?: string
  dateSent: string
}

export async function respondToGstNotice(noticeId: string, body: RespondToNoticeRequest) {
  await api.post(`/gst/notices/${noticeId}/respond`, body)
}

export async function assignGstNotice(noticeId: string, caUserId: string) {
  await api.post(`/gst/notices/${noticeId}/assign-ca`, { caUserId })
}

export async function markGstNoticeUnderReview(noticeId: string) {
  await api.post(`/gst/notices/${noticeId}/mark-under-review`)
}

export async function markGstNoticeClosed(noticeId: string, outcome: string, note?: string) {
  await api.post(`/gst/notices/${noticeId}/close`, { outcome, note })
}

// ---------------------------------------------------------------------------
// Phase 6B API functions — E-Invoice (IRP)
// ---------------------------------------------------------------------------

export interface GenerateIrnRequest {
  invoiceId: string
  orgId: string
  supplierGstin: string
}

export async function generateIrn(body: GenerateIrnRequest) {
  const res = await api.post('/gst/e-invoices/generate', body)
  return IrnGenerateResponseSchema.parse(res.data)
}

export async function getIrnStatus(invoiceId: string) {
  const res = await api.get(`/gst/e-invoices/${invoiceId}/status`)
  return IrnStatusSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Phase 6B API functions — E-Way Bill (EWB)
// ---------------------------------------------------------------------------

export interface GenerateEwbRequest {
  invoiceId: string
  orgId: string
  vehicleNo?: string
  transportMode?: string
}

export async function generateEwb(body: GenerateEwbRequest) {
  const res = await api.post('/gst/e-way-bills', body)
  return EwbGenerateResponseSchema.parse(res.data)
}

export async function getEwbStatus(invoiceId: string) {
  const res = await api.get(`/gst/e-way-bills/${invoiceId}/status`)
  return EwbStatusSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Phase 6B API functions — HSN/SAC search
// ---------------------------------------------------------------------------

export async function searchHsnSac(query: string, limit = 10) {
  const res = await api.get('/gst/hsn-sac', { params: { query, limit } })
  return HsnSacListSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Phase 6B API functions — Nil return
// ---------------------------------------------------------------------------

export async function fileNilReturn(body: { orgId: string; returnPeriod: string; returnType: string }) {
  const res = await api.post('/gst/returns/nil', body)
  return z.object({ returnId: z.string(), arn: z.string().nullable() }).parse(res.data)
}

// ---------------------------------------------------------------------------
// Phase 7 Batch 16b: Admin filing queue
// ---------------------------------------------------------------------------

export const FilingQueueItemSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  businessName: z.string().nullable(),
  returnType: z.string(),
  status: z.string(),
  filingDeadline: z.string().nullable(),
  slaExpiresAt: z.string().nullable(),
  assignedCaUserId: z.string().uuid().nullable(),
})

export type FilingQueueItem = z.infer<typeof FilingQueueItemSchema>

export interface GetFilingQueueParams {
  status?: string
  limit?: number
}

export async function getFilingQueue(params: GetFilingQueueParams = {}): Promise<FilingQueueItem[]> {
  const res = await api.get('/gst/admin/filing-queue', { params })
  return z.array(FilingQueueItemSchema).parse(res.data)
}

// ---------------------------------------------------------------------------
// Dashboard widget — notices due
// ---------------------------------------------------------------------------

export const NoticesDueWidgetDataSchema = z.object({
  overdue: z.number(),
  dueIn2Days: z.number(),
  dueThisWeek: z.number(),
  total: z.number(),
})

export type NoticesDueWidgetData = z.infer<typeof NoticesDueWidgetDataSchema>

export async function getNoticesDueSummary() {
  const res = await api.get('/gst/notices/due-summary')
  return NoticesDueWidgetDataSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// Phase 7 Wave 1: ITC Reconciliation (GAP-011)
// Endpoints:
//   GET  /gst/itc-mismatches?organizationId=&status=   → GetItcMismatchesQuery
//   POST /gst/itc-reconciliation                       → ReconcileItcCommand
// ---------------------------------------------------------------------------

/**
 * ItcMismatchDto shape from GetItcMismatchesQuery handler:
 *   Id, MismatchType, ClaimedAmount, AvailableAmount, DifferenceAmount, Status
 */
export const ItcMismatchSchema = z.object({
  id: z.string().uuid(),
  mismatchType: z.enum(['AMOUNT_MISMATCH', 'MISSING_IN_2B', 'EXCESS_CLAIM']),
  claimedAmount: z.number(),
  availableAmount: z.number(),
  differenceAmount: z.number(),
  status: z.enum(['OPEN', 'RESOLVED', 'IGNORED']),
})

export type ItcMismatch = z.infer<typeof ItcMismatchSchema>

export const ItcMismatchListSchema = z.array(ItcMismatchSchema)

export interface GetItcMismatchesParams {
  organizationId: string
  status?: string
}

/** GET /gst/itc-mismatches — returns all mismatches for an org, filtered by status. */
export async function getItcMismatches(params: GetItcMismatchesParams): Promise<ItcMismatch[]> {
  const res = await api.get('/gst/itc-mismatches', { params })
  return ItcMismatchListSchema.parse(res.data)
}

/**
 * ReconcileItcResponse shape from ReconcileItcCommand:
 *   OrganizationId, FinancialYear, PeriodMonth, MismatchesDetected, TotalDifferenceAmount
 */
export const ReconcileItcResponseSchema = z.object({
  organizationId: z.string().uuid(),
  financialYear: z.string(),
  periodMonth: z.number(),
  mismatchesDetected: z.number(),
  totalDifferenceAmount: z.number(),
})

export type ReconcileItcResponse = z.infer<typeof ReconcileItcResponseSchema>

export interface ReconcileItcRequest {
  organizationId: string
  financialYear: string
  periodMonth: number
  reconciliationType?: 'GSTR_2A' | 'GSTR_2B'
}

/** POST /gst/itc-reconciliation — runs ITC reconciliation for an org+period. */
export async function reconcileItc(body: ReconcileItcRequest): Promise<ReconcileItcResponse> {
  const res = await api.post('/gst/itc-reconciliation', body)
  return ReconcileItcResponseSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// GAP-022: Admin Tax Rate Configuration
// Endpoints (GstService :5104):
//   GET  /gst/tax-rates             → ListTaxRatesQuery — all rates, activeOnly?
//   GET  /gst/tax-rates/effective   → GetEffectiveTaxRateQuery — for rateName+asOfDate
//   POST /gst/tax-rates             → CreateTaxRateCommand (gst.admin.taxrates)
//   DELETE /gst/tax-rates/{id}/deactivate → DeactivateTaxRateCommand (gst.admin.taxrates)
// ---------------------------------------------------------------------------

/**
 * TaxRateDto — matches ListTaxRatesQueryHandler projection.
 * Dates arrive as ISO strings from JSON serialisation of DateOnly.
 */
export const TaxRateDtoSchema = z.object({
  id: z.string().uuid(),
  rateName: z.string(),
  ratePct: z.number(),
  cgstPct: z.number(),
  sgstPct: z.number(),
  igstPct: z.number(),
  cessPct: z.number(),
  validFrom: z.string(),        // ISO date string e.g. "2024-07-01"
  validTo: z.string().nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type TaxRateDto = z.infer<typeof TaxRateDtoSchema>

export const TaxRateListSchema = z.array(TaxRateDtoSchema)

/** EffectiveTaxRateDto — GetEffectiveTaxRateQuery response. */
export const EffectiveTaxRateDtoSchema = z.object({
  id: z.string().uuid(),
  rateName: z.string(),
  ratePct: z.number(),
  cgstPct: z.number(),
  sgstPct: z.number(),
  igstPct: z.number(),
  cessPct: z.number(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
})

export type EffectiveTaxRateDto = z.infer<typeof EffectiveTaxRateDtoSchema>

/** CreateTaxRateResponse — 201 body from POST /gst/tax-rates. */
export const CreateTaxRateResponseSchema = z.object({
  taxRateId: z.string().uuid(),
  rateName: z.string(),
  ratePct: z.number(),
  cgstPct: z.number(),
  sgstPct: z.number(),
  igstPct: z.number(),
  validFrom: z.string(),
})

export type CreateTaxRateResponse = z.infer<typeof CreateTaxRateResponseSchema>

/**
 * Standard GST slabs (Indian statutory rates).
 * Shown as a select in the create-rate form; backend also accepts non-standard
 * values (the validator only enforces 0–100 range), but the UI restricts to slabs.
 */
export const GST_SLABS = [0, 1.5, 3, 5, 7.5, 12, 18, 28] as const
export type GstSlab = (typeof GST_SLABS)[number]

/** Compute CGST/SGST/IGST from a slab percentage. */
export function computeTaxBreakdown(ratePct: number): { cgstPct: number; sgstPct: number; igstPct: number } {
  const half = Math.round((ratePct / 2) * 100) / 100
  return { cgstPct: half, sgstPct: half, igstPct: ratePct }
}

// API functions ---------------------------------------------------------------

/** GET /gst/tax-rates — all rates, optionally filtered to active-only. */
export async function listTaxRates(activeOnly = false): Promise<TaxRateDto[]> {
  const res = await api.get('/gst/tax-rates', { params: { activeOnly } })
  return TaxRateListSchema.parse(res.data)
}

/** GET /gst/tax-rates/effective?rateName=&asOfDate= */
export async function getEffectiveTaxRate(rateName: string, asOfDate?: string): Promise<EffectiveTaxRateDto> {
  const res = await api.get('/gst/tax-rates/effective', { params: { rateName, asOfDate } })
  return EffectiveTaxRateDtoSchema.parse(res.data)
}

export interface CreateTaxRateRequest {
  rateName: string
  ratePct: number
  validFrom: string   // ISO date string "YYYY-MM-DD"
  notes?: string
}

/** POST /gst/tax-rates — requires gst.admin.taxrates permission. */
export async function createTaxRate(body: CreateTaxRateRequest): Promise<CreateTaxRateResponse> {
  const res = await api.post('/gst/tax-rates', body)
  return CreateTaxRateResponseSchema.parse(res.data)
}

/** DELETE /gst/tax-rates/{id}/deactivate — requires gst.admin.taxrates permission. */
export async function deactivateTaxRate(id: string): Promise<void> {
  await api.delete(`/gst/tax-rates/${id}/deactivate`)
}
