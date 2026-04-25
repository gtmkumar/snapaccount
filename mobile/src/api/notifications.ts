/**
 * Notification Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §NotificationService
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationStatus = 'Sent' | 'Delivered' | 'Read' | 'Failed';

export interface InboxNotification {
  id: string;
  eventCode: string;
  body: string;
  status: NotificationStatus;
  sentAt: string;
  /** Parsed from body or eventCode for display */
  title?: string;
  type?: 'gst' | 'itr' | 'document' | 'loan' | 'chat' | 'callback' | 'system';
  /** Deep link data */
  data?: Record<string, string>;
}

export interface InboxResponse {
  items: InboxNotification[];
  totalCount: number;
  unreadCount: number;
}

export interface PushTokenRegistrationRequest {
  deviceId: string;
  token: string;
  platform: 'ios' | 'android';
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

export async function getNotificationInbox(params?: {
  page?: number;
  pageSize?: number;
}): Promise<InboxResponse> {
  const res = await apiClient.get<InboxResponse>('/notifications/inbox', { params });
  return res.data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

export async function registerPushToken(
  data: PushTokenRegistrationRequest,
): Promise<void> {
  await apiClient.post('/notifications/push-tokens', data);
}
