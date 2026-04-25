/**
 * ITR Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §Phase 6D — ITR Engine
 * Base URL: /itr (routed through apiClient base URL from app.config.ts)
 *
 * PAN SECURITY: panCipher must be AES-256-CBC ciphertext from IPanEncryptionService.
 * Never pass raw PAN from mobile — always use panLast4 for UI display.
 * DPDP: Do not cache ComputationJsonb or sensitive filing data beyond session.
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types — Assessee / Profile
// ─────────────────────────────────────────────────────────────────────────────

export type AssesseeType = 'Individual' | 'HUF' | 'Firm' | 'Company' | 'Other';

export interface AssesseeProfile {
  id: string;
  userId: string;
  panLast4: string;
  fullName: string;
  assesseeType: AssesseeType;
  orgId?: string;
  email?: string;
  phone?: string;
  dob?: string;
  address?: string;
  annualTurnoverCr?: number;
}

export interface UpdateProfileRequest {
  userId: string;
  /** AES-256-CBC ciphertext from IPanEncryptionService — NEVER raw PAN */
  panCipher?: string;
  panLast4?: string;
  fullName: string;
  assesseeType: AssesseeType;
  orgId?: string;
  email?: string;
  phone?: string;
  dob?: string;
  address?: string;
  annualTurnoverCr?: number;
}

export interface UpdateProfileResponse {
  assesseeId: string;
  panLast4: string;
  fullName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Filing
// ─────────────────────────────────────────────────────────────────────────────

export type FilingStatus =
  | 'DRAFT'
  | 'UNDER_CA_REVIEW'
  | 'USER_APPROVED'
  | 'FILED'
  | 'E_VERIFIED'
  | 'REFUND_ISSUED'
  | 'REJECTED_BY_CA'
  | 'NOTICE_RECEIVED';

export type ItrFormType = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4' | 'ITR-5' | 'ITR-6' | 'ITR-7';

export type TaxRegime = 'OLD' | 'NEW';

export interface ItrFiling {
  id: string;
  assesseeId: string;
  assessmentYear: string;
  itrFormType: ItrFormType;
  regime: TaxRegime;
  status: FilingStatus;
  computationHash?: string;
  rejectionReason?: string;
  acknowledgementNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItrFilingListResponse {
  items: ItrFiling[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface StartFilingRequest {
  assesseeId: string;
  assessmentYear: string;
  itrFormType: ItrFormType;
  regime: TaxRegime;
}

export interface StartFilingResponse {
  filingId: string;
  assessmentYear: string;
  status: FilingStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Tax Computation
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeRequest {
  salaryIncome: number;
  housePropertyIncome: number;
  businessIncome: number;
  capitalGains: number;
  otherIncome: number;
  section80C: number;
  section80D: number;
  section80E: number;
  otherDeductions: number;
  advanceTaxPaid: number;
  tdsPaid: number;
}

export interface ComputeResult {
  filingId: string;
  grossTotalIncome: number;
  taxableIncome: number;
  totalTaxPayable: number;
  payableOrRefund: number;
  computationHash: string;
  regime: TaxRegime;
  assessmentYear: string;
}

export interface RegimeComparisonResult {
  old: ComputeResult;
  new: ComputeResult;
  recommendedRegime: TaxRegime;
  taxSaving: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Form 16
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadForm16Request {
  assesseeId: string;
  gcsUri: string;
  employeePanCipher: string;
  employeePanLast4: string;
}

export interface UploadForm16Response {
  form16ExtractId: string;
  ocrStatus: 'Pending' | 'Complete' | 'Failed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Refund
// ─────────────────────────────────────────────────────────────────────────────

export type RefundStatus =
  | 'NotApplicable'
  | 'Pending'
  | 'Processing'
  | 'Issued'
  | 'Failed'
  | 'Adjusted';

export interface RefundStatusResponse {
  filingId: string;
  refundStatus: RefundStatus;
  refundAmount?: number;
  refundDate?: string;
  transactionReference?: string;
  statusMessage?: string;
  lastPolledAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Notices
// ─────────────────────────────────────────────────────────────────────────────

export type ItrNoticeType =
  | 'Notice_143_1'
  | 'Notice_143_2'
  | 'Notice_139_9'
  | 'Notice_148'
  | 'Notice_156'
  | 'Other';

export type ItrNoticeStatus = 'Open' | 'Responded' | 'Closed' | 'Overdue';

export interface ItrNoticeAttachment {
  gcsUri: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface ItrNotice {
  id: string;
  filingId: string;
  assesseeId: string;
  noticeNumber: string;
  noticeType: ItrNoticeType;
  status: ItrNoticeStatus;
  issuedDate: string;
  dueDate?: string;
  subject?: string;
  attachmentsJson?: ItrNoticeAttachment[];
  responseText?: string;
  responseAttachmentsJson?: ItrNoticeAttachment[];
  respondedAt?: string;
  createdAt: string;
}

export interface CreateItrNoticeRequest {
  assesseeId: string;
  noticeNumber: string;
  noticeType: ItrNoticeType;
  issuedDate: string;
  dueDate?: string;
  subject?: string;
  attachmentsJson?: ItrNoticeAttachment[];
}

export interface CreateItrNoticeResponse {
  noticeId: string;
  status: ItrNoticeStatus;
}

export interface RespondToItrNoticeRequest {
  respondedByUserId: string;
  responseText?: string;
  responseAttachmentsJson?: ItrNoticeAttachment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — E-Verify
// ─────────────────────────────────────────────────────────────────────────────

export type EVerificationMethod =
  | 'AadhaarOtp'
  | 'NetBanking'
  | 'Demat'
  | 'BankAccountEvc'
  | 'ItrV';

export interface EVerifyRequest {
  verificationMethod: EVerificationMethod;
  /** GCS object key for ITR-V PDF — only required when method = ItrV */
  itrVObjectKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Tax Slabs / Deductions (fetched from backend — never hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxSlabVersion {
  versionId: string;
  assessmentYear: string;
  regime: TaxRegime;
  slabsJson: TaxSlab[];
  standardDeduction: number;
  rebate87AIncomeLimit: number;
  rebate87AMaxAmount: number;
  cessRatePct: number;
}

export interface TaxSlab {
  from: number;
  to: number | null;
  ratePct: number;
}

export interface DeductionSection {
  id: string;
  sectionCode: string;
  name: string;
  maxLimit?: number;
  availableInNewRegime: boolean;
  availableInOldRegime: boolean;
}

export interface DeductionCatalog {
  sections: DeductionSection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function getItrProfile(userId: string): Promise<AssesseeProfile> {
  const res = await apiClient.get<AssesseeProfile>(`/itr/profile/${userId}`);
  return res.data;
}

export async function updateItrProfile(
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  const res = await apiClient.put<UpdateProfileResponse>('/itr/profile', data);
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filing endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function listItrFilings(params: {
  assesseeId: string;
  status?: FilingStatus;
  page?: number;
  pageSize?: number;
}): Promise<ItrFilingListResponse> {
  const res = await apiClient.get<ItrFilingListResponse>('/itr/filings', {
    params,
  });
  return res.data;
}

export async function startItrFiling(
  data: StartFilingRequest,
): Promise<StartFilingResponse> {
  const res = await apiClient.post<StartFilingResponse>('/itr/filings', data);
  return res.data;
}

export async function getItrFiling(id: string): Promise<ItrFiling> {
  const res = await apiClient.get<ItrFiling>(`/itr/filings/${id}`);
  return res.data;
}

export async function computeTax(
  filingId: string,
  data: ComputeRequest,
): Promise<ComputeResult> {
  const res = await apiClient.post<ComputeResult>(
    `/itr/filings/${filingId}/compute`,
    data,
  );
  return res.data;
}

export async function compareRegimes(
  filingId: string,
  data: ComputeRequest,
): Promise<RegimeComparisonResult> {
  const res = await apiClient.post<RegimeComparisonResult>(
    `/itr/filings/${filingId}/compare-regimes`,
    data,
  );
  return res.data;
}

export async function submitFilingForReview(filingId: string): Promise<void> {
  await apiClient.post(`/itr/filings/${filingId}/submit`);
}

export async function markFilingFiled(
  filingId: string,
  acknowledgementNumber: string,
): Promise<void> {
  await apiClient.post(`/itr/filings/${filingId}/mark-filed`, {
    acknowledgementNumber,
  });
}

export async function eVerifyFiling(
  filingId: string,
  data: EVerifyRequest,
): Promise<void> {
  await apiClient.post(`/itr/filings/${filingId}/e-verify`, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Form 16
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadForm16(
  filingId: string,
  data: UploadForm16Request,
): Promise<UploadForm16Response> {
  const res = await apiClient.post<UploadForm16Response>(
    `/itr/filings/${filingId}/form16`,
    data,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notices
// ─────────────────────────────────────────────────────────────────────────────

export async function createItrNotice(
  filingId: string,
  data: CreateItrNoticeRequest,
): Promise<CreateItrNoticeResponse> {
  const res = await apiClient.post<CreateItrNoticeResponse>(
    `/itr/filings/${filingId}/notices`,
    data,
  );
  return res.data;
}

export async function respondToItrNotice(
  noticeId: string,
  data: RespondToItrNoticeRequest,
): Promise<void> {
  await apiClient.post(`/itr/notices/${noticeId}/respond`, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Refund
// ─────────────────────────────────────────────────────────────────────────────

export async function getRefundStatus(
  filingId: string,
): Promise<RefundStatusResponse> {
  const res = await apiClient.get<RefundStatusResponse>(
    `/itr/filings/${filingId}/refund`,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tax slabs & deductions — config-driven, never hardcoded
// ─────────────────────────────────────────────────────────────────────────────

export async function getTaxSlabs(
  assessmentYear: string,
  regime: TaxRegime,
): Promise<TaxSlabVersion> {
  const res = await apiClient.get<TaxSlabVersion>('/itr/tax-slabs', {
    params: { assessmentYear, regime },
  });
  return res.data;
}

export async function getDeductionCatalog(
  assessmentYear: string,
  regime: TaxRegime,
): Promise<DeductionCatalog> {
  const res = await apiClient.get<DeductionCatalog>('/itr/deduction-catalog', {
    params: { assessmentYear, regime },
  });
  return res.data;
}
