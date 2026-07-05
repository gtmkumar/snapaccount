/**
 * Loan Service API client — Phase 6C
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 *
 * Security note: Partner bank API secrets are NEVER returned in GET responses.
 * The SecretInput / write-only pattern is enforced here by omitting secret fields
 * from GET response schemas.
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const LoanApplicationStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'DOCS_REQUESTED',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
  'CLOSED',
])
export type LoanApplicationStatus = z.infer<typeof LoanApplicationStatusSchema>

export const BankAdapterTypeSchema = z.enum(['EMAIL', 'REST', 'OAUTH'])
export type BankAdapterType = z.infer<typeof BankAdapterTypeSchema>

export const LoanDocumentTypeSchema = z.enum([
  'PAN',
  'AADHAAR',
  'GSTR3B',
  'PL',
  'BS',
  'BANK_STMT',
  'ITR',
  'TRADE_LICENSE',
])
export type LoanDocumentType = z.infer<typeof LoanDocumentTypeSchema>

export const ConsentTypeSchema = z.enum([
  'CREDIT_BUREAU',
  'DATA_SHARE_WITH_BANK',
  'DISBURSEMENT_MANDATE',
])
export type ConsentType = z.infer<typeof ConsentTypeSchema>

export const BankCommStatusSchema = z.enum([
  'QUEUED',
  'SENT',
  'DELIVERED',
  'RESPONDED',
  'BOUNCED',
  'FAILED',
])
export type BankCommStatus = z.infer<typeof BankCommStatusSchema>

// ---------------------------------------------------------------------------
// Loan Products
// ---------------------------------------------------------------------------

export const LoanProductSchema = z.object({
  productId: z.string(),
  bankId: z.string(),
  bankName: z.string().optional(),
  productName: z.string(),
  description: z.string().nullable().optional(),
  minAmount: z.number(),
  maxAmount: z.number(),
  tenureMonths: z.array(z.number()).optional(),
  interestRate: z.number().nullable().optional(),
  interestRateMin: z.number().nullable().optional(),
  interestRateMax: z.number().nullable().optional(),
  eligibilityCriteriaJson: z.string().nullable().optional(),
  isActive: z.boolean(),
})
export type LoanProduct = z.infer<typeof LoanProductSchema>

export const LoanProductsListSchema = z.object({
  items: z.array(LoanProductSchema),
  totalCount: z.number(),
})

export interface CreateLoanProductRequest {
  bankId: string
  productName: string
  description?: string
  minAmount: number
  maxAmount: number
  tenureMonths: number[]
  interestRate?: number
  eligibilityCriteriaJson?: string
  isActive: boolean
}

// ---------------------------------------------------------------------------
// Partner Banks
// NOTE: api_config_encrypted / api key / client secret are NEVER returned in
//       GET responses — write-only fields only appear in POST/PUT request bodies.
// ---------------------------------------------------------------------------

export const PartnerBankSchema = z.object({
  bankId: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable().optional(),
  adapterType: BankAdapterTypeSchema,
  contactEmail: z.string().nullable().optional(),
  isActive: z.boolean(),
  lastSuccessfulSubmissionAt: z.string().nullable().optional(),
  // Health status derived server-side
  healthStatus: z.enum(['healthy', 'degraded', 'down', 'inactive']).nullable().optional(),
})
export type PartnerBank = z.infer<typeof PartnerBankSchema>

export const PartnerBanksListSchema = z.object({
  items: z.array(PartnerBankSchema),
  totalCount: z.number(),
})

export interface RegisterPartnerBankRequest {
  name: string
  gstin?: string
  adapterType: BankAdapterType
  // configJson is write-only — API key / OAuth secrets sent only on create/update
  configJson?: string
  contactEmail?: string
  logoUrl?: string
}

// ---------------------------------------------------------------------------
// Loan Applications
// ---------------------------------------------------------------------------

export const LoanApplicationSummarySchema = z.object({
  applicationId: z.string(),
  orgId: z.string(),
  orgName: z.string().nullable().optional(),
  pan: z.string().nullable().optional(),
  gstin: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  loanProductId: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  bankId: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  bankLogoUrl: z.string().nullable().optional(),
  bankAdapterType: BankAdapterTypeSchema.nullable().optional(),
  requestedAmount: z.number(),
  tenureMonths: z.number(),
  purpose: z.string().nullable().optional(),
  status: LoanApplicationStatusSchema,
  submittedAt: z.string().nullable().optional(),
  daysInStage: z.number().nullable().optional(),
  assignedOfficer: z.string().nullable().optional(),
  bankReferenceNo: z.string().nullable().optional(),
  disbursedAt: z.string().nullable().optional(),
  disbursedAmount: z.number().nullable().optional(),
})
export type LoanApplicationSummary = z.infer<typeof LoanApplicationSummarySchema>

export const LoanApplicationsListSchema = z.object({
  items: z.array(LoanApplicationSummarySchema),
  totalCount: z.number(),
})

export const LoanApplicationDetailSchema = LoanApplicationSummarySchema.extend({
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  businessVintageYears: z.number().nullable().optional(),
  annualRevenueFy: z.number().nullable().optional(),
  purposeNote: z.string().nullable().optional(),
  eligibilityScore: z.number().nullable().optional(),
  eligibilityReasons: z.array(z.string()).nullable().optional(),
  currentBankEndpointMasked: z.string().nullable().optional(),
  currentBankRecipientEmail: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  closedReason: z.string().nullable().optional(),
  anonymizedAt: z.string().nullable().optional(),
})
export type LoanApplicationDetail = z.infer<typeof LoanApplicationDetailSchema>

export interface CreateLoanApplicationRequest {
  loanProductId: string
  requestedAmount: number
  tenureMonths: number
  purpose: string
}

export interface AssignBankRequest {
  bankId: string
}

export interface AssignBankResponse {
  packageUrl: string
}

export const AssignBankResponseSchema = z.object({
  packageUrl: z.string(),
})

export interface ApproveApplicationRequest {
  bankReferenceNo: string
}

export interface RejectApplicationRequest {
  reason: string
}

export interface RecordDisbursementRequest {
  disbursedAmount: number
  bankReferenceNo: string
}

// ---------------------------------------------------------------------------
// Application Documents
// ---------------------------------------------------------------------------

export const LoanDocumentSchema = z.object({
  documentId: z.string(),
  documentType: LoanDocumentTypeSchema,
  fileName: z.string(),
  source: z.enum(['manual', 'auto']).nullable().optional(),
  pages: z.number().nullable().optional(),
  status: z.enum(['pending', 'processing', 'verified', 'rejected']),
  uploadedAt: z.string(),
})
export type LoanDocument = z.infer<typeof LoanDocumentSchema>

export const LoanDocumentsListSchema = z.object({
  items: z.array(LoanDocumentSchema),
})

export interface UploadDocumentRequest {
  documentType: LoanDocumentType
  fileBase64: string
  fileName: string
}

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------

export const ConsentRecordSchema = z.object({
  consentId: z.string(),
  consentType: ConsentTypeSchema,
  consentVersion: z.string(),
  signedAt: z.string(),
  signatureHex: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  biometricUsed: z.boolean().nullable().optional(),
})
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>

export const ConsentsListSchema = z.object({
  items: z.array(ConsentRecordSchema),
})

export interface RecordConsentRequest {
  consentVersion: string
}

export const RecordConsentResponseSchema = z.object({
  consentId: z.string(),
  signatureHex: z.string(),
})

// ---------------------------------------------------------------------------
// PDF Package Download URL
// ---------------------------------------------------------------------------

export const PackageDownloadUrlSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
})
export type PackageDownloadUrl = z.infer<typeof PackageDownloadUrlSchema>

// ---------------------------------------------------------------------------
// Status Timeline
// ---------------------------------------------------------------------------

export const StatusLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  fromStatus: LoanApplicationStatusSchema.nullable().optional(),
  toStatus: LoanApplicationStatusSchema,
  actorType: z.enum(['user', 'system', 'officer', 'bank']),
  actorName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  payloadDiff: z.string().nullable().optional(),
})
export type StatusLogEntry = z.infer<typeof StatusLogEntrySchema>

export const StatusLogListSchema = z.object({
  items: z.array(StatusLogEntrySchema),
})

// ---------------------------------------------------------------------------
// Bank Communications
// ---------------------------------------------------------------------------

export const BankCommMessageSchema = z.object({
  messageId: z.string(),
  applicationId: z.string().nullable().optional(),
  bankId: z.string(),
  bankName: z.string().nullable().optional(),
  bankLogoUrl: z.string().nullable().optional(),
  adapterType: BankAdapterTypeSchema,
  direction: z.enum(['outbound', 'inbound']),
  channel: z.enum(['email', 'rest', 'oauth']),
  subject: z.string().nullable().optional(),
  endpoint: z.string().nullable().optional(),
  status: BankCommStatusSchema,
  timestamp: z.string(),
  responseStatus: z.number().nullable().optional(),
  // Payloads are server-masked; tokens and secrets redacted
  payloadMasked: z.string().nullable().optional(),
  responseMasked: z.string().nullable().optional(),
})
export type BankCommMessage = z.infer<typeof BankCommMessageSchema>

export const BankCommMessagesListSchema = z.object({
  items: z.array(BankCommMessageSchema),
  totalCount: z.number(),
})

// KPI for BankCommunicationsPage
export const BankCommKpiSchema = z.object({
  sentToday: z.number(),
  pending: z.number(),
  failed: z.number(),
  avgResponseMinutes: z.number().nullable().optional(),
  bounceRate: z.number().nullable().optional(),
})
export type BankCommKpi = z.infer<typeof BankCommKpiSchema>

// ---------------------------------------------------------------------------
// Loan KPIs (for LoansListPage KpiStrip)
// ---------------------------------------------------------------------------

export const LoanKpiSchema = z.object({
  totalApps: z.number(),
  submitted: z.number(),
  underReview: z.number(),
  awaitingDocs: z.number(),
  approved: z.number(),
  disbursed: z.number(),
})
export type LoanKpi = z.infer<typeof LoanKpiSchema>

// ---------------------------------------------------------------------------
// API Functions — Loan Products
// ---------------------------------------------------------------------------

export async function createLoanProduct(req: CreateLoanProductRequest): Promise<{ productId: string }> {
  const res = await api.post('/loans/products', req)
  return res.data as { productId: string }
}

export async function listLoanProducts(params?: { page?: number; pageSize?: number }) {
  const res = await api.get('/loans/products', { params })
  return LoanProductsListSchema.parse(res.data)
}

export async function getLoanProduct(id: string) {
  const res = await api.get(`/loans/products/${id}`)
  return LoanProductSchema.parse(res.data)
}

export async function activateLoanProduct(id: string): Promise<void> {
  await api.put(`/loans/products/${id}/activate`)
}

export async function deactivateLoanProduct(id: string): Promise<void> {
  await api.put(`/loans/products/${id}/deactivate`)
}

// ---------------------------------------------------------------------------
// API Functions — Loan Applications
// ---------------------------------------------------------------------------

export interface ListApplicationsParams {
  status?: LoanApplicationStatus
  bankId?: string
  page?: number
  pageSize?: number
  search?: string
}

export async function listLoanApplications(params?: ListApplicationsParams) {
  const res = await api.get('/loans/applications', { params })
  return LoanApplicationsListSchema.parse(res.data)
}

export async function getLoanApplication(id: string) {
  const res = await api.get(`/loans/applications/${id}`)
  return LoanApplicationDetailSchema.parse(res.data)
}

export async function createLoanApplication(req: CreateLoanApplicationRequest): Promise<{ applicationId: string }> {
  const res = await api.post('/loans/applications', req)
  return res.data as { applicationId: string }
}

export async function submitLoanApplication(id: string): Promise<void> {
  await api.post(`/loans/applications/${id}/submit`)
}

export async function beginReview(id: string): Promise<void> {
  await api.post(`/loans/applications/${id}/begin-review`)
}

export async function assignBank(id: string, req: AssignBankRequest): Promise<AssignBankResponse> {
  const res = await api.post(`/loans/applications/${id}/assign-bank`, req)
  return AssignBankResponseSchema.parse(res.data)
}

export async function approveApplication(id: string, req: ApproveApplicationRequest): Promise<void> {
  await api.post(`/loans/applications/${id}/approve`, req)
}

export async function rejectApplication(id: string, req: RejectApplicationRequest): Promise<void> {
  await api.post(`/loans/applications/${id}/reject`, req)
}

export async function requestDocuments(id: string): Promise<void> {
  await api.post(`/loans/applications/${id}/request-documents`)
}

export async function recordDisbursement(id: string, req: RecordDisbursementRequest): Promise<void> {
  await api.post(`/loans/applications/${id}/disburse`, req)
}

export async function closeLoanApplication(id: string): Promise<void> {
  await api.post(`/loans/applications/${id}/close`)
}

// ---------------------------------------------------------------------------
// API Functions — Application Documents
// ---------------------------------------------------------------------------

export async function listApplicationDocuments(applicationId: string) {
  const res = await api.get(`/loans/applications/${applicationId}/documents`)
  return LoanDocumentsListSchema.parse(res.data)
}

export async function uploadApplicationDocument(applicationId: string, req: UploadDocumentRequest): Promise<{ documentId: string }> {
  const res = await api.post(`/loans/applications/${applicationId}/documents`, req)
  return res.data as { documentId: string }
}

export async function getPackageDownloadUrl(applicationId: string) {
  const res = await api.get(`/loans/applications/${applicationId}/package/download-url`)
  return PackageDownloadUrlSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// API Functions — Consents
// ---------------------------------------------------------------------------

export async function listConsents(applicationId: string) {
  const res = await api.get(`/loans/applications/${applicationId}/consents`)
  return ConsentsListSchema.parse(res.data)
}

export async function recordConsent(applicationId: string, req: RecordConsentRequest) {
  const res = await api.post(`/loans/applications/${applicationId}/consent`, req)
  return RecordConsentResponseSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// API Functions — Status Timeline
// ---------------------------------------------------------------------------

export async function listStatusLog(applicationId: string) {
  const res = await api.get(`/loans/applications/${applicationId}/status-log`)
  return StatusLogListSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// API Functions — Partner Banks
// ---------------------------------------------------------------------------

export async function listPartnerBanks(params?: { page?: number; pageSize?: number }) {
  const res = await api.get('/loans/banks', { params })
  return PartnerBanksListSchema.parse(res.data)
}

export async function registerPartnerBank(req: RegisterPartnerBankRequest): Promise<{ bankId: string }> {
  const res = await api.post('/loans/banks', req)
  return res.data as { bankId: string }
}

// Partial update of an existing bank. All fields optional — only the provided
// ones change; secrets in apiConfigJson are write-only and never echoed back.
export interface UpdatePartnerBankRequest {
  name?: string
  logoUrl?: string
  contactEmail?: string
  apiConfigJson?: string
  isActive?: boolean
}

export async function updatePartnerBank(bankId: string, req: UpdatePartnerBankRequest): Promise<void> {
  await api.patch(`/loans/partner-banks/${bankId}`, req)
}

// ---------------------------------------------------------------------------
// API Functions — Bank Communications
// ---------------------------------------------------------------------------

export interface ListBankCommParams {
  bankId?: string
  channel?: 'email' | 'rest' | 'oauth'
  status?: BankCommStatus
  direction?: 'outbound' | 'inbound'
  from?: string
  to?: string
  search?: string
  applicationId?: string
  page?: number
  pageSize?: number
}

export async function listBankCommunications(params?: ListBankCommParams) {
  const res = await api.get('/loans/bank-communications', { params })
  return BankCommMessagesListSchema.parse(res.data)
}

export async function getBankCommKpi(): Promise<BankCommKpi> {
  const res = await api.get('/loans/bank-communications/kpi')
  return BankCommKpiSchema.parse(res.data)
}

export async function resendBankMessage(messageId: string, reason: string): Promise<void> {
  await api.post(`/loans/bank-communications/${messageId}/resend`, { reason })
}

// ---------------------------------------------------------------------------
// API Functions — Loan KPIs
// ---------------------------------------------------------------------------

export async function getLoanKpi(): Promise<LoanKpi> {
  const res = await api.get('/loans/kpi')
  return LoanKpiSchema.parse(res.data)
}

// ---------------------------------------------------------------------------
// API Functions — Partner Banks (lightweight DTO list, used by Settings page)
// ---------------------------------------------------------------------------

/**
 * Matches the canonical backend handler shape:
 *   GetPartnerBanksQueryHandler → IReadOnlyList<PartnerBankDto>
 *   { bankId, name, logoUrl?, adapterType, isActive, hasApiConfig }
 */
export const PartnerBankLiteSchema = z.object({
  bankId: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable().optional(),
  adapterType: z.string(),
  isActive: z.boolean(),
  hasApiConfig: z.boolean(),
})
export type PartnerBankLite = z.infer<typeof PartnerBankLiteSchema>

export async function getPartnerBanksLite(includeInactive = false): Promise<PartnerBankLite[]> {
  const res = await api.get('/loans/partner-banks', { params: { includeInactive } })
  return z.array(PartnerBankLiteSchema).parse(res.data)
}
