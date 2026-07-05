/**
 * Report Service API — typed client for PDF generation, download URLs and
 * share links (DG-DASH-05 / D3.1 / D3.2).
 *
 * Backend contract (Finance composite, ReportService.Api.Endpoints.Reports):
 *   POST /reports/generate          → GenerateReportResponse
 *   GET  /reports/{id}/download-url → ReportDownloadUrlDto  { jobId, signedUrl, expiresAt }
 *   POST /reports/{id}/share-link   → ShareLinkResponse     { jobId, signedUrl, expiresAt }
 *   POST /reports/tally-export      → GenerateReportResponse
 *
 * Enums are serialised by NAME (Finance.WebApi registers JsonStringEnumConverter),
 * so reportType/format are sent as "ProfitAndLoss" / "Pdf" (NOT integers).
 * Status comes back already mapped to QUEUED | GENERATING | COMPLETE | FAILED
 * (DG-DASH-02). The download-url/share-link DTOs use `signedUrl` (the admin
 * client's `url` alias is a known drift — the wire field is `signedUrl`).
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types — match backend ReportType / ReportFormat enum NAMES.
// ─────────────────────────────────────────────────────────────────────────────

export type BackendReportType =
  | 'TrialBalance'
  | 'ProfitAndLoss'
  | 'BalanceSheet'
  | 'CashFlow'
  | 'TaxLiability'
  | 'LedgerByAccount';

export type ReportFormat = 'Pdf' | 'Json';

/** Already-mapped status casing the backend emits (DG-DASH-02). */
export type ReportStatus = 'QUEUED' | 'GENERATING' | 'COMPLETE' | 'FAILED';

export interface GenerateReportResponse {
  jobId: string;
  status: ReportStatus | string;
  gcsUri?: string | null;
  sha256HashHex?: string | null;
  pageCount?: number | null;
}

export interface ReportDownloadUrl {
  jobId: string;
  signedUrl: string;
  expiresAt: string;
}

export interface GenerateReportRequest {
  reportType: BackendReportType;
  format?: ReportFormat;
  /** Indian-FY start-year string, e.g. "2026" — backend reads it as FinancialYear. */
  financialYear?: string;
  periodStart?: string;
  periodEnd?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Slug → backend ReportType mapping
// The Report Detail screen / Reports list use UI slugs ('pnl', 'profit-and-loss',
// 'trial-balance', …). Only the slugs that have a PDF generator map to a
// BackendReportType; everything else returns null (caller shows "not available").
// ─────────────────────────────────────────────────────────────────────────────

export function reportTypeForSlug(slug: string): BackendReportType | null {
  switch (slug) {
    case 'pnl':
    case 'profit-and-loss':
      return 'ProfitAndLoss';
    case 'trial-balance':
      return 'TrialBalance';
    case 'balance-sheet':
      return 'BalanceSheet';
    case 'tax-liability':
      return 'TaxLiability';
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueues + (synchronously, in the current backend) generates a report.
 * Returns the job id and final status. For PDFs, follow up with
 * {@link getReportDownloadUrl} once status is COMPLETE.
 */
export async function generateReport(
  req: GenerateReportRequest,
): Promise<GenerateReportResponse> {
  const res = await apiClient.post<GenerateReportResponse>('/reports/generate', {
    reportType: req.reportType,
    format: req.format ?? 'Pdf',
    financialYear: req.financialYear,
    periodStart: req.periodStart,
    periodEnd: req.periodEnd,
  });
  return res.data;
}

/**
 * Fetches a short-lived signed GCS download URL for a completed report.
 * NEVER cache the URL — it expires per the backend TTL (1h for download,
 * 15min for share links). Returns `signedUrl`.
 */
export async function getReportDownloadUrl(jobId: string): Promise<ReportDownloadUrl> {
  const res = await apiClient.get<ReportDownloadUrl>(`/reports/${jobId}/download-url`);
  return res.data;
}

/**
 * Generates a 15-minute signed share link (SEC-046) for sharing a report PDF
 * with a CA or bank. Returns a fresh `signedUrl` on every call.
 */
export async function createReportShareLink(jobId: string): Promise<ReportDownloadUrl> {
  const res = await apiClient.post<ReportDownloadUrl>(`/reports/${jobId}/share-link`);
  return res.data;
}

/**
 * Enqueues a Tally XML export job (CSV fallback when the feature flag is off).
 * POST /reports/tally-export → same GenerateReportResponse shape; follow up with
 * {@link getReportDownloadUrl} to fetch the file.
 */
export async function enqueueTallyExport(
  params: { periodStart?: string; periodEnd?: string } = {},
): Promise<GenerateReportResponse> {
  const res = await apiClient.post<GenerateReportResponse>('/reports/tally-export', {
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });
  return res.data;
}

/**
 * Convenience: generate a report PDF and resolve its signed download URL in one
 * call. Throws if generation fails or did not complete. Used by the mobile
 * Report PDF Preview flow (generate → poll/download).
 */
export async function generateAndResolvePdf(
  req: GenerateReportRequest,
): Promise<{ jobId: string; signedUrl: string; pageCount?: number | null }> {
  const job = await generateReport({ ...req, format: 'Pdf' });
  if (job.status === 'FAILED') {
    throw new Error('Report generation failed.');
  }
  const dl = await getReportDownloadUrl(job.jobId);
  return { jobId: job.jobId, signedUrl: dl.signedUrl, pageCount: job.pageCount };
}
