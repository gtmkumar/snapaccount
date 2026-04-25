/**
 * Loan Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §Phase 6C — Loan Hub
 * Base URL: /loans (routed through apiClient base URL from app.config.ts)
 *
 * SECURITY:
 *  - IDOR: all handlers filter by OrgId from JWT — do not pass orgId from client
 *  - PDF signed URLs expire in 1h — never cache; always fetch fresh (P6-HANDOFF-20 pattern)
 *  - DPDP: AnonymizedAt on LoanApplication; do not cache sensitive doc data beyond session
 *  - Consent: always post consent_text_version seen by user, not a hard-coded version
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types — Loan Products
// ─────────────────────────────────────────────────────────────────────────────

export interface LoanProduct {
  productId: string;
  bankId: string;
  productName: string;
  description?: string;
  minAmount: number;
  maxAmount: number;
  tenureMonths: number;
  interestRate: number;
  eligibilityCriteriaJson?: string;
  isActive: boolean;
}

export interface LoanProductListResponse {
  items: LoanProduct[];
  totalCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Loan Applications
// ─────────────────────────────────────────────────────────────────────────────

export type LoanApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DOCS_REQUESTED'
  | 'DISBURSED'
  | 'CLOSED';

export type LoanPurpose =
  | 'WORKING_CAPITAL'
  | 'EQUIPMENT'
  | 'INVENTORY'
  | 'EXPANSION'
  | 'OTHER';

export interface LoanApplication {
  applicationId: string;
  orgId: string;
  loanProductId: string;
  productName?: string;
  bankId?: string;
  bankName?: string;
  status: LoanApplicationStatus;
  requestedAmount: number;
  tenureMonths: number;
  purpose: LoanPurpose;
  bankReferenceNo?: string;
  disbursedAmount?: number;
  rejectionReason?: string;
  packageUrl?: string;
  submittedAt?: string;
  approvedAt?: string;
  disbursedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanApplicationListResponse {
  items: LoanApplication[];
  totalCount: number;
}

export interface CreateApplicationRequest {
  loanProductId: string;
  requestedAmount: number;
  tenureMonths: number;
  purpose: LoanPurpose;
}

export interface CreateApplicationResponse {
  applicationId: string;
}

export interface AssignBankRequest {
  bankId: string;
}

export interface AssignBankResponse {
  packageUrl: string;
}

export interface ApproveApplicationRequest {
  bankReferenceNo: string;
}

export interface RejectApplicationRequest {
  reason: string;
}

export interface DisburseApplicationRequest {
  disbursedAmount: number;
  bankReferenceNo: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Documents
// ─────────────────────────────────────────────────────────────────────────────

export type LoanDocumentType =
  | 'PAN_CARD'
  | 'AADHAAR'
  | 'GSTR_3B'
  | 'PROFIT_LOSS'
  | 'BALANCE_SHEET'
  | 'BANK_STATEMENT'
  | 'TRADE_LICENSE'
  | 'ITR';

export interface LoanDocument {
  documentId: string;
  documentType: LoanDocumentType;
  fileName: string;
  uploadedAt: string;
}

export interface LoanDocumentListResponse {
  items: LoanDocument[];
}

export interface UploadDocumentRequest {
  documentType: LoanDocumentType;
  fileBase64: string;
  fileName: string;
}

export interface UploadDocumentResponse {
  documentId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Consent
// ─────────────────────────────────────────────────────────────────────────────

export type ConsentType =
  | 'CREDIT_BUREAU'
  | 'DATA_SHARE_WITH_BANK'
  | 'DISBURSEMENT_MANDATE';

export interface RecordConsentRequest {
  /**
   * The exact version string of the consent text the user reviewed.
   * DPDP requirement: must match the text_version in DB consent record.
   * Never hardcode — always read from the consent document returned by backend.
   */
  consentVersion: string;
  consentType: ConsentType;
}

export interface RecordConsentResponse {
  consentId: string;
  /** Last 8 hex chars of HMAC-SHA256 signature computed server-side */
  signatureHex: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Package Download
// ─────────────────────────────────────────────────────────────────────────────

export interface PackageDownloadUrlResponse {
  /**
   * Signed GCS URL with 1h TTL.
   * SECURITY: Never cache this URL — fetch fresh on each view (expires per P6-HANDOFF-20).
   */
  url: string;
  expiresAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Banks
// ─────────────────────────────────────────────────────────────────────────────

export type BankAdapterType = 'EmailBankAdapter' | 'RestBankAdapter';

export interface PartnerBank {
  bankId: string;
  name: string;
  adapterType: BankAdapterType;
  isActive: boolean;
}

export interface PartnerBankListResponse {
  items: PartnerBank[];
  totalCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Eligibility (mobile-side shape for pre-check UI)
// These map to the computed score from AccountingService + GstService
// that the backend assembles and returns under /loans/eligibility
// ─────────────────────────────────────────────────────────────────────────────

export interface EligibilityCheckRequest {
  requestedAmount: number;
  tenureMonths: number;
  purpose: LoanPurpose;
  /** Soft check consent — must be true before calling */
  softCheckConsent: boolean;
}

export interface EligibilityProduct {
  productId: string;
  productName: string;
  bankId: string;
  bankName: string;
  minAmount: number;
  maxAmount: number;
  tenureMonths: number;
  interestRate: number;
  matchLevel: 'QUALIFIED' | 'NEAR_MATCH' | 'NOT_QUALIFIED';
  reasons: string[];
}

export interface EligibilityResult {
  score: number; // 0–100
  qualifiedCount: number;
  totalBanks: number;
  qualifyReasons: string[];
  improveReasons: string[];
  qualifiedProducts: EligibilityProduct[];
  nearMatchProducts: EligibilityProduct[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Product endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function listLoanProducts(params?: {
  page?: number;
  pageSize?: number;
}): Promise<LoanProductListResponse> {
  const res = await apiClient.get<LoanProductListResponse>('/loans/products', {
    params,
  });
  return res.data;
}

export async function getLoanProduct(productId: string): Promise<LoanProduct> {
  const res = await apiClient.get<LoanProduct>(`/loans/products/${productId}`);
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Application endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function createLoanApplication(
  data: CreateApplicationRequest,
): Promise<CreateApplicationResponse> {
  const res = await apiClient.post<CreateApplicationResponse>(
    '/loans/applications',
    data,
  );
  return res.data;
}

export async function listLoanApplications(params?: {
  status?: LoanApplicationStatus;
  page?: number;
  pageSize?: number;
}): Promise<LoanApplicationListResponse> {
  const res = await apiClient.get<LoanApplicationListResponse>(
    '/loans/applications',
    { params },
  );
  return res.data;
}

export async function getLoanApplication(
  applicationId: string,
): Promise<LoanApplication> {
  const res = await apiClient.get<LoanApplication>(
    `/loans/applications/${applicationId}`,
  );
  return res.data;
}

export async function submitLoanApplication(
  applicationId: string,
): Promise<void> {
  await apiClient.post(`/loans/applications/${applicationId}/submit`);
}

export async function beginReviewLoanApplication(
  applicationId: string,
): Promise<void> {
  await apiClient.post(
    `/loans/applications/${applicationId}/begin-review`,
  );
}

export async function assignBankToApplication(
  applicationId: string,
  data: AssignBankRequest,
): Promise<AssignBankResponse> {
  const res = await apiClient.post<AssignBankResponse>(
    `/loans/applications/${applicationId}/assign-bank`,
    data,
  );
  return res.data;
}

export async function approveLoanApplication(
  applicationId: string,
  data: ApproveApplicationRequest,
): Promise<void> {
  await apiClient.post(
    `/loans/applications/${applicationId}/approve`,
    data,
  );
}

export async function rejectLoanApplication(
  applicationId: string,
  data: RejectApplicationRequest,
): Promise<void> {
  await apiClient.post(
    `/loans/applications/${applicationId}/reject`,
    data,
  );
}

export async function requestDocumentsForApplication(
  applicationId: string,
): Promise<void> {
  await apiClient.post(
    `/loans/applications/${applicationId}/request-documents`,
  );
}

export async function disburseLoanApplication(
  applicationId: string,
  data: DisburseApplicationRequest,
): Promise<void> {
  await apiClient.post(
    `/loans/applications/${applicationId}/disburse`,
    data,
  );
}

export async function closeLoanApplication(
  applicationId: string,
): Promise<void> {
  await apiClient.post(`/loans/applications/${applicationId}/close`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Document endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadLoanDocument(
  applicationId: string,
  data: UploadDocumentRequest,
): Promise<UploadDocumentResponse> {
  const res = await apiClient.post<UploadDocumentResponse>(
    `/loans/applications/${applicationId}/documents`,
    data,
  );
  return res.data;
}

export async function listLoanDocuments(
  applicationId: string,
): Promise<LoanDocumentListResponse> {
  const res = await apiClient.get<LoanDocumentListResponse>(
    `/loans/applications/${applicationId}/documents`,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a signed consent.
 * IMPORTANT: consentVersion must be the exact text_version string that the user
 * reviewed on-screen (captured from the consent document header). Backend computes
 * HMAC-SHA256 from server key — never compute this on client.
 */
export async function recordLoanConsent(
  applicationId: string,
  data: RecordConsentRequest,
): Promise<RecordConsentResponse> {
  const res = await apiClient.post<RecordConsentResponse>(
    `/loans/applications/${applicationId}/consent`,
    data,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Package download URL — NEVER cache; always fetch fresh (1h TTL signed URL)
// ─────────────────────────────────────────────────────────────────────────────

export async function getLoanPackageDownloadUrl(
  applicationId: string,
): Promise<PackageDownloadUrlResponse> {
  const res = await apiClient.get<PackageDownloadUrlResponse>(
    `/loans/applications/${applicationId}/package/download-url`,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner banks
// ─────────────────────────────────────────────────────────────────────────────

export async function listPartnerBanks(params?: {
  page?: number;
  pageSize?: number;
}): Promise<PartnerBankListResponse> {
  const res = await apiClient.get<PartnerBankListResponse>('/loans/banks', {
    params,
  });
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent catalog — SEC-050: version sourced from backend, not hardcoded
// P6-HANDOFF-25: backend-agent must implement GET /loans/consents/catalog
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsentCatalogEntry {
  consentType: ConsentType;
  /**
   * The exact text_version string used for DPDP audit trail.
   * Backend increments this when legal body changes.
   */
  textVersion: string;
  /** ISO-8601 date the version was published */
  effectiveDate: string;
}

export interface ConsentCatalogResponse {
  items: ConsentCatalogEntry[];
}

/**
 * Fetch the current consent version catalog from backend.
 * SEC-050: replaces the hardcoded CONSENT_VERSION = '1.4' constant.
 *
 * P6-HANDOFF-25: GET /loans/consents/catalog endpoint must be implemented
 * by backend-agent. Until then, this throws a 404 and the screen falls back
 * to the FALLBACK_CONSENT_VERSION constant.
 */
export async function getConsentCatalog(): Promise<ConsentCatalogResponse> {
  const res = await apiClient.get<ConsentCatalogResponse>('/loans/consents/catalog');
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility pre-check (soft check — no CIBIL pull)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkLoanEligibility(
  data: EligibilityCheckRequest,
): Promise<EligibilityResult> {
  const res = await apiClient.post<EligibilityResult>(
    '/loans/eligibility',
    data,
  );
  return res.data;
}
