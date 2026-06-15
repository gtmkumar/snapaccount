/**
 * GSTN IMS (Invoice Management System) + GSTR-1A API — typed client functions.
 * GAP-101 / board #32. Spec: docs/design/ims-inbox-spec.md
 * Backend: backend/Services/GstService/GstService.Api/Endpoints/GstIms.cs
 *
 * Status vocabulary is the EXACT backend `ImsInvoice.Status` strings:
 *   PENDING | ACCEPTED | REJECTED | PENDING_KEPT
 * Action request values: "ACCEPTED" | "REJECTED" | "PENDING_KEPT".
 * Period format: MMYYYY (e.g. "032026" = March 2026).
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types — IMS invoices
// ─────────────────────────────────────────────────────────────────────────────

export type ImsInvoiceStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'PENDING_KEPT';

export type ImsAction = 'ACCEPTED' | 'REJECTED' | 'PENDING_KEPT';

export type ImsSource = 'GSTR-1' | 'IFF';

export interface ImsInvoiceSummary {
  id: string;
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  /** ISO date YYYY-MM-DD */
  invoiceDate: string;
  invoiceValue: number;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
  /** MMYYYY */
  period: string;
  source: ImsSource | string;
  status: ImsInvoiceStatus;
  deemedAccepted: boolean;
  actionedAt?: string | null;
  actionedBy?: string | null;
}

export interface ImsInvoiceListResponse {
  items: ImsInvoiceSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ImsActionLogEntry {
  id: string;
  action: string;
  previousStatus: string;
  newStatus: string;
  actedAt: string;
  actedBy?: string | null;
  reason?: string | null;
  isBulk: boolean;
}

export interface ImsInvoiceDetail extends ImsInvoiceSummary {
  rejectionReason?: string | null;
  createdAt: string;
  actionLog: ImsActionLogEntry[];
}

export interface ImsSummary {
  period: string;
  pending: number;
  accepted: number;
  rejected: number;
  pendingKept: number;
  total: number;
  /** Count of invoices swept into ACCEPTED by deemed acceptance. */
  deemedAccepted: number;
  /** ISO date — the 14th of the month following the period. */
  gstr2bGenerationDeadline: string;
  gstr2bGenerationPast: boolean;
  totalPendingValue: number;
  totalAcceptedValue: number;
  totalRejectedValue: number;
}

export interface ImsActionResponse {
  invoiceId: string;
  previousStatus: ImsInvoiceStatus;
  newStatus: ImsInvoiceStatus;
  changed: boolean;
  gstnRef?: string | null;
}

export interface ImsBulkActionItem {
  invoiceId: string;
  action: ImsAction;
  reason?: string;
}

export interface ImsBulkInvoiceResult {
  invoiceId: string;
  success: boolean;
  changed: boolean;
  newStatus?: ImsInvoiceStatus | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ImsBulkActionResponse {
  totalRequested: number;
  changed: number;
  skipped: number;
  failed: number;
  results: ImsBulkInvoiceResult[];
}

export interface ImsSyncResponse {
  inserted: number;
  skipped: number;
  period: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — GSTR-1A amendments
// ─────────────────────────────────────────────────────────────────────────────

export type Gstr1aStatus = 'DRAFT' | 'SUBMITTED' | 'FILED';

export type Gstr1aAmendmentType =
  | 'B2B_AMENDMENT'
  | 'B2BA'
  | 'CDNR_AMENDMENT'
  | 'CDNRA';

export interface Gstr1aAmendmentSummary {
  id: string;
  originalInvoiceNumber: string;
  originalSupplierGstin: string;
  originalImsInvoiceId?: string | null;
  amendmentType: Gstr1aAmendmentType;
  period: string;
  status: Gstr1aStatus;
  arnNumber?: string | null;
  filedAt?: string | null;
  createdAt: string;
}

export interface Gstr1aListResponse {
  items: Gstr1aAmendmentSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CreateGstr1aAmendmentRequest {
  organizationId: string;
  originalImsInvoiceId?: string | null;
  originalInvoiceNumber: string;
  originalSupplierGstin: string;
  amendmentType: Gstr1aAmendmentType;
  /** Structured corrected figures, serialized client-side. */
  amendmentPayloadJson: string;
  period: string;
}

export interface CreateGstr1aAmendmentResponse {
  amendmentId: string;
  status: Gstr1aStatus;
  period: string;
  amendmentType: Gstr1aAmendmentType;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMS endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function listImsInvoices(params: {
  organizationId: string;
  period?: string;
  status?: ImsInvoiceStatus;
  supplierGstin?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<ImsInvoiceListResponse> {
  const res = await apiClient.get<ImsInvoiceListResponse>('/gst/ims/invoices', {
    params,
  });
  return res.data;
}

export async function getImsInvoice(
  id: string,
  organizationId: string,
): Promise<ImsInvoiceDetail> {
  const res = await apiClient.get<ImsInvoiceDetail>(`/gst/ims/invoices/${id}`, {
    params: { organizationId },
  });
  return res.data;
}

export async function getImsSummary(
  organizationId: string,
  period: string,
): Promise<ImsSummary> {
  const res = await apiClient.get<ImsSummary>('/gst/ims/summary', {
    params: { organizationId, period },
  });
  return res.data;
}

export async function syncImsInvoices(data: {
  organizationId: string;
  gstin: string;
  period: string;
}): Promise<ImsSyncResponse> {
  const res = await apiClient.post<ImsSyncResponse>('/gst/ims/sync', data);
  return res.data;
}

export async function actOnImsInvoice(
  invoiceId: string,
  data: {
    organizationId: string;
    actionedBy: string;
    action: ImsAction;
    reason?: string;
  },
): Promise<ImsActionResponse> {
  const res = await apiClient.post<ImsActionResponse>(
    `/gst/ims/invoices/${invoiceId}/action`,
    data,
  );
  return res.data;
}

export async function bulkActOnImsInvoices(data: {
  organizationId: string;
  actionedBy: string;
  items: ImsBulkActionItem[];
}): Promise<ImsBulkActionResponse> {
  const res = await apiClient.post<ImsBulkActionResponse>(
    '/gst/ims/actions/bulk',
    data,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// GSTR-1A endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function listGstr1aAmendments(params: {
  organizationId: string;
  period?: string;
  status?: Gstr1aStatus;
  page?: number;
  pageSize?: number;
}): Promise<Gstr1aListResponse> {
  const res = await apiClient.get<Gstr1aListResponse>('/gst/gstr1a', { params });
  return res.data;
}

export async function createGstr1aAmendment(
  data: CreateGstr1aAmendmentRequest,
): Promise<CreateGstr1aAmendmentResponse> {
  const res = await apiClient.post<CreateGstr1aAmendmentResponse>(
    '/gst/gstr1a',
    data,
  );
  return res.data;
}
