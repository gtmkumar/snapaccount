/**
 * Callback Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §CallbackService
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CallbackCategory =
  | 'General'
  | 'Gst'
  | 'Itr'
  | 'Loan'
  | 'Accounting'
  | 'Subscription'
  | 'Technical';

export type CallbackPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type CallbackStatus =
  | 'Pending'
  | 'Assigned'
  | 'Confirmed'
  | 'Completed'
  | 'Escalated'
  | 'Cancelled';

export interface CallbackNote {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  authorName?: string;
}

export interface CallbackDetail {
  id: string;
  userId: string;
  status: CallbackStatus;
  category: CallbackCategory;
  priority: CallbackPriority;
  phoneNumber: string;
  issueDescription?: string;
  preferredWindowStart?: string;
  preferredWindowEnd?: string;
  scheduledAt?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  notes: CallbackNote[];
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelReason?: string;
  completedAt?: string;
  resolutionSummary?: string;
}

export interface CreateCallbackRequest {
  phoneNumber: string;
  category: CallbackCategory;
  priority?: CallbackPriority;
  issueDescription?: string;
  preferredWindowStart?: string;
  preferredWindowEnd?: string;
}

export interface CreateCallbackResponse {
  callbackId: string;
  status: CallbackStatus;
}

export interface CallbackListItem {
  id: string;
  status: CallbackStatus;
  category: CallbackCategory;
  priority: CallbackPriority;
  scheduledAt?: string;
  assignedAgentName?: string;
  createdAt: string;
}

export interface CallbackListResponse {
  items: CallbackListItem[];
  totalCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

export async function createCallback(
  data: CreateCallbackRequest,
): Promise<CreateCallbackResponse> {
  const res = await apiClient.post<CreateCallbackResponse>('/callbacks', data);
  return res.data;
}

export async function getCallback(id: string): Promise<CallbackDetail> {
  const res = await apiClient.get<CallbackDetail>(`/callbacks/${id}`);
  return res.data;
}

export async function listCallbacks(params?: {
  status?: CallbackStatus;
  category?: CallbackCategory;
  page?: number;
  pageSize?: number;
}): Promise<CallbackListResponse> {
  const res = await apiClient.get<CallbackListResponse>('/callbacks', { params });
  return res.data;
}

export async function rescheduleCallback(
  id: string,
  newWindowStart: string,
  newWindowEnd: string,
): Promise<void> {
  await apiClient.post(`/callbacks/${id}/reschedule`, {
    newWindowStart,
    newWindowEnd,
  });
}

export async function cancelCallback(id: string, reason?: string): Promise<void> {
  await apiClient.post(`/callbacks/${id}/cancel`, { reason });
}

export async function addCallbackNote(
  id: string,
  content: string,
): Promise<void> {
  await apiClient.post(`/callbacks/${id}/notes`, { content, isInternal: false });
}

export async function getCallbackKpi(): Promise<{
  averageResponseMinutes?: number;
}> {
  const res = await apiClient.get<{ averageResponseMinutes?: number }>('/callbacks/kpi');
  return res.data;
}
