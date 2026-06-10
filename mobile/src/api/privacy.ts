/**
 * Privacy API — DPDP Act 2023 user-rights endpoints.
 * M3b (GAP-020) · Backend B7 (AuthService Privacy endpoints)
 *
 * Endpoints (all under /auth/me/):
 *   GET  /auth/me/consents                          — list current consent status
 *   POST /auth/me/consents/{purpose}/withdraw       — withdraw a processing consent
 *   POST /auth/me/data-export                       — enqueue a data export job
 *   GET  /auth/me/data-export                       — poll export job status
 *   POST /auth/me/data-correction                   — submit a data correction request
 *   GET  /auth/me/data-correction                   — list own correction requests
 *
 * NOTE: DPO/grievance contact is sourced from mobile/src/config/privacyContact.ts
 * (no backend endpoint yet — see TODO in that file).
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types — Consents
// ─────────────────────────────────────────────────────────────────────────────

export type ConsentStatus = 'GRANTED' | 'WITHDRAWN';

export type ConsentPurpose =
  | 'CREDIT_BUREAU'
  | 'DATA_SHARE_WITH_BANK'
  | 'DISBURSEMENT_MANDATE'
  | 'MARKETING'
  | 'ANALYTICS'
  | string;

export interface UserConsent {
  purposeCode: ConsentPurpose;
  /** Localized display label for the purpose. */
  purposeLabel: string;
  /** Localized plain-language description of what data is processed. */
  description: string;
  status: ConsentStatus;
  grantedAt: string;
  consentTextVersion: string;
  withdrawnAt?: string | null;
  /** Server-supplied consequence text for withdrawal, localized. */
  withdrawConsequence?: string | null;
  /** Whether this consent can be re-granted without navigating to a separate flow. */
  isRegrantable?: boolean;
}

export interface GetConsentsResponse {
  items: UserConsent[];
}

/**
 * Body for POST /auth/me/consents/{purpose}/withdraw.
 * Backend expects: { NoticeVersion, Locale? }
 */
export interface WithdrawConsentBody {
  noticeVersion: string;
  locale?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Data Export
// ─────────────────────────────────────────────────────────────────────────────

export type DataExportStatus =
  | 'REQUESTED'
  | 'PROCESSING'
  | 'READY'
  | 'EXPIRED'
  | 'FAILED';

export interface DataExportJob {
  requestId: string;
  status: DataExportStatus;
  requestedAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
  /** Signed GCS download URL — only present when status === 'READY'. */
  downloadUrl?: string | null;
  errorMessage?: string | null;
}

/** Response from POST /auth/me/data-export */
export interface EnqueueDataExportResponse {
  requestId: string;
  status: DataExportStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Data Correction
// ─────────────────────────────────────────────────────────────────────────────

export type CorrectionStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface DataCorrectionRequest {
  requestId: string;
  dataCategory: string;
  description: string;
  status: CorrectionStatus;
  submittedAt: string;
  resolvedAt?: string | null;
  rejectionReason?: string | null;
}

export interface SubmitCorrectionResponse {
  requestId: string;
}

export interface ListCorrectionsResponse {
  items: DataCorrectionRequest[];
}

/**
 * Body for POST /auth/me/data-correction.
 * Backend: DataCorrectionRequestBody(DataCategory, Description)
 */
export interface SubmitCorrectionBody {
  dataCategory: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List the authenticated user's consent records, one per processing purpose.
 * GET /auth/me/consents
 */
export async function getMyConsents(): Promise<GetConsentsResponse> {
  const res = await apiClient.get<GetConsentsResponse>('/auth/me/consents');
  return res.data;
}

/**
 * Withdraw consent for a specific processing purpose.
 * POST /auth/me/consents/{purpose}/withdraw
 * Returns 204 No Content on success.
 */
export async function withdrawConsent(
  purpose: string,
  body: WithdrawConsentBody,
): Promise<void> {
  await apiClient.post(
    `/auth/me/consents/${encodeURIComponent(purpose)}/withdraw`,
    { noticeVersion: body.noticeVersion, locale: body.locale ?? 'en' },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data export endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue a new data export job (DPDP Right to Access).
 * POST /auth/me/data-export → 202 Accepted { requestId, status }
 */
export async function requestDataExport(): Promise<EnqueueDataExportResponse> {
  const res = await apiClient.post<EnqueueDataExportResponse>(
    '/auth/me/data-export',
  );
  return res.data;
}

/**
 * Poll the status of the most recent data export job.
 * GET /auth/me/data-export → 200 DataExportJob | 404 (no job yet)
 * Returns null when no job has been created yet.
 */
export async function getDataExportStatus(): Promise<DataExportJob | null> {
  try {
    const res = await apiClient.get<DataExportJob>('/auth/me/data-export');
    return res.data;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } };
    if (e?.response?.status === 404) return null;
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data correction endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a data-correction request (DPDP Right to Correction).
 * POST /auth/me/data-correction → 202 Accepted { requestId }
 */
export async function submitDataCorrection(
  body: SubmitCorrectionBody,
): Promise<SubmitCorrectionResponse> {
  const res = await apiClient.post<SubmitCorrectionResponse>(
    '/auth/me/data-correction',
    body,
  );
  return res.data;
}

/**
 * List the authenticated user's own data-correction requests.
 * GET /auth/me/data-correction → 200 { items: DataCorrectionRequest[] }
 */
export async function listMyDataCorrections(): Promise<ListCorrectionsResponse> {
  const res = await apiClient.get<ListCorrectionsResponse>(
    '/auth/me/data-correction',
  );
  return res.data;
}
