/**
 * Chat Service API client — Phase 6F Track F2
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 */
import { z } from 'zod'
import api from './api'

// ── Enums ────────────────────────────────────────────────────────────────────

export const ChatCategorySchema = z.enum([
  'tax-query',
  'gst-notice',
  'loan',
  'general',
  'feature-request',
  'bug',
])
export type ChatCategory = z.infer<typeof ChatCategorySchema>

export const ThreadStatusSchema = z.enum([
  'open',
  'pending-user',
  'resolved',
  'escalated',
])
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>

// ── Schemas ──────────────────────────────────────────────────────────────────

export const ThreadSummarySchema = z.object({
  threadId: z.string(),
  subject: z.string().nullable().optional(),
  category: ChatCategorySchema,
  status: ThreadStatusSchema,
  lastMessageAt: z.string().nullable().optional(),
  unreadCount: z.number(),
  assignedToUserId: z.string().nullable().optional(),
})
export type ThreadSummary = z.infer<typeof ThreadSummarySchema>

export const ThreadDetailSchema = z.object({
  threadId: z.string(),
  subject: z.string().nullable().optional(),
  category: ChatCategorySchema,
  status: ThreadStatusSchema,
  assignedToUserId: z.string().nullable().optional(),
  participants: z.array(z.object({ userId: z.string(), role: z.string() })),
  createdAt: z.string(),
})
export type ThreadDetail = z.infer<typeof ThreadDetailSchema>

export const MessageSchema = z.object({
  messageId: z.string(),
  senderUserId: z.string().nullable().optional(),
  body: z.string(),
  attachmentsJson: z.string().nullable().optional(),
  clientMessageId: z.string().nullable().optional(),
  createdAt: z.string(),
})
export type Message = z.infer<typeof MessageSchema>

export const MessageListSchema = z.object({
  items: z.array(MessageSchema),
  hasMore: z.boolean(),
})

export const ThreadListSchema = z.object({
  items: z.array(ThreadSummarySchema),
  totalCount: z.number(),
})

export const UnreadCountSchema = z.object({ count: z.number() })

// ── Params ───────────────────────────────────────────────────────────────────

export interface ListThreadsParams {
  status?: ThreadStatus
  category?: ChatCategory
  page?: number
  pageSize?: number
}

export interface SendMessageParams {
  body: string
  attachmentsJson?: string
  clientMessageId?: string
}

export interface AssignThreadParams {
  assignedToUserId: string
  role: string
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function listThreads(params?: ListThreadsParams): Promise<{ items: ThreadSummary[]; totalCount: number }> {
  const res = await api.get('/chat/threads', { params })
  return ThreadListSchema.parse(res.data)
}

export async function getThread(threadId: string): Promise<ThreadDetail> {
  const res = await api.get(`/chat/threads/${threadId}`)
  return ThreadDetailSchema.parse(res.data)
}

export async function getMessages(
  threadId: string,
  params?: { beforeMessageId?: string; pageSize?: number }
): Promise<{ items: Message[]; hasMore: boolean }> {
  const res = await api.get(`/chat/threads/${threadId}/messages`, { params })
  return MessageListSchema.parse(res.data)
}

export async function sendMessage(threadId: string, params: SendMessageParams): Promise<Message> {
  const res = await api.post(`/chat/threads/${threadId}/messages`, params)
  return MessageSchema.parse(res.data)
}

export async function markThreadRead(threadId: string): Promise<void> {
  await api.post(`/chat/threads/${threadId}/read`)
}

export async function assignThread(threadId: string, params: AssignThreadParams): Promise<void> {
  await api.post(`/chat/threads/${threadId}/assign`, params)
}

export async function resolveThread(threadId: string): Promise<void> {
  await api.post(`/chat/threads/${threadId}/resolve`)
}

export async function escalateThread(threadId: string): Promise<void> {
  await api.post(`/chat/threads/${threadId}/escalate`)
}

export async function reopenThread(threadId: string): Promise<void> {
  await api.post(`/chat/threads/${threadId}/reopen`)
}

export async function sendTypingPing(threadId: string): Promise<void> {
  await api.post(`/chat/threads/${threadId}/typing`)
}

export async function getUnreadCount(): Promise<number> {
  const res = await api.get('/chat/threads/unread-count')
  return UnreadCountSchema.parse(res.data).count
}

export async function searchMessages(q: string, page = 1, pageSize = 20) {
  const res = await api.get('/chat/threads/search', { params: { q, page, pageSize } })
  return res.data as { items: unknown[]; totalCount: number }
}
