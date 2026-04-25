/**
 * Report Service API client — Phase 6C
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 *
 * Handles: report generation (PDF/JSON), signed-URL retrieval, job status.
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ReportTypeSchema = z.enum([
  'TrialBalance',
  'ProfitAndLoss',
  'BalanceSheet',
  'CashFlow',
  'TaxLiability',
  'LedgerByAccount',
  'LoanPackage',
])
export type ReportType = z.infer<typeof ReportTypeSchema>

export const ReportFormatSchema = z.enum(['Pdf', 'Json'])
export type ReportFormat = z.infer<typeof ReportFormatSchema>

export const ReportStatusSchema = z.enum([
  'QUEUED',
  'GENERATING',
  'COMPLETE',
  'FAILED',
])
export type ReportStatus = z.infer<typeof ReportStatusSchema>

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ReportJobSummarySchema = z.object({
  jobId: z.string(),
  reportType: ReportTypeSchema,
  format: ReportFormatSchema,
  status: ReportStatusSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable().optional(),
  financialYear: z.string().nullable().optional(),
})
export type ReportJobSummary = z.infer<typeof ReportJobSummarySchema>

export const ReportJobDetailSchema = ReportJobSummarySchema.extend({
  gcsUri: z.string().nullable().optional(),
  sha256HashHex: z.string().nullable().optional(),
  pageCount: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  loanApplicationId: z.string().nullable().optional(),
})
export type ReportJobDetail = z.infer<typeof ReportJobDetailSchema>

export const ReportJobsListSchema = z.object({
  items: z.array(ReportJobSummarySchema),
  totalCount: z.number(),
})

export const GenerateReportResponseSchema = z.object({
  jobId: z.string(),
  status: ReportStatusSchema,
  gcsUri: z.string().nullable().optional(),
})
export type GenerateReportResponse = z.infer<typeof GenerateReportResponseSchema>

export const ReportDownloadUrlSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
})
export type ReportDownloadUrl = z.infer<typeof ReportDownloadUrlSchema>

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface GenerateReportRequest {
  reportType: ReportType
  format: ReportFormat
  financialYear?: string
  periodStart?: string
  periodEnd?: string
  loanApplicationId?: string
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Enqueue and synchronously generate a report.
 * Returns jobId + gcsUri once complete (may take up to 30s for LoanPackage).
 */
export async function generateReport(req: GenerateReportRequest): Promise<GenerateReportResponse> {
  const res = await api.post('/reports/generate', req)
  return GenerateReportResponseSchema.parse(res.data)
}

/**
 * List all report jobs for the authenticated org.
 */
export async function listReportJobs(params?: { page?: number; pageSize?: number }) {
  const res = await api.get('/reports/', { params })
  return ReportJobsListSchema.parse(res.data)
}

/**
 * Get detail for a specific report job.
 */
export async function getReportJob(id: string): Promise<ReportJobDetail> {
  const res = await api.get(`/reports/${id}`)
  return ReportJobDetailSchema.parse(res.data)
}

/**
 * Get a short-lived signed GCS download URL for a completed report.
 * URL TTL is 1 hour server-side.
 */
export async function getReportDownloadUrl(id: string): Promise<ReportDownloadUrl> {
  const res = await api.get(`/reports/${id}/download-url`)
  return ReportDownloadUrlSchema.parse(res.data)
}

/**
 * Phase 6F: Generate a 15-min signed GCS URL for sharing report with CA or bank.
 * SEC-046: TTL capped at 15 minutes.
 */
export const ShareLinkSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
})
export type ShareLink = z.infer<typeof ShareLinkSchema>

export async function generateShareLink(id: string): Promise<ShareLink> {
  const res = await api.post(`/reports/${id}/share-link`)
  return ShareLinkSchema.parse(res.data)
}
