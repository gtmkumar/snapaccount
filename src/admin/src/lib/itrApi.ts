/**
 * ITR Service API client — Phase 6D
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ItrFormTypeSchema = z.enum(['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-7'])
export type ItrFormType = z.infer<typeof ItrFormTypeSchema>

export const RegimeSchema = z.enum(['OLD', 'NEW'])
export type Regime = z.infer<typeof RegimeSchema>

export const FilingStatusSchema = z.enum([
  'DRAFT',
  'UNDER_CA_REVIEW',
  'CA_REJECTED',    // DG-ITR-06: backend uses CA_REJECTED (matches DB CHECK constraint)
  'CA_APPROVED',    // DG-ITR-06: DB allows CA_APPROVED (entity ApproveByCa sets USER_APPROVED, CA_APPROVED is a DB-only alias)
  'USER_APPROVED',
  'FILED',
  'E_VERIFIED',
  'REFUND_ISSUED',
  'NOTICE_RECEIVED',
  'CANCELLED',
])
export type FilingStatus = z.infer<typeof FilingStatusSchema>

export const ItrNoticeStatusSchema = z.enum(['RECEIVED', 'UNDER_REVIEW', 'RESPONDED', 'CLOSED'])
export type ItrNoticeStatus = z.infer<typeof ItrNoticeStatusSchema>

export const RefundStatusSchema = z.enum([
  'NOT_DETERMINED',
  'DETERMINED',
  'DISPATCHED',
  'CREDITED',
  'FAILED',
  'ADJUSTED',
])
export type RefundStatus = z.infer<typeof RefundStatusSchema>

// ---------------------------------------------------------------------------
// Assessee Profile
// ---------------------------------------------------------------------------

export const AssesseeProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  panLast4: z.string(),
  fullName: z.string(),
  assesseeType: z.enum(['INDIVIDUAL', 'HUF', 'FIRM', 'COMPANY', 'OTHER']),
  dob: z.string().nullable().optional(),
  residentialStatus: z.enum(['RESIDENT', 'NRI', 'RNOR']).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  orgId: z.string().nullable().optional(),
  annualTurnoverCr: z.number().nullable().optional(),
})

export type AssesseeProfile = z.infer<typeof AssesseeProfileSchema>

// ---------------------------------------------------------------------------
// Tax slabs
// ---------------------------------------------------------------------------

export const TaxSlabSchema = z.object({
  from: z.number(),
  to: z.number().nullable(),
  rate: z.number(),
  taxOnSlab: z.number().optional(),
})

export type TaxSlab = z.infer<typeof TaxSlabSchema>

export const TaxSlabVersionSchema = z.object({
  versionId: z.string(),
  assessmentYear: z.string(),
  regime: RegimeSchema,
  slabsJson: z.array(TaxSlabSchema),
  standardDeduction: z.number(),
  rebate87AIncomeLimit: z.number(),
  rebate87AMaxAmount: z.number(),
  cessRatePct: z.number(),
})

export type TaxSlabVersion = z.infer<typeof TaxSlabVersionSchema>

// ---------------------------------------------------------------------------
// Deduction catalog
// ---------------------------------------------------------------------------

export const DeductionSectionSchema = z.object({
  id: z.string(),
  sectionCode: z.string(),
  name: z.string(),
  maxLimit: z.number().nullable(),
  availableInNewRegime: z.boolean(),
  availableInOldRegime: z.boolean(),
  subLimits: z.record(z.string(), z.number()).optional(),
})

export type DeductionSection = z.infer<typeof DeductionSectionSchema>

export const DeductionCatalogSchema = z.object({
  sections: z.array(DeductionSectionSchema),
})

// ---------------------------------------------------------------------------
// Tax computation
// ---------------------------------------------------------------------------

export const ComputationInputSchema = z.object({
  salaryIncome: z.number().default(0),
  housePropertyIncome: z.number().default(0),
  businessIncome: z.number().default(0),
  capitalGains: z.number().default(0),
  otherIncome: z.number().default(0),
  section80C: z.number().default(0),
  section80D: z.number().default(0),
  section80E: z.number().default(0),
  otherDeductions: z.number().default(0),
  advanceTaxPaid: z.number().default(0),
  tdsPaid: z.number().default(0),
})

export type ComputationInput = z.infer<typeof ComputationInputSchema>

export const ComputationResultSchema = z.object({
  filingId: z.string(),
  grossTotalIncome: z.number(),
  deductions: z.number(),
  taxableIncome: z.number(),
  taxOnIncome: z.number(),
  surcharge: z.number(),
  cessAmount: z.number(),
  rebate87A: z.number(),
  grossTaxLiability: z.number(),
  tdsPaid: z.number(),
  advanceTaxPaid: z.number(),
  totalCredits: z.number(),
  payableOrRefund: z.number(),
  computationHash: z.string(),
  regime: RegimeSchema,
  assessmentYear: z.string(),
  slabBreakdown: z.array(
    z.object({
      from: z.number(),
      to: z.number().nullable(),
      rate: z.number(),
      taxOnSlab: z.number(),
    })
  ).optional(),
})

export type ComputationResult = z.infer<typeof ComputationResultSchema>

export const RegimeComparisonSchema = z.object({
  old: ComputationResultSchema,
  new: ComputationResultSchema,
  recommendedRegime: RegimeSchema,
  taxSaving: z.number(),
})

export type RegimeComparison = z.infer<typeof RegimeComparisonSchema>

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------

export const FilingSchema = z.object({
  id: z.string(),
  assesseeId: z.string(),
  assesseeName: z.string().optional(),
  panLast4: z.string().optional(),
  assessmentYear: z.string(),
  itrFormType: ItrFormTypeSchema,
  regime: RegimeSchema.nullable(),
  status: FilingStatusSchema,
  totalIncome: z.number().nullable().optional(),
  totalTax: z.number().nullable().optional(),
  payableOrRefund: z.number().nullable().optional(),
  acknowledgementNumber: z.string().nullable().optional(),
  itrVUri: z.string().nullable().optional(),
  assignedCaId: z.string().nullable().optional(),
  assignedCaName: z.string().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  filedAt: z.string().nullable().optional(),
  eVerifiedAt: z.string().nullable().optional(),
  slaExpiresAt: z.string().nullable().optional(),
  computationHash: z.string().nullable().optional(),
  caNotes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Filing = z.infer<typeof FilingSchema>

export const FilingsListSchema = z.object({
  items: z.array(FilingSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

// ---------------------------------------------------------------------------
// Computation version (history)
// ---------------------------------------------------------------------------

export const ComputationVersionSchema = z.object({
  id: z.string(),
  filingId: z.string(),
  version: z.number(),
  label: z.string().optional(),
  actorName: z.string(),
  createdAt: z.string(),
  input: ComputationInputSchema,
  result: ComputationResultSchema,
})

export type ComputationVersion = z.infer<typeof ComputationVersionSchema>

// ---------------------------------------------------------------------------
// ITR Notice
// ---------------------------------------------------------------------------

export const ItrNoticeSchema = z.object({
  id: z.string(),
  filingId: z.string().optional(),
  assesseeId: z.string(),
  noticeNumber: z.string(),
  noticeType: z.string(),
  noticeSection: z.string().optional(),
  issuedDate: z.string(),
  dueDate: z.string().nullable(),
  subject: z.string().nullable().optional(),
  status: ItrNoticeStatusSchema,
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  demandAmount: z.number().nullable().optional(),
  attachments: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      gcsUri: z.string(),
      signedUrl: z.string().optional(),
      uploadedAt: z.string(),
    })
  ).optional(),
  assignedCaId: z.string().nullable().optional(),
  assignedCaName: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ItrNotice = z.infer<typeof ItrNoticeSchema>

export const ItrNoticesListSchema = z.object({
  items: z.array(ItrNoticeSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

// ---------------------------------------------------------------------------
// Refund status
// ---------------------------------------------------------------------------

export const RefundStatusDetailSchema = z.object({
  filingId: z.string(),
  refundStatus: RefundStatusSchema,
  refundAmount: z.number().nullable(),
  refundDate: z.string().nullable(),
  transactionReference: z.string().nullable(),
  statusMessage: z.string().nullable(),
  lastPolledAt: z.string(),
})

export type RefundStatusDetail = z.infer<typeof RefundStatusDetailSchema>

// ---------------------------------------------------------------------------
// KPI / Stats
// ---------------------------------------------------------------------------

export const ItrVerificationKpiSchema = z.object({
  awaitingReview: z.number(),
  slaBreached: z.number(),
  avgTimeToReviewDays: z.number(),
  totalFilingsAy: z.number(),
})

export type ItrVerificationKpi = z.infer<typeof ItrVerificationKpiSchema>

// ---------------------------------------------------------------------------
// API functions — Profile
// ---------------------------------------------------------------------------

export async function getAssesseeProfile(userId: string) {
  const res = await api.get(`/itr/profile/${userId}`)
  return AssesseeProfileSchema.parse(res.data)
}

export async function upsertAssesseeProfile(body: {
  userId: string
  panCipher?: string
  panLast4: string
  fullName: string
  assesseeType: string
  orgId?: string
  email?: string
  phone?: string
  dob?: string
  annualTurnoverCr?: number
}) {
  const res = await api.put('/itr/profile', body)
  return z.object({ assesseeId: z.string(), panLast4: z.string(), fullName: z.string() }).parse(res.data)
}

// ---------------------------------------------------------------------------
// API functions — Filings
// ---------------------------------------------------------------------------

export interface ListFilingsParams {
  assesseeId?: string
  status?: string
  assessmentYear?: string
  assignedCaId?: string
  page?: number
  pageSize?: number
}

export async function listFilings(params: ListFilingsParams = {}) {
  const res = await api.get('/itr/filings', { params })
  return FilingsListSchema.parse(res.data)
}

export async function getFiling(id: string) {
  const res = await api.get(`/itr/filings/${id}`)
  return FilingSchema.parse(res.data)
}

export async function startFiling(body: {
  assesseeId: string
  assessmentYear: string
  itrFormType: ItrFormType
  regime: Regime
}) {
  const res = await api.post('/itr/filings', body)
  return z.object({ filingId: z.string(), assessmentYear: z.string(), status: FilingStatusSchema }).parse(res.data)
}

export async function computeTax(filingId: string, input: ComputationInput) {
  const res = await api.post(`/itr/filings/${filingId}/compute`, input)
  return ComputationResultSchema.parse(res.data)
}

export async function compareRegimes(filingId: string, input: ComputationInput) {
  const res = await api.post(`/itr/filings/${filingId}/compare-regimes`, input)
  return RegimeComparisonSchema.parse(res.data)
}

export async function submitFilingForReview(filingId: string) {
  await api.post(`/itr/filings/${filingId}/submit`)
}

export async function caApproveFiling(filingId: string, caUserId: string) {
  await api.post(`/itr/filings/${filingId}/ca-approve`, { caUserId })
}

export async function caRejectFiling(filingId: string, caUserId: string, reason: string) {
  await api.post(`/itr/filings/${filingId}/ca-reject`, { caUserId, reason })
}

export async function markFiled(filingId: string, acknowledgementNumber: string) {
  await api.post(`/itr/filings/${filingId}/mark-filed`, { acknowledgementNumber })
}

export async function eVerifyFiling(filingId: string, verificationMethod: string, itrVObjectKey?: string) {
  await api.post(`/itr/filings/${filingId}/e-verify`, { verificationMethod, itrVObjectKey })
}

export async function uploadForm16(filingId: string, body: {
  assesseeId: string
  gcsUri: string
  employeePanCipher?: string
  employeePanLast4: string
}) {
  const res = await api.post(`/itr/filings/${filingId}/form16`, body)
  return z.object({ form16ExtractId: z.string(), ocrStatus: z.string() }).parse(res.data)
}

export async function updateFilingDraft(filingId: string, updates: Partial<ComputationInput> & { caNotes?: string }) {
  const res = await api.patch(`/itr/filings/${filingId}`, updates)
  return FilingSchema.parse(res.data)
}

export async function getComputationVersions(filingId: string) {
  const res = await api.get(`/itr/filings/${filingId}/computation-versions`)
  return z.array(ComputationVersionSchema).parse(res.data)
}

export async function getRefundStatus(filingId: string) {
  const res = await api.get(`/itr/filings/${filingId}/refund`)
  return RefundStatusDetailSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// API functions — Notices
// ---------------------------------------------------------------------------

export interface ListItrNoticesParams {
  assesseeId?: string
  filingId?: string
  status?: string
  assessmentYear?: string
  page?: number
  pageSize?: number
}

export async function listItrNotices(params: ListItrNoticesParams = {}) {
  const res = await api.get('/itr/notices', { params })
  return ItrNoticesListSchema.parse(res.data)
}

export async function uploadItrNotice(filingId: string, body: {
  assesseeId: string
  noticeNumber: string
  noticeType: string
  issuedDate: string
  dueDate?: string
  subject?: string
}) {
  const res = await api.post(`/itr/filings/${filingId}/notices`, body)
  return z.object({ noticeId: z.string(), status: ItrNoticeStatusSchema }).parse(res.data)
}

export async function respondToItrNotice(noticeId: string, body: {
  respondedByUserId: string
  responseText?: string
}) {
  await api.post(`/itr/notices/${noticeId}/respond`, body)
}

// ---------------------------------------------------------------------------
// API functions — Tax slabs + deductions
// ---------------------------------------------------------------------------

export async function getTaxSlabs(assessmentYear: string, regime: Regime) {
  const res = await api.get('/itr/tax-slabs', { params: { assessmentYear, regime } })
  return TaxSlabVersionSchema.parse(res.data)
}

export async function getDeductionCatalog(assessmentYear: string, regime: Regime) {
  const res = await api.get('/itr/deduction-catalog', { params: { assessmentYear, regime } })
  return DeductionCatalogSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

export async function getVerificationKpi(assessmentYear?: string) {
  const res = await api.get('/itr/filings/kpi', { params: { assessmentYear } })
  return ItrVerificationKpiSchema.parse(res.data)
}
