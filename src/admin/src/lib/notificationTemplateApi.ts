/**
 * Notification Template API client — Wave 7 GAP-037
 * Per-event × channel × locale template CRUD (26-event catalog).
 * All calls go through the shared axios instance from lib/api.ts.
 *
 * Backend contract (reconciled from NotificationService.Api/Endpoints/Templates.cs):
 *   GET    /notifications/templates                — list (eventCode?, channel?, locale?, page, pageSize)
 *   GET    /notifications/templates/:id            — get by UUID
 *   POST   /notifications/templates                — create { EventCode, Channel, Locale, Body, Subject?, DltTemplateId?, SenderName? }
 *   PUT    /notifications/templates/:id            — update { Body, Subject?, DltTemplateId?, SenderName? }
 *   DELETE /notifications/templates/:id            — soft-delete
 *   POST   /notifications/templates/:id/test-send  — { Variables?, RecipientEmail?, RecipientPhone? }
 *
 * Channel enum (backend PascalCase): Push | Sms | Email | InApp
 * Field names: eventCode, locale (not eventKey, language)
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Enums & base types — reconciled to backend PascalCase values
// ---------------------------------------------------------------------------

// Backend: NotificationChannel enum Push | Sms | Email | InApp | WhatsApp
export const TemplateChannelSchema = z.enum(['Push', 'Sms', 'Email', 'InApp'])
export type TemplateChannel = z.infer<typeof TemplateChannelSchema>

// UI display label map
export const CHANNEL_LABELS: Record<TemplateChannel, string> = {
  Push: 'Push',
  Sms: 'SMS',
  Email: 'Email',
  InApp: 'In-App',
}

export const TemplateSourceSchema = z.enum(['CUSTOM', 'DEFAULT'])
export type TemplateSource = z.infer<typeof TemplateSourceSchema>

// Category domains (derived from NotificationEventCatalog)
export const TemplateDomainSchema = z.enum([
  'GST',
  'ITR',
  'LOAN',
  'DOCUMENT',
  'SUBSCRIPTION',
  'CALLBACK',
  'ACCOUNT',
])
export type TemplateDomain = z.infer<typeof TemplateDomainSchema>

// ---------------------------------------------------------------------------
// 26-event catalog (from NotificationEventCatalog.cs — static reference)
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  eventCode: string
  eventName: string
  category: string
  defaultChannels: TemplateChannel[]
}

export const EVENT_CATALOG: CatalogEntry[] = [
  // GST (6)
  { eventCode: 'GST_DEADLINE_7_DAYS',    eventName: 'GST Return Due in 7 Days',       category: 'GST',          defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'GST_DEADLINE_3_DAYS',    eventName: 'GST Return Due in 3 Days',       category: 'GST',          defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'GST_DEADLINE_1_DAY',     eventName: 'GST Return Due Tomorrow',        category: 'GST',          defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'GST_RETURN_FILED',       eventName: 'GST Return Filed Successfully',  category: 'GST',          defaultChannels: ['Push', 'Email'] },
  { eventCode: 'GST_ITC_MISMATCH',       eventName: 'ITC Mismatch Detected',          category: 'GST',          defaultChannels: ['Push', 'Email'] },
  { eventCode: 'GST_NOTICE_RECEIVED',    eventName: 'GST Notice Received',            category: 'GST',          defaultChannels: ['Push', 'Sms', 'Email'] },
  // ITR (6)
  { eventCode: 'ITR_EFILE_VERIFY_D1',    eventName: 'E-verify ITR — Day 1',           category: 'ITR',          defaultChannels: ['Push', 'Sms'] },
  { eventCode: 'ITR_EFILE_VERIFY_D7',    eventName: 'E-verify ITR — Day 7',           category: 'ITR',          defaultChannels: ['Push', 'Sms'] },
  { eventCode: 'ITR_EFILE_VERIFY_D15',   eventName: 'E-verify ITR — Day 15',          category: 'ITR',          defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'ITR_EFILE_VERIFY_D25',   eventName: 'E-verify ITR — Day 25',          category: 'ITR',          defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'ITR_EFILE_VERIFY_D29',   eventName: 'E-verify ITR — Day 29 (Last)',   category: 'ITR',          defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'ITR_REFUND_CREDITED',    eventName: 'ITR Refund Credited',            category: 'ITR',          defaultChannels: ['Push', 'Sms', 'Email'] },
  // Document (3)
  { eventCode: 'DOC_OCR_COMPLETED',      eventName: 'Document Processed',             category: 'DOCUMENT',     defaultChannels: ['Push', 'InApp'] },
  { eventCode: 'DOC_OCR_FAILED',         eventName: 'Document Processing Failed',     category: 'DOCUMENT',     defaultChannels: ['Push', 'InApp'] },
  { eventCode: 'DOC_APPROVED',           eventName: 'Document Approved',              category: 'DOCUMENT',     defaultChannels: ['InApp'] },
  // Loan (6)
  { eventCode: 'LOAN_APPLICATION_STATUS',    eventName: 'Loan Application Update',        category: 'LOAN',         defaultChannels: ['Push', 'Email'] },
  { eventCode: 'LOAN_EMI_DUE',               eventName: 'EMI Due Reminder',               category: 'LOAN',         defaultChannels: ['Push', 'Sms'] },
  { eventCode: 'LOAN_EMI_PAID',              eventName: 'EMI Payment Confirmed',          category: 'LOAN',         defaultChannels: ['Push', 'Email'] },
  { eventCode: 'LOAN_DISBURSED',             eventName: 'Loan Disbursed Successfully',    category: 'LOAN',         defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'LOAN_DISBURSEMENT_FAILED',   eventName: 'Loan Disbursement Failed',       category: 'LOAN',         defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'LOAN_DISBURSEMENT_REVERSED', eventName: 'Loan Disbursement Reversed',     category: 'LOAN',         defaultChannels: ['Push', 'Sms', 'Email'] },
  // Subscription (3)
  { eventCode: 'SUB_RENEWAL_7_DAYS',     eventName: 'Subscription Renewal in 7 Days', category: 'SUBSCRIPTION', defaultChannels: ['Push', 'Email'] },
  { eventCode: 'SUB_RENEWAL_3_DAYS',     eventName: 'Subscription Renewal in 3 Days', category: 'SUBSCRIPTION', defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'SUB_RENEWAL_FAILED',     eventName: 'Subscription Renewal Failed',    category: 'SUBSCRIPTION', defaultChannels: ['Push', 'Sms', 'Email'] },
  // Callback (3)
  { eventCode: 'CB_SCHEDULED',           eventName: 'Callback Scheduled',             category: 'CALLBACK',     defaultChannels: ['Push', 'Sms'] },
  { eventCode: 'CB_COMPLETED',           eventName: 'Callback Completed',             category: 'CALLBACK',     defaultChannels: ['Push'] },
  { eventCode: 'CB_ESCALATED',           eventName: 'Callback Escalated',             category: 'CALLBACK',     defaultChannels: ['Push', 'Email'] },
  // Account (2) — eventCode ACCT_LOGIN_NEW_DEVICE maps to the old auth.login.new_device
  { eventCode: 'ACCT_LOGIN_NEW_DEVICE',  eventName: 'New Device Login',               category: 'ACCOUNT',      defaultChannels: ['Push', 'Sms', 'Email'] },
  { eventCode: 'ACCT_PROFILE_UPDATED',   eventName: 'Profile Updated',                category: 'ACCOUNT',      defaultChannels: ['Email'] },
]

// ---------------------------------------------------------------------------
// Variable manifest (per-event) — sample values for preview pane
// ---------------------------------------------------------------------------

export interface TemplateVariable {
  key: string          // e.g. "userName"
  description: string  // human label for the palette chip
  sampleValue: string  // used in the preview pane
}

export const PLACEHOLDER_VARIABLE_MANIFEST: Record<string, TemplateVariable[]> = {
  GST_DEADLINE_7_DAYS: [
    { key: 'returnType', description: 'GST return type', sampleValue: 'GSTR-3B' },
    { key: 'period',     description: 'Filing period',   sampleValue: 'May 2026' },
    { key: 'dueDate',    description: 'Due date',        sampleValue: '20/06/2026' },
    { key: 'gstin',      description: 'GSTIN',           sampleValue: '27AABCS1429B1ZB' },
  ],
  GST_DEADLINE_3_DAYS: [
    { key: 'returnType', description: 'GST return type', sampleValue: 'GSTR-3B' },
    { key: 'period',     description: 'Filing period',   sampleValue: 'May 2026' },
    { key: 'dueDate',    description: 'Due date',        sampleValue: '20/06/2026' },
    { key: 'gstin',      description: 'GSTIN',           sampleValue: '27AABCS1429B1ZB' },
  ],
  GST_DEADLINE_1_DAY: [
    { key: 'returnType', description: 'GST return type', sampleValue: 'GSTR-3B' },
    { key: 'period',     description: 'Filing period',   sampleValue: 'May 2026' },
    { key: 'dueDate',    description: 'Due date',        sampleValue: '20/06/2026' },
    { key: 'gstin',      description: 'GSTIN',           sampleValue: '27AABCS1429B1ZB' },
  ],
  GST_RETURN_FILED: [
    { key: 'returnType', description: 'GST return type',         sampleValue: 'GSTR-3B' },
    { key: 'period',     description: 'Filing period',           sampleValue: 'May 2026' },
    { key: 'ackNumber',  description: 'Acknowledgement number',  sampleValue: 'ARN-NW-2026-001' },
  ],
  GST_ITC_MISMATCH: [
    { key: 'period',      description: 'Mismatch period',       sampleValue: 'May 2026' },
    { key: 'mismatchAmt', description: 'Mismatch amount',       sampleValue: '₹12,450' },
    { key: 'gstin',       description: 'GSTIN',                 sampleValue: '27AABCS1429B1ZB' },
  ],
  GST_NOTICE_RECEIVED: [
    { key: 'noticeNumber', description: 'Notice number',      sampleValue: 'GST/26/ASMT/0931' },
    { key: 'noticeType',   description: 'Notice form type',   sampleValue: 'ASMT-10' },
    { key: 'dueDate',      description: 'Response due date',  sampleValue: '15/07/2026' },
    { key: 'gstin',        description: 'GSTIN',              sampleValue: '27AABCS1429B1ZB' },
  ],
  LOAN_APPLICATION_STATUS: [
    { key: 'applicantName',  description: 'Applicant name',   sampleValue: 'Priya Patel' },
    { key: 'applicationId',  description: 'Application ID',   sampleValue: 'LOAN-2026-00123' },
    { key: 'status',         description: 'New status',        sampleValue: 'Under Review' },
    { key: 'amount',         description: 'Loan amount',       sampleValue: '₹5,00,000' },
  ],
  LOAN_EMI_DUE: [
    { key: 'emiAmount',   description: 'EMI amount',     sampleValue: '₹12,500' },
    { key: 'dueDate',     description: 'Due date',       sampleValue: '05/07/2026' },
    { key: 'loanId',      description: 'Loan ID',        sampleValue: 'LN-2026-0042' },
  ],
  LOAN_DISBURSED: [
    { key: 'amount',        description: 'Disbursed amount', sampleValue: '₹10,00,000' },
    { key: 'accountNumber', description: 'Bank account',     sampleValue: 'XXXX1234' },
    { key: 'loanId',        description: 'Loan ID',          sampleValue: 'LN-2026-0042' },
  ],
  ACCT_LOGIN_NEW_DEVICE: [
    { key: 'userName',    description: 'User display name', sampleValue: 'Rahul Sharma' },
    { key: 'deviceModel', description: 'Device model',      sampleValue: 'Samsung Galaxy S23' },
    { key: 'location',    description: 'Approx. location',  sampleValue: 'Mumbai, Maharashtra' },
    { key: 'time',        description: 'Login time (IST)',   sampleValue: '11/06/2026 14:30 IST' },
  ],
  SUB_RENEWAL_7_DAYS: [
    { key: 'planName',   description: 'Plan name',       sampleValue: 'Growth Plan' },
    { key: 'renewalAmt', description: 'Renewal amount',  sampleValue: '₹1,999' },
    { key: 'renewalDate',description: 'Renewal date',    sampleValue: '18/06/2026' },
  ],
  CB_SCHEDULED: [
    { key: 'agentName',   description: 'Agent name',       sampleValue: 'Vikram Singh' },
    { key: 'scheduledAt', description: 'Callback time',    sampleValue: '11/06/2026 16:00 IST' },
  ],
  // Fallback for any unspecified event
  _default: [
    { key: 'userName',         description: 'User display name',   sampleValue: 'Rahul Sharma' },
    { key: 'organizationName', description: 'Organisation name',   sampleValue: 'Sharma Trading Co.' },
  ],
}

export function getVariablesForEvent(eventCode: string): TemplateVariable[] {
  return PLACEHOLDER_VARIABLE_MANIFEST[eventCode] ?? PLACEHOLDER_VARIABLE_MANIFEST['_default']
}

// ---------------------------------------------------------------------------
// Template schema — reconciled to backend NotificationTemplate entity fields
// ---------------------------------------------------------------------------

export const NotificationTemplateSchema = z.object({
  id: z.string().uuid().optional(),        // absent for DEFAULT rows (no DB record)
  eventCode: z.string(),                   // e.g. "GST_NOTICE_RECEIVED"
  eventName: z.string(),                   // human label
  category: z.string(),                    // "GST" | "ITR" | etc.
  channel: TemplateChannelSchema,          // "Push" | "Sms" | "Email" | "InApp"
  locale: z.string(),                      // "en" | "hi" | "bn"
  source: TemplateSourceSchema,            // "CUSTOM" | "DEFAULT"
  isActive: z.boolean(),
  subject: z.string().nullable().optional(),
  body: z.string(),
  dltTemplateId: z.string().nullable().optional(),
  senderName: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  updatedByEmail: z.string().nullable().optional(),
})
export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>

export const NotificationTemplateListSchema = z.object({
  items: z.array(NotificationTemplateSchema),
  totalCount: z.number(),
})

export const TestSendResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  missingVariables: z.array(z.string()).optional(),
  deliveryId: z.string().optional(),
})
export type TestSendResponse = z.infer<typeof TestSendResponseSchema>

// ---------------------------------------------------------------------------
// Request types — reconciled to backend record DTOs
// ---------------------------------------------------------------------------

export interface ListTemplatesParams {
  eventCode?: string
  channel?: TemplateChannel
  locale?: string
  page?: number
  pageSize?: number
}

export interface CreateTemplateRequest {
  eventCode: string
  channel: TemplateChannel
  locale: string
  subject?: string | null
  body: string
  dltTemplateId?: string | null
  senderName?: string | null
}

export interface UpdateTemplateRequest {
  body: string
  subject?: string | null
  dltTemplateId?: string | null
  senderName?: string | null
  /** Toggle the template active/inactive (CG-11). Omit to leave unchanged. */
  isActive?: boolean
}

export interface TestSendRequest {
  variables?: Record<string, string>
  recipientEmail?: string
  recipientPhone?: string
}

// ---------------------------------------------------------------------------
// API functions — reconciled to backend routing
// ---------------------------------------------------------------------------

/** List all template cells (custom + default fallbacks) */
export async function listNotificationTemplates(params: ListTemplatesParams = {}) {
  const res = await api.get('/notifications/templates', { params })
  return NotificationTemplateListSchema.parse(res.data)
}

/** Get a single template by UUID */
export async function getNotificationTemplate(id: string): Promise<NotificationTemplate> {
  const res = await api.get(`/notifications/templates/${id}`)
  return NotificationTemplateSchema.parse(res.data)
}

/**
 * Create a new custom template override.
 * Backend retires the existing IsCurrent=true template for same event×channel×locale.
 */
export async function createNotificationTemplate(req: CreateTemplateRequest): Promise<NotificationTemplate> {
  const res = await api.post('/notifications/templates', req)
  return NotificationTemplateSchema.parse(res.data)
}

/** Update body/metadata of an existing template in-place */
export async function updateNotificationTemplate(id: string, req: UpdateTemplateRequest): Promise<NotificationTemplate> {
  const res = await api.put(`/notifications/templates/${id}`, req)
  return NotificationTemplateSchema.parse(res.data)
}

/** Soft-delete a custom template (falls back to code default) */
export async function deleteNotificationTemplate(id: string): Promise<void> {
  await api.delete(`/notifications/templates/${id}`)
}

/** Send a test notification via backend — uses saved template body with optional variable overrides */
export async function testSendNotificationTemplate(id: string, req: TestSendRequest = {}): Promise<TestSendResponse> {
  const res = await api.post(`/notifications/templates/${id}/test-send`, req)
  return TestSendResponseSchema.parse(res.data)
}
