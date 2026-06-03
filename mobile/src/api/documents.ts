/**
 * Identity Documents API — typed client for the tax/identity documents that the
 * organization collects (PAN, Aadhaar, GSTIN, TAN).
 *
 * Base path: /auth (routed through apiClient — see src/lib/api.ts SERVICE_PORTS).
 *
 * Two collection modes, gated by the org's government-verification policy:
 *   - policy OFF → POST /auth/me/documents/{kind}            (save unverified)
 *   - policy ON  → OTP step: send → confirm                 (verify)
 *
 * SECURITY:
 *   - Document numbers are NOT auth secrets — they are persisted server-side via
 *     the normal API. They must NEVER be written to Expo SecureStore (that store
 *     is reserved for auth tokens). Numbers live transiently in screen state only.
 *   - The {kind} path segment is lowercase (pan|aadhaar|gstin|tan); the response
 *     `kind` is the uppercase enum. mapKindToPath / DocumentKind keep the two in
 *     sync so call sites only ever deal with the uppercase enum.
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Uppercase document-kind enum as returned by the backend. */
export type DocumentKind = 'PAN' | 'AADHAAR' | 'GSTIN' | 'TAN';

/** Lifecycle status of a collected document. */
export type DocumentStatus = 'SAVED' | 'PENDING' | 'VERIFIED' | 'FAILED';

export interface IdentityDocument {
  kind: DocumentKind;
  referenceNumber: string;
  status: DocumentStatus;
  verifiedAt: string | null;
}

export interface VerificationPolicy {
  governmentVerificationEnabled: boolean;
}

/** Response of POST /auth/me/documents/{kind} (save) — partial document. */
export interface SaveDocumentResult {
  kind: DocumentKind;
  referenceNumber: string;
  status: DocumentStatus;
}

/** Response of POST .../verify/otp/send. */
export interface OtpSendResult {
  transactionId: string;
}

/** Response of POST .../verify/otp/confirm. */
export interface OtpConfirmResult {
  kind: DocumentKind;
  status: DocumentStatus;
  verifiedAt: string | null;
  otpAccepted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kind mapping + input normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Map the uppercase enum to the lowercase URL path segment. */
export function mapKindToPath(kind: DocumentKind): string {
  return kind.toLowerCase();
}

/**
 * Normalize a raw document number for a given kind before sending to the API.
 *  - AADHAAR: strip spaces/hyphens (UI may format as XXXX XXXX XXXX).
 *  - PAN / GSTIN / TAN: upper-case and strip surrounding whitespace.
 */
export function normalizeNumber(kind: DocumentKind, raw: string): string {
  if (kind === 'AADHAAR') {
    return raw.replace(/[\s-]/g, '');
  }
  return raw.toUpperCase().trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** GET /auth/me/organization/verification-policy */
export async function getVerificationPolicy(): Promise<VerificationPolicy> {
  const res = await apiClient.get<VerificationPolicy>(
    '/auth/me/organization/verification-policy',
  );
  return res.data;
}

/** GET /auth/me/documents — existing documents (for status hydration). */
export async function getDocuments(): Promise<IdentityDocument[]> {
  const res = await apiClient.get<IdentityDocument[]>('/auth/me/documents');
  return res.data ?? [];
}

/**
 * POST /auth/me/documents/{kind} — save a document (unverified path, policy OFF).
 * @param holderName optional name as printed on the document.
 */
export async function saveDocument(
  kind: DocumentKind,
  number: string,
  holderName?: string,
): Promise<SaveDocumentResult> {
  const body: { number: string; holderName?: string } = {
    number: normalizeNumber(kind, number),
  };
  if (holderName) body.holderName = holderName;

  const res = await apiClient.post<SaveDocumentResult>(
    `/auth/me/documents/${mapKindToPath(kind)}`,
    body,
  );
  return res.data;
}

/** POST /auth/me/documents/{kind}/verify/otp/send — start the OTP verify step. */
export async function sendDocumentOtp(
  kind: DocumentKind,
  number: string,
): Promise<OtpSendResult> {
  const res = await apiClient.post<OtpSendResult>(
    `/auth/me/documents/${mapKindToPath(kind)}/verify/otp/send`,
    { number: normalizeNumber(kind, number) },
  );
  return res.data;
}

/**
 * POST /auth/me/documents/{kind}/verify/otp/confirm — confirm the OTP.
 * Caller MUST check `otpAccepted` (the mock provider treats "000000" as a wrong
 * OTP that is rejected without throwing; the document stays PENDING for retry).
 */
export async function confirmDocumentOtp(
  kind: DocumentKind,
  transactionId: string,
  otp: string,
): Promise<OtpConfirmResult> {
  const res = await apiClient.post<OtpConfirmResult>(
    `/auth/me/documents/${mapKindToPath(kind)}/verify/otp/confirm`,
    { transactionId, otp },
  );
  return res.data;
}
