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

// ─────────────────────────────────────────────────────────────────────────────
// Consents response normalization (IOS-01 / AND-08)
// ─────────────────────────────────────────────────────────────────────────────
//
// The AuthService GetMyConsentsQuery returns
//   GetMyConsentsResult(IReadOnlyList<ConsentEntry> Consents)
//   ConsentEntry(Purpose, PurposeDescription, Status, NoticeVersion, ActionAt, Locale)
// which serializes the envelope as `consents` (or PascalCase `Consents`) — NOT
// the `items` the mobile expects — and each entry uses `purpose`/`actionAt`/…
// rather than the mobile `purposeCode`/`grantedAt`/… field names. Without
// normalization the consent summary is always treated as empty (degradation
// banner) and an unguarded `.filter()` on a missing `items` array can crash.
// Same defensive pattern as DocumentListScreen.normalizeDocument (AND-04).

/** Raw consent entry — accepts both backend and mobile-native field names. */
interface RawConsentEntry {
  // mobile-native names (in case the backend ever aligns)
  purposeCode?: string;
  purposeLabel?: string;
  description?: string;
  status?: string;
  grantedAt?: string;
  consentTextVersion?: string;
  withdrawnAt?: string | null;
  withdrawConsequence?: string | null;
  isRegrantable?: boolean;
  // backend ConsentEntry names (camelCased by System.Text.Json)
  purpose?: string;
  purposeDescription?: string;
  noticeVersion?: string;
  actionAt?: string;
  locale?: string;
}

/** Humanize a SCREAMING_SNAKE purpose code into a readable label fallback. */
function humanizePurpose(code: string): string {
  if (!code) return '';
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Map a raw consent entry (either casing/shape) onto the mobile UserConsent. */
function normalizeConsent(raw: RawConsentEntry): UserConsent {
  const purposeCode = raw.purposeCode ?? raw.purpose ?? '';
  const status: ConsentStatus =
    String(raw.status ?? 'GRANTED').toUpperCase() === 'WITHDRAWN'
      ? 'WITHDRAWN'
      : 'GRANTED';
  const actionAt = raw.actionAt ?? '';
  return {
    purposeCode,
    purposeLabel: raw.purposeLabel ?? humanizePurpose(purposeCode),
    description: raw.description ?? raw.purposeDescription ?? '',
    status,
    grantedAt: raw.grantedAt ?? actionAt,
    consentTextVersion: raw.consentTextVersion ?? raw.noticeVersion ?? '',
    withdrawnAt:
      raw.withdrawnAt ?? (status === 'WITHDRAWN' ? actionAt || null : null),
    withdrawConsequence: raw.withdrawConsequence ?? null,
    isRegrantable: raw.isRegrantable,
  };
}

/**
 * Extract the consent array from whatever envelope the backend sent.
 * Accepts a bare array, `{ items }`, `{ consents }`, or PascalCase `{ Consents }`.
 */
function extractConsentArray(body: unknown): RawConsentEntry[] {
  if (Array.isArray(body)) return body as RawConsentEntry[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const candidate = obj.items ?? obj.consents ?? obj.Consents;
    if (Array.isArray(candidate)) return candidate as RawConsentEntry[];
  }
  return [];
}

/**
 * List the authenticated user's consent records, one per processing purpose.
 * GET /auth/me/consents
 *
 * The response is normalized to always expose a `{ items: UserConsent[] }`
 * shape regardless of the backend envelope casing (`items`/`consents`/`Consents`)
 * or per-entry field names — see normalizeConsent above (IOS-01 / AND-08).
 */
export async function getMyConsents(): Promise<GetConsentsResponse> {
  const res = await apiClient.get<unknown>('/auth/me/consents');
  return { items: extractConsentArray(res.data).map(normalizeConsent) };
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
