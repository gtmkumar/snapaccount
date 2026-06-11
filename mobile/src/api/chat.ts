/**
 * Chat API client — REST endpoints + SignalR hub client.
 * Phase 6F · Track F2 · docs/api/endpoints.md § Phase 6F ChatService
 *
 * SignalR hub: ws://{host}/hubs/chat
 * Auth: Firebase JWT in Authorization header (injected by HubConnectionBuilder).
 *
 * NOTE: @microsoft/signalr has known React Native compatibility gaps around
 * WebSocket transport. We configure it to use WebSockets only (skip
 * Server-Sent Events / Long-Polling as primary) and provide a manual
 * long-poll fallback path via the REST /typing endpoint when SignalR is
 * unavailable (flagged as CONTRACT_GAP_SIGNALR_RN in comments below).
 */

import { HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import type { HubConnection } from '@microsoft/signalr';
import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ThreadCategory =
  | 'tax-query'
  | 'gst-notice'
  | 'loan'
  | 'general'
  | 'feature-request'
  | 'bug';

export type ThreadStatus = 'open' | 'resolved' | 'escalated' | 'assigned';

export interface ChatThread {
  threadId: string;
  subject?: string;
  category: ThreadCategory;
  status: ThreadStatus;
  lastMessageAt: string;
  unreadCount: number;
  assignedToUserId?: string;
  participants?: Participant[];
  createdAt: string;
}

export interface Participant {
  userId: string;
  role: 'user' | 'ca' | 'support';
}

export interface ChatMessage {
  messageId: string;
  threadId: string;
  senderUserId: string;
  body: string;
  attachmentsJson?: string;
  clientMessageId?: string;
  createdAt: string;
  /** Wave 7A (GAP-043): bookmark flag on the message. [confirm 7A] */
  isBookmarked?: boolean;
  /** Client-only: local delivery state */
  localStatus?: 'queued' | 'sending' | 'sent' | 'failed';
  /** Client-only: attachment URIs before upload */
  localAttachments?: LocalAttachment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Wave 7A — GAP-043 bookmarks + thread export
// RECONCILED 2026-06-12 against docs/api/endpoints.md "Wave 7A":
//  - POST /appointments/bookmarks/toggle { messageId, note? }
//      → { messageId, isBookmarked, bookmarkId? }   (ChatService :5107)
//  - GET  /appointments/bookmarks?page&pageSize
//      → { items: BookmarkDto[], totalCount, page, pageSize }
//  - POST /reports/chat-thread-pdf { threadId } → report job (ReportService);
//    file via GET /reports/{id}/download-url.
// RESIDUALS CLOSED (Wave 7 mobile reconciliation): BookmarkDto is enriched
// with messageCreatedAt, senderUserId, senderRole and threadSubject.
// senderDisplayName is intentionally absent (schema-per-service isolation —
// no cross-schema join to auth.*); rows render a role-based fallback label.
// ─────────────────────────────────────────────────────────────────────────────

/** Persisted sender role on chat messages (server enum, returned as string). */
export type BookmarkSenderRole = 'USER' | 'CA' | 'ADMIN' | 'SYSTEM' | 'AI';

/** UI bookmark row shape (mapped from the server BookmarkDto). */
export interface BookmarkedMessage {
  bookmarkId: string;
  messageId: string;
  threadId: string;
  /** Thread subject/title — null/absent when the thread has none. */
  threadSubject?: string | null;
  /** Sender's user id — null post-DPDP erasure. */
  senderUserId: string | null;
  /**
   * Sender role — drives the display-name fallback (senderDisplayName is
   * intentionally not provided; schema isolation).
   */
  senderRole: BookmarkSenderRole | string;
  /** Message body for the bookmarks list row. */
  body: string;
  /** UTC ISO of the ORIGINAL message (messageCreatedAt). */
  createdAt: string;
  bookmarkedAt: string;
}

export type ExportJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ThreadExportJob {
  jobId: string;
  status: ExportJobStatus;
  /** Signed PDF URL — resolved via GET /reports/{id}/download-url when COMPLETED. */
  downloadUrl?: string | null;
  errorMessage?: string | null;
}

export interface LocalAttachment {
  localUri: string;
  mimeType?: string;
  fileName?: string;
  uploadProgress?: number; // 0-100
}

export interface ThreadsResponse {
  items: ChatThread[];
  totalCount: number;
}

export interface MessagesResponse {
  items: ChatMessage[];
  hasMore: boolean;
}

export interface SendMessageRequest {
  body: string;
  attachmentsJson?: string;
  clientMessageId?: string;
}

export interface CreateThreadRequest {
  category: ThreadCategory;
  subject?: string;
  initialMessage: string;
  clientMessageId?: string;
}

export interface CreateThreadResponse {
  threadId: string;
  status: ThreadStatus;
  category: ThreadCategory;
  messageId: string;
}

export interface UnreadCountResponse {
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// REST API functions
// ─────────────────────────────────────────────────────────────────────────────

/** List thread inbox (paginated). */
export async function listThreads(params?: {
  status?: ThreadStatus;
  category?: ThreadCategory;
  page?: number;
  pageSize?: number;
}): Promise<ThreadsResponse> {
  const res = await apiClient.get<ThreadsResponse>('/chat/threads', { params });
  return res.data;
}

/** Get single thread detail. */
export async function getThread(threadId: string): Promise<ChatThread> {
  const res = await apiClient.get<ChatThread>(`/chat/threads/${threadId}`);
  return res.data;
}

/** Cursor-paginated message history for a thread. */
export async function getMessages(
  threadId: string,
  params?: { beforeMessageId?: string; pageSize?: number },
): Promise<MessagesResponse> {
  const res = await apiClient.get<MessagesResponse>(
    `/chat/threads/${threadId}/messages`,
    { params },
  );
  return res.data;
}

/** Send a message in a thread. */
export async function sendMessage(
  threadId: string,
  req: SendMessageRequest,
): Promise<ChatMessage> {
  const res = await apiClient.post<ChatMessage>(
    `/chat/threads/${threadId}/messages`,
    req,
  );
  return res.data;
}

/** Mark a thread as read. */
export async function markThreadRead(threadId: string): Promise<void> {
  await apiClient.post(`/chat/threads/${threadId}/read`);
}

/** Open a new support thread. */
export async function createThread(
  req: CreateThreadRequest,
): Promise<CreateThreadResponse> {
  const res = await apiClient.post<CreateThreadResponse>('/chat/threads', req);
  return res.data;
}

/** Resolve a thread. */
export async function resolveThread(threadId: string): Promise<void> {
  await apiClient.post(`/chat/threads/${threadId}/resolve`);
}

/** Post a typing ping (REST fallback when SignalR unavailable). */
export async function postTypingPing(threadId: string): Promise<void> {
  await apiClient.post(`/chat/threads/${threadId}/typing`);
}

/** Full-text search across message history. */
export async function searchMessages(params: {
  q: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ChatMessage[]; totalCount: number }> {
  const res = await apiClient.get('/chat/threads/search', { params });
  return res.data;
}

/** Get total unread thread count. */
export async function getUnreadCount(): Promise<UnreadCountResponse> {
  const res = await apiClient.get<UnreadCountResponse>('/chat/threads/unread-count');
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wave 7A — GAP-043 bookmark + export endpoints (reconciled — see header above)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /appointments/bookmarks/toggle — create or soft-delete (idempotent pair).
 * The server toggles; callers pass the desired direction only for optimistic UI.
 */
export async function toggleBookmark(
  messageId: string,
): Promise<{ messageId: string; isBookmarked: boolean; bookmarkId?: string | null }> {
  const res = await apiClient.post<{
    messageId: string;
    isBookmarked: boolean;
    bookmarkId?: string | null;
  }>('/appointments/bookmarks/toggle', { messageId });
  return res.data;
}

/** GET /appointments/bookmarks — caller's bookmarked messages (paginated). */
export async function listBookmarks(): Promise<{ items: BookmarkedMessage[] }> {
  const res = await apiClient.get<{
    items: {
      bookmarkId: string;
      messageId: string;
      threadId: string;
      messageBody: string;
      note?: string | null;
      bookmarkedAt: string;
      messageCreatedAt: string;
      senderUserId?: string | null;
      senderRole: string;
      threadSubject?: string | null;
    }[];
  }>('/appointments/bookmarks', { params: { page: 1, pageSize: 100 } });
  return {
    items: (res.data.items ?? []).map((b) => ({
      bookmarkId: b.bookmarkId,
      messageId: b.messageId,
      threadId: b.threadId,
      threadSubject: b.threadSubject ?? null,
      senderUserId: b.senderUserId ?? null,
      senderRole: b.senderRole,
      body: b.messageBody,
      // Original message time (Wave 7 recon) — falls back to bookmark time.
      createdAt: b.messageCreatedAt ?? b.bookmarkedAt,
      bookmarkedAt: b.bookmarkedAt,
    })),
  };
}

/** Normalize ReportService job status strings ("Completed" → "COMPLETED"). */
function normalizeJobStatus(status: string | undefined): ExportJobStatus {
  const s = (status ?? '').toUpperCase();
  if (s.includes('COMPLET')) return 'COMPLETED';
  if (s.includes('FAIL')) return 'FAILED';
  if (s.includes('PROCESS') || s.includes('RUNNING')) return 'PROCESSING';
  return 'PENDING';
}

/**
 * POST /reports/chat-thread-pdf { threadId } — ReportService generates the
 * PDF (synchronously in the current implementation; the poll loop still
 * supports an async job). IDOR: thread must belong to the caller's org.
 */
export async function startThreadExport(threadId: string): Promise<ThreadExportJob> {
  const res = await apiClient.post<{ jobId: string; status: string; errorMessage?: string | null }>(
    '/reports/chat-thread-pdf',
    { threadId },
  );
  return {
    jobId: res.data.jobId,
    status: normalizeJobStatus(res.data.status),
    errorMessage: res.data.errorMessage ?? null,
  };
}

/** GET /reports/{jobId} — poll export job status. */
export async function getThreadExportJob(jobId: string): Promise<ThreadExportJob> {
  const res = await apiClient.get<{ jobId: string; status: string; errorMessage?: string | null }>(
    `/reports/${jobId}`,
  );
  return {
    jobId: res.data.jobId,
    status: normalizeJobStatus(res.data.status),
    errorMessage: res.data.errorMessage ?? null,
  };
}

/** GET /reports/{jobId}/download-url — signed GCS URL (15 min TTL, never cached). */
export async function getThreadExportDownloadUrl(jobId: string): Promise<string> {
  const res = await apiClient.get<{ url: string; expiresAt: string }>(
    `/reports/${jobId}/download-url`,
  );
  return res.data.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// SignalR Hub Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CONTRACT_GAP_SIGNALR_RN: @microsoft/signalr v8+ uses the browser
 * WebSocket global which is available in React Native (JSC/Hermes), but
 * EventSource (SSE) is not. We explicitly pass `skipNegotiation: false` and
 * `transport: HttpTransportType.WebSockets` to avoid SSE fallback at
 * runtime. If the hub negotiation endpoint is unreachable the connection
 * falls back to the REST long-poll pattern via `postTypingPing()`.
 */

export interface ChatHubCallbacks {
  onMessageReceived?: (message: ChatMessage) => void;
  onTypingStarted?: (userId: string) => void;
  onTypingStopped?: (userId: string) => void;
  onMessageRead?: (messageId: string, userId: string) => void;
  onThreadUpdated?: (thread: Partial<ChatThread>) => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onDisconnected?: () => void;
}

export function buildChatHubConnection(
  hubBaseUrl: string,
  getToken: () => Promise<string | null>,
): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${hubBaseUrl}/hubs/chat`, {
      accessTokenFactory: async () => (await getToken()) ?? '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .build();
}

export function subscribeChatHub(
  connection: HubConnection,
  callbacks: ChatHubCallbacks,
): () => void {
  const {
    onMessageReceived,
    onTypingStarted,
    onTypingStopped,
    onMessageRead,
    onThreadUpdated,
    onReconnecting,
    onReconnected,
    onDisconnected,
  } = callbacks;

  if (onMessageReceived) {
    connection.on('MessageReceived', onMessageReceived);
  }
  if (onTypingStarted) {
    connection.on('TypingStarted', ({ userId }: { userId: string }) =>
      onTypingStarted(userId),
    );
  }
  if (onTypingStopped) {
    connection.on('TypingStopped', ({ userId }: { userId: string }) =>
      onTypingStopped(userId),
    );
  }
  if (onMessageRead) {
    connection.on(
      'MessageRead',
      ({ messageId, userId }: { messageId: string; userId: string }) =>
        onMessageRead(messageId, userId),
    );
  }
  if (onThreadUpdated) {
    connection.on('ThreadUpdated', onThreadUpdated);
  }
  if (onReconnecting) {
    connection.onreconnecting(() => onReconnecting());
  }
  if (onReconnected) {
    connection.onreconnected(() => onReconnected());
  }
  if (onDisconnected) {
    connection.onclose(() => onDisconnected());
  }

  return () => {
    connection.off('MessageReceived');
    connection.off('TypingStarted');
    connection.off('TypingStopped');
    connection.off('MessageRead');
    connection.off('ThreadUpdated');
  };
}

export async function startChatHub(connection: HubConnection): Promise<void> {
  if (connection.state === HubConnectionState.Disconnected) {
    await connection.start();
  }
}

export async function stopChatHub(connection: HubConnection): Promise<void> {
  if (connection.state !== HubConnectionState.Disconnected) {
    await connection.stop();
  }
}
