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

// ─────────────────────────────────────────────────────────────────────────────
// Celebrations — P6-QA-MOBILE-10 server fire-guard (Phase 6F contract)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-recognised celebration kinds (FireCelebrationCommandValidator).
 * One record per user × kind in notification.notification_log
 * (EventCode = 'celebration.{kind}').
 */
export type ServerCelebrationKind =
  | 'first_gst_filed'
  | 'first_refund_credited'
  | 'first_loan_disbursed'
  | 'first_itr_filed'
  | 'first_document_uploaded';

export interface FireCelebrationResponse {
  /** true when this user+kind was already recorded — caller should NOT re-show. */
  alreadyFired: boolean;
  kind: string;
  firedAt: string;
}

/**
 * POST /notifications/celebrations/{kind}/fire — idempotent per user × kind.
 * Duplicate calls return 200 with alreadyFired=true. Used as the fired-once
 * guard for "first …" celebration overlays (docs/design/component-library.md).
 */
export async function fireCelebration(
  kind: ServerCelebrationKind,
): Promise<FireCelebrationResponse> {
  const res = await apiClient.post<FireCelebrationResponse>(
    `/notifications/celebrations/${kind}/fire`,
  );
  return res.data;
}

/**
 * GET /notifications/celebrations — map of kind → already-fired boolean.
 * Available for screens that want to pre-check before mounting an overlay.
 */
export async function getCelebrations(): Promise<Record<string, boolean>> {
  const res = await apiClient.get<Record<string, boolean>>('/notifications/celebrations');
  return res.data ?? {};
}
