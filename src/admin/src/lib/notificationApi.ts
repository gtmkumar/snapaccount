/**
 * Notification Service API client
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const NotificationCategory = z.enum([
  'GST',
  'ITR',
  'DOCS',
  'LOAN',
  'CALLBACK',
  'BILLING',
  'SYSTEM',
])
export type NotificationCategory = z.infer<typeof NotificationCategory>

export const NotificationStatusEnum = z.enum(['READ', 'UNREAD'])
export type NotificationStatusEnum = z.infer<typeof NotificationStatusEnum>

export const NotificationItemSchema = z.object({
  id: z.string(),
  eventCode: z.string(),
  category: NotificationCategory.optional(),
  title: z.string(),
  body: z.string(),
  status: NotificationStatusEnum,
  sentAt: z.string(),
  deepLinkUrl: z.string().nullable().optional(),
  deepLinkLabel: z.string().nullable().optional(),
  linkedEntityType: z.string().nullable().optional(),
  linkedEntityId: z.string().nullable().optional(),
  linkedEntityLabel: z.string().nullable().optional(),
})
export type NotificationItem = z.infer<typeof NotificationItemSchema>

export const NotificationInboxSchema = z.object({
  items: z.array(NotificationItemSchema),
  totalCount: z.number(),
  unreadCount: z.number(),
})
export type NotificationInbox = z.infer<typeof NotificationInboxSchema>

export const NotificationPreferenceSchema = z.object({
  eventCode: z.string(),
  pushEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
  doNotDisturb: z.boolean(),
})
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>

export const SendNotificationRequestSchema = z.object({
  userId: z.string(),
  eventCode: z.string(),
  locale: z.string().default('en'),
  variables: z.record(z.string(), z.unknown()).optional(),
  recipientEmail: z.string().optional(),
  recipientPhone: z.string().optional(),
})
export type SendNotificationRequest = z.infer<typeof SendNotificationRequestSchema>

export const SendNotificationResponseSchema = z.object({
  results: z.array(z.object({
    channel: z.string(),
    status: z.string(),
    messageId: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
  })),
  dispatchedCount: z.number(),
  suppressedCount: z.number(),
})

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export interface GetInboxParams {
  page?: number
  pageSize?: number
  category?: NotificationCategory
  unreadOnly?: boolean
}

export async function getNotificationInbox(params: GetInboxParams = {}) {
  const res = await api.get('/notifications/inbox', { params })
  return NotificationInboxSchema.parse(res.data)
}

export async function markNotificationRead(id: string) {
  await api.post(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead() {
  await api.post('/notifications/read-all')
}

export async function getNotificationPreferences() {
  const res = await api.get('/notifications/preferences')
  return z.object({ items: z.array(NotificationPreferenceSchema) }).parse(res.data)
}

export async function updateNotificationPreference(pref: {
  eventCode: string
  pushEnabled: boolean
  smsEnabled: boolean
  emailEnabled: boolean
  inAppEnabled: boolean
  doNotDisturb: boolean
  quietHoursStart?: string
  quietHoursEnd?: string
}) {
  await api.put('/notifications/preferences', pref)
}

export async function registerPushToken(deviceId: string, token: string, platform: 'ios' | 'android') {
  await api.post('/notifications/push-tokens', { deviceId, token, platform })
}

export async function sendNotification(req: SendNotificationRequest) {
  const res = await api.post('/notifications/send', req)
  return SendNotificationResponseSchema.parse(res.data)
}

export interface GetDlqParams {
  includeResolved?: boolean
  page?: number
  pageSize?: number
}

export async function getNotificationDlq(params: GetDlqParams = {}) {
  const res = await api.get('/notifications/dlq', { params })
  return res.data as { items: unknown[]; totalCount: number }
}

export async function retryDlqItem(id: string) {
  await api.post(`/notifications/dlq/${id}/retry`)
}
