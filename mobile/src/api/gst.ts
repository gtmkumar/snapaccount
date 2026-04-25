/**
 * GST Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §Phase 6B — GST Completion
 * Base URL: /gst (routed through apiClient base URL from app.config.ts)
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GstNoticeStatus =
  | 'Open'
  | 'Responded'
  | 'Closed'
  | 'Overdue';

export type GstNoticeType =
  | 'ASMT_10'
  | 'ASMT_11'
  | 'CMP_05'
  | 'REG_03'
  | 'REG_17'
  | 'SCN_01'
  | 'Other';

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
