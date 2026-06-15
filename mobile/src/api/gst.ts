/**
 * GST Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §Phase 6B — GST Completion
 * Base URL: /gst (routed through apiClient base URL from app.config.ts)
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical server notice lifecycle (Wave 7 residual #7 alignment).
 * "Overdue" is no longer a status — it is computed client-side, see
 * src/lib/noticeStatus.ts.
 */
export type GstNoticeStatus =
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'RESPONDED'
  | 'CLOSED';

export type GstNoticeType =
  | 'ASMT_10'
  | 'ASMT_11'
  | 'CMP_05'
  | 'REG_03'
  | 'REG_17'
  | 'SCN_01'
  | 'Other';

// ─────────────────────────────────────────────────────────────────────────────
// Wave 7B/7C — GAP-108 notice taxonomy / statutory deadline / GSTAT stage
// RECONCILED 2026-06-12 against docs/api/endpoints.md "Wave 7C — GST Notice
// Engine" + GstService NoticeDto/NoticeDetailDto (migration 084):
//  - formType enum gains OTHER (server default).
//  - Appeal ladder is NONE → REPLY_FILED → ORDER_RECEIVED → APPEAL_FILED →
//    GSTAT_PENDING → RESOLVED (forward-only), NOT the spec-suggested 7-stage
//    ladder.
//  - Fields: statutoryDeadline (DateOnly), appealStage, appealDeadline,
//    isGstatBacklogFlagged, deadlineOverridden, daysRemaining, isOverdue.
// RESIDUAL #7 RESOLVED 2026-06-12: GstNoticeStatus now mirrors the server
// canon (RECEIVED/UNDER_REVIEW/RESPONDED/CLOSED). The old "Overdue" filter is
// a client-side derived view (src/lib/noticeStatus.ts isNoticeOverdue) —
// never sent as a status query param. Wave 7 recon: the backend ListNotices
// endpoint shims legacy request filters (Open→RECEIVED, Overdue→UNDER_REVIEW,
// Responded→RESPONDED, Closed→CLOSED) for pre-Wave-7C builds; responses are
// canonical, so client-side legacy tolerance has been removed.
// ─────────────────────────────────────────────────────────────────────────────

/** Statutory form-type taxonomy (distinct from workflow status). */
export type GstNoticeFormType =
  | 'ASMT_10'
  | 'DRC_01'
  | 'DRC_01A'
  | 'DRC_01B'
  | 'DRC_01C'
  | 'ADT_01'
  | 'OTHER';

/** GSTAT appeal ladder stages (server enum, forward-only state machine). */
export type GstatStage =
  | 'NONE'
  | 'REPLY_FILED'
  | 'ORDER_RECEIVED'
  | 'APPEAL_FILED'
  | 'GSTAT_PENDING'
  | 'RESOLVED';

/** Active appeal ladder (NONE = not in appeal → no tracker rendered). */
export const GSTAT_STAGE_ORDER: Exclude<GstatStage, 'NONE'>[] = [
  'REPLY_FILED',
  'ORDER_RECEIVED',
  'APPEAL_FILED',
  'GSTAT_PENDING',
  'RESOLVED',
];

export interface GstNoticeAttachment {
  gcsUri: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface GstNotice {
  id: string;
  orgId: string;
  noticeNumber: string;
  noticeType: GstNoticeType;
  status: GstNoticeStatus;
  issuedBy?: string;
  issuedDate: string;
  dueDate?: string;
  description?: string;
  attachmentsJson?: GstNoticeAttachment[];
  responseText?: string;
  responseAttachmentMetadataJson?: GstNoticeAttachment[];
  respondedAt?: string;
  assignedCaUserId?: string;
  createdAt: string;
  updatedAt: string;

  // ── Wave 7B/7C (GAP-108) — all optional; UI gracefully degrades when absent ──
  /** Statutory form-type code (taxonomy badge); OTHER = no badge. */
  formType?: GstNoticeFormType;
  /** Statutory response deadline (DueDateChip source), "YYYY-MM-DD". */
  statutoryDeadline?: string;
  /** True when an operator overrode the computed deadline. */
  deadlineOverridden?: boolean;
  /** Server-computed days remaining to the effective deadline (detail only). */
  daysRemaining?: number | null;
  isOverdue?: boolean;
  /** GSTAT appeal stage; "NONE" → not in appeal (no tracker). */
  appealStage?: GstatStage;
  appealDeadline?: string | null;
  /** GSTAT backlog-appeal window applies (file by 30/06/2026). */
  isGstatBacklogFlagged?: boolean;
}

export interface GstNoticeListResponse {
  items: GstNotice[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface GstNoticeListParams {
  orgId: string;
  status?: GstNoticeStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateGstNoticeRequest {
  orgId: string;
  noticeNumber: string;
  noticeType: GstNoticeType;
  issuedBy?: string;
  issuedDate: string;
  dueDate?: string;
  description?: string;
}

export interface CreateGstNoticeResponse {
  noticeId: string;
  status: GstNoticeStatus;
}

export interface RespondToGstNoticeRequest {
  noticeId: string;
  respondedByUserId: string;
  responseText?: string;
  responseAttachmentMetadataJson?: GstNoticeAttachment[];
}

export interface AssignGstNoticeToCaRequest {
  caUserId: string;
}

export interface FileNilReturnResponse {
  ackNumber: string;
  filedAt: string;
}

export interface GstReturn {
  id: string;
  organizationId: string;
  returnType: 'GSTR-1' | 'GSTR-3B' | 'GSTR-9';
  period: string;
  status: 'Pending' | 'Filed' | 'NilFiled' | 'Overdue';
  dueDate: string;
  taxableAmount?: number;
  itcClaimed?: number;
  netPayable?: number;
}

export interface GstReturnListResponse {
  items: GstReturn[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface GstHsnSacItem {
  code: string;
  description: string;
  gstRate: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notice endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function listGstNotices(
  params: GstNoticeListParams,
): Promise<GstNoticeListResponse> {
  const res = await apiClient.get<GstNoticeListResponse>('/gst/notices', {
    params,
  });
  return res.data;
}

export async function getGstNotice(id: string): Promise<GstNotice> {
  const res = await apiClient.get<GstNotice>(`/gst/notices/${id}`);
  return res.data;
}

export async function createGstNotice(
  data: CreateGstNoticeRequest,
): Promise<CreateGstNoticeResponse> {
  const res = await apiClient.post<CreateGstNoticeResponse>('/gst/notices', data);
  return res.data;
}

export async function respondToGstNotice(
  id: string,
  data: RespondToGstNoticeRequest,
): Promise<void> {
  await apiClient.post(`/gst/notices/${id}/respond`, data);
}

export async function assignGstNoticeToCa(
  id: string,
  data: AssignGstNoticeToCaRequest,
): Promise<void> {
  await apiClient.post(`/gst/notices/${id}/assign-ca`, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Nil return
// ─────────────────────────────────────────────────────────────────────────────

export async function fileNilReturn(
  gstReturnId: string,
): Promise<FileNilReturnResponse> {
  const res = await apiClient.post<FileNilReturnResponse>(
    `/gst/returns/${gstReturnId}/nil`,
    { gstReturnId },
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Returns
// ─────────────────────────────────────────────────────────────────────────────

export async function listGstReturns(params: {
  organizationId: string;
  financialYear?: string;
  page?: number;
  pageSize?: number;
}): Promise<GstReturnListResponse> {
  const res = await apiClient.get<GstReturnListResponse>('/gst/returns', {
    params,
  });
  return res.data;
}

export async function getGstReturn(id: string): Promise<GstReturn> {
  const res = await apiClient.get<GstReturn>(`/gst/returns/${id}`);
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// HSN/SAC
// ─────────────────────────────────────────────────────────────────────────────

export async function searchHsnSac(
  query: string,
  limit = 20,
): Promise<GstHsnSacItem[]> {
  const res = await apiClient.get<{ items: GstHsnSacItem[] }>('/gst/hsn-sac', {
    params: { query, limit },
  });
  return res.data.items;
}
