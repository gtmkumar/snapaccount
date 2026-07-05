/**
 * Notification Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §NotificationService
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
//
// Matches the Wave 2 (DG-NOTIF-04) backend inbox contract exactly:
//   GET /notifications/inbox?page&pageSize&category&unreadOnly
//   GetInboxQuery.InboxItem → { id, eventCode, category, title, body, status,
//     sentAt, deepLinkUrl, deepLinkLabel, linkedEntityType, linkedEntityId,
//     linkedEntityLabel }. status is READ|UNREAD (NOT the dispatch status).
// ─────────────────────────────────────────────────────────────────────────────

/** READ | UNREAD — derived server-side from IsRead (not the dispatch status). */
export type NotificationStatus = 'READ' | 'UNREAD';

/**
 * Inbox notification category. Mirrors the backend NotificationCategory enum
 * (event-type prefix → category) and the admin NotificationCategory Zod enum.
 */
export type NotificationCategory =
  | 'GST'
  | 'ITR'
  | 'DOCS'
  | 'LOAN'
  | 'CALLBACK'
  | 'BILLING'
  | 'SYSTEM';

export interface InboxNotification {
  id: string;
  eventCode: string;
  /** GST|ITR|DOCS|LOAN|CALLBACK|BILLING|SYSTEM (nullable when uncategorised). */
  category?: NotificationCategory | null;
  title: string;
  body: string;
  status: NotificationStatus;
  sentAt: string;
  /** Phase 6E deep-link target (e.g. snapaccount://… or an in-app path). */
  deepLinkUrl?: string | null;
  /** Human label for the deep-link CTA (e.g. "Open GSTR-3B"). */
  deepLinkLabel?: string | null;
  /** Linked entity type — drives the in-app router fallback (e.g. "document"). */
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  linkedEntityLabel?: string | null;
}

export interface InboxResponse {
  items: InboxNotification[];
  totalCount: number;
  unreadCount: number;
}

export interface InboxQueryParams {
  page?: number;
  pageSize?: number;
  /** Filter by category — matches the event-type prefix server-side. */
  category?: NotificationCategory;
  /** When true, only unread notifications are returned. */
  unreadOnly?: boolean;
}

export interface MarkAllReadResult {
  markedCount: number;
}

export interface PushTokenRegistrationRequest {
  deviceId: string;
  token: string;
  platform: 'ios' | 'android';
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

/** GET /notifications/inbox — paginated in-app inbox for the calling user. */
export async function getNotificationInbox(
  params?: InboxQueryParams,
): Promise<InboxResponse> {
  const res = await apiClient.get<InboxResponse>('/notifications/inbox', { params });
  return res.data;
}

/** POST /notifications/{id}/read — mark a single notification as read. */
export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

/**
 * POST /notifications/read-all — mark every unread notification as read.
 * DG-NOTIF-04/05: wired by NotificationCenterScreen's "Mark all read".
 */
export async function markAllNotificationsRead(): Promise<MarkAllReadResult> {
  const res = await apiClient.post<MarkAllReadResult>('/notifications/read-all');
  return res.data ?? { markedCount: 0 };
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
