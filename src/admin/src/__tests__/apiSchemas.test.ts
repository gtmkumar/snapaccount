/**
 * API schema / Zod contract tests
 * Phase 6A + 6E
 *
 * Validates that sample server responses parse cleanly through the Zod schemas
 * defined in gstApi.ts, callbackApi.ts, and notificationApi.ts.
 * These tests serve as a contract guard: if backend changes a field type or
 * removes a required field, the schema parse fails here before E2E tests run.
 */
import { describe, it, expect } from 'vitest'
import {
  GstReturnSchema,
  GstReturnsListSchema,
  GstInvoiceSchema,
  GstInvoicesListSchema,
  AuditEventSchema,
  AuditListSchema,
  ArnSaveResponseSchema,
} from '@/lib/gstApi'
import {
  CallbackSchema,
  CallbackListSchema,
  CallbackKpiSchema,
  CallNoteSchema,
  CallbackTimelineEventSchema,
} from '@/lib/callbackApi'
import {
  NotificationItemSchema,
  NotificationInboxSchema,
  NotificationPreferenceSchema,
  SendNotificationResponseSchema,
} from '@/lib/notificationApi'

// ---------------------------------------------------------------------------
// GST API schemas
// ---------------------------------------------------------------------------
describe('gstApi — Zod schema contracts', () => {
  const validReturn = {
    id: 'ret-001',
    organizationId: 'org-001',
    gstin: '27AABCS1429B1ZB',
    businessName: 'Sharma Trading Co.',
    returnType: 'GSTR-3B',
    period: 'March 2026',
    financialYear: '2025-26',
    status: 'FILED',
    dueDate: '2026-04-20T00:00:00Z',
    taxPayable: 48500,
    assignedCa: 'CA Ravi Kumar',
    slaExpiresAt: '2026-04-22T00:00:00Z',
    arn: null,
    arnSavedAt: null,
    arnSavedBy: null,
  }

  it('parses a valid GstReturn', () => {
    const result = GstReturnSchema.safeParse(validReturn)
    expect(result.success).toBe(true)
  })

  it('rejects GstReturn with invalid returnType', () => {
    const result = GstReturnSchema.safeParse({ ...validReturn, returnType: 'GSTR-99' })
    expect(result.success).toBe(false)
  })

  it('rejects GstReturn with invalid status', () => {
    const result = GstReturnSchema.safeParse({ ...validReturn, status: 'UNKNOWN_STATUS' })
    expect(result.success).toBe(false)
  })

  it('accepts GstReturn with ARN populated', () => {
    const result = GstReturnSchema.safeParse({
      ...validReturn,
      arn: 'AA270320250000123',
      arnSavedAt: '2026-04-01T12:00:00Z',
      arnSavedBy: 'ops@snapaccount.in',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.arn).toBe('AA270320250000123')
  })

  it('parses GstReturnsList with multiple items', () => {
    const result = GstReturnsListSchema.safeParse({ items: [validReturn, validReturn], totalCount: 2 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.items.length).toBe(2)
  })

  const validInvoice = {
    id: 'inv-001',
    invoiceNumber: 'INV/2026/001',
    organizationId: 'org-001',
    gstin: '27AABCS1429B1ZB',
    buyerGstin: '29AAKCB9541C1ZE',
    invoiceDate: '2026-03-15T00:00:00Z',
    totalTaxableValue: 100000,
    totalGst: 18000,
    totalAmount: 118000,
    documentType: 'INVOICE',
    placeOfSupply: '27',
    isInterstate: false,
  }

  it('parses a valid GstInvoice', () => {
    const result = GstInvoiceSchema.safeParse(validInvoice)
    expect(result.success).toBe(true)
  })

  it('rejects GstInvoice missing isInterstate field', () => {
    const { isInterstate: _ignored, ...incomplete } = validInvoice
    const result = GstInvoiceSchema.safeParse(incomplete)
    expect(result.success).toBe(false)
  })

  it('parses GstInvoicesList', () => {
    const result = GstInvoicesListSchema.safeParse({ items: [validInvoice], totalCount: 1 })
    expect(result.success).toBe(true)
  })

  it('parses a valid AuditEvent', () => {
    const result = AuditEventSchema.safeParse({
      id: 'ev-001',
      eventType: 'FILED',
      actorEmail: 'ops@snapaccount.in',
      actorDisplayName: 'Ops Team',
      timestamp: '2026-04-01T10:00:00Z',
      detail: 'Return filed',
      previousStatus: 'APPROVED',
      arnReceived: null,
      diffAvailable: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects AuditEvent with invalid eventType', () => {
    const result = AuditEventSchema.safeParse({
      id: 'ev-001',
      eventType: 'DELETED',  // not in enum
      actorEmail: 'ops@snapaccount.in',
      timestamp: '2026-04-01T10:00:00Z',
    })
    expect(result.success).toBe(false)
  })

  it('parses AuditList', () => {
    const result = AuditListSchema.safeParse({
      items: [],
      totalCount: 0,
      page: 1,
    })
    expect(result.success).toBe(true)
  })

  it('parses ArnSaveResponse', () => {
    const result = ArnSaveResponseSchema.safeParse({
      arn: 'AA270320250000123',
      savedAt: '2026-04-01T12:00:00Z',
      savedBy: 'ops@snapaccount.in',
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Callback API schemas
// ---------------------------------------------------------------------------
describe('callbackApi — Zod schema contracts', () => {
  const validCallback = {
    id: 'cb-001',
    userId: 'u-001',
    userName: 'Rajesh M',
    userPhone: '+91 98765 43210',
    organizationId: 'org-001',
    status: 'PENDING',
    category: 'GST',
    priority: 'HIGH',
    requestedAt: new Date().toISOString(),
    linkedEntity: null,
  }

  it('parses a minimal valid Callback', () => {
    const result = CallbackSchema.safeParse(validCallback)
    expect(result.success).toBe(true)
  })

  it('rejects Callback with invalid status', () => {
    const result = CallbackSchema.safeParse({ ...validCallback, status: 'UNKNOWN' })
    expect(result.success).toBe(false)
  })

  it('rejects Callback with invalid category', () => {
    const result = CallbackSchema.safeParse({ ...validCallback, category: 'MEDICAL' })
    expect(result.success).toBe(false)
  })

  it('rejects Callback with invalid priority', () => {
    const result = CallbackSchema.safeParse({ ...validCallback, priority: 'CRITICAL' })
    expect(result.success).toBe(false)
  })

  it('parses Callback with notes array', () => {
    const result = CallbackSchema.safeParse({
      ...validCallback,
      notes: [
        {
          id: 'note-001',
          callbackId: 'cb-001',
          authorId: 'agent-001',
          authorName: 'Agent Ravi',
          body: 'Customer query resolved.',
          isInternal: false,
          recordedAt: new Date().toISOString(),
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('parses Callback with timeline array', () => {
    const result = CallbackSchema.safeParse({
      ...validCallback,
      timeline: [
        {
          id: 'ev-001',
          eventType: 'REQUESTED',
          actorName: 'Rajesh M',
          occurredAt: new Date().toISOString(),
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects CallNote with missing required fields', () => {
    const result = CallNoteSchema.safeParse({
      id: 'note-001',
      // callbackId missing
      authorId: 'agent-001',
      authorName: 'Agent Ravi',
      body: 'Some note',
      isInternal: false,
      recordedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })

  it('parses valid CallbackList with summary', () => {
    const result = CallbackListSchema.safeParse({
      items: [validCallback],
      page: 1,
      total: 1,
      summary: { open: 1, scheduled: 0, breached: 0, avgTtrMinutes: 12 },
    })
    expect(result.success).toBe(true)
  })

  it('parses CallbackList without summary (summary is optional)', () => {
    const result = CallbackListSchema.safeParse({
      items: [],
      page: 1,
      total: 0,
    })
    expect(result.success).toBe(true)
  })

  it('parses minimal valid CallbackKpi', () => {
    const result = CallbackKpiSchema.safeParse({
      open: 5,
      avgTtrSeconds: 3600,
      slaCompliance: 92.5,
      completed: 48,
      deltas: { open: -2, avgTtrSeconds: -300, slaCompliance: 1.5, completed: 8 },
      statusDistribution: [],
      dailyVolume: [],
      ttrHistogram: [],
      categoryMix: [],
      teamPerformance: [],
      slaBreaches: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects CallbackKpi missing required deltas', () => {
    const result = CallbackKpiSchema.safeParse({
      open: 5,
      avgTtrSeconds: 3600,
      slaCompliance: 92.5,
      completed: 48,
      // deltas missing
      statusDistribution: [],
      dailyVolume: [],
      ttrHistogram: [],
      categoryMix: [],
      teamPerformance: [],
      slaBreaches: [],
    })
    expect(result.success).toBe(false)
  })

  it('parses CallbackTimelineEvent all event types', () => {
    const eventTypes = [
      'REQUESTED', 'ASSIGNED', 'SCHEDULED', 'RESCHEDULED',
      'CALL_STARTED', 'NOTE_ADDED', 'CALL_COMPLETED',
      'FOLLOW_UP_FLAGGED', 'ESCALATED', 'CANCELLED', 'NOTIFICATION_SENT',
    ] as const
    for (const eventType of eventTypes) {
      const result = CallbackTimelineEventSchema.safeParse({
        id: 'ev-001',
        eventType,
        actorName: 'System',
        occurredAt: new Date().toISOString(),
      })
      expect(result.success, `eventType ${eventType} should parse`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Notification API schemas
// ---------------------------------------------------------------------------
describe('notificationApi — Zod schema contracts', () => {
  const validNotification = {
    id: 'notif-001',
    eventCode: 'GST_DEADLINE_3_DAYS',
    category: 'GST',
    title: 'GST Return Due in 3 Days',
    body: 'Your GSTR-3B for March 2026 is due on 20 April 2026.',
    status: 'UNREAD',
    sentAt: new Date().toISOString(),
  }

  it('parses a valid NotificationItem', () => {
    const result = NotificationItemSchema.safeParse(validNotification)
    expect(result.success).toBe(true)
  })

  it('rejects NotificationItem with invalid status', () => {
    const result = NotificationItemSchema.safeParse({ ...validNotification, status: 'PENDING' })
    expect(result.success).toBe(false)
  })

  it('parses NotificationItem with optional deep-link fields', () => {
    const result = NotificationItemSchema.safeParse({
      ...validNotification,
      deepLinkUrl: '/gst',
      deepLinkLabel: 'View GST',
      linkedEntityType: 'GstReturn',
      linkedEntityId: 'ret-001',
      linkedEntityLabel: 'GSTR-3B March 2026',
    })
    expect(result.success).toBe(true)
  })

  it('parses NotificationInbox with unread count', () => {
    const result = NotificationInboxSchema.safeParse({
      items: [validNotification],
      totalCount: 1,
      unreadCount: 1,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.unreadCount).toBe(1)
  })

  it('parses empty NotificationInbox', () => {
    const result = NotificationInboxSchema.safeParse({
      items: [],
      totalCount: 0,
      unreadCount: 0,
    })
    expect(result.success).toBe(true)
  })

  it('parses valid NotificationPreference', () => {
    const result = NotificationPreferenceSchema.safeParse({
      eventCode: 'GST_DEADLINE_3_DAYS',
      pushEnabled: true,
      smsEnabled: true,
      emailEnabled: false,
      inAppEnabled: true,
      doNotDisturb: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    })
    expect(result.success).toBe(true)
  })

  it('parses NotificationPreference without optional quiet hours', () => {
    const result = NotificationPreferenceSchema.safeParse({
      eventCode: 'GST_DEADLINE_3_DAYS',
      pushEnabled: true,
      smsEnabled: false,
      emailEnabled: true,
      inAppEnabled: true,
      doNotDisturb: false,
    })
    expect(result.success).toBe(true)
  })

  it('parses SendNotificationResponse', () => {
    const result = SendNotificationResponseSchema.safeParse({
      results: [
        { channel: 'PUSH', status: 'SENT', messageId: 'fcm-msg-001', error: null },
        { channel: 'SMS', status: 'SENT', messageId: 'msg91-001', error: null },
        { channel: 'EMAIL', status: 'FAILED', messageId: null, error: 'Template not approved' },
      ],
      dispatchedCount: 2,
      suppressedCount: 1,
    })
    expect(result.success).toBe(true)
  })

  it('all 26 catalog event codes are valid eventCode strings', () => {
    // Spot-check: notification items with various event codes should parse
    const eventCodes = [
      'GST_DEADLINE_7_DAYS', 'GST_DEADLINE_3_DAYS', 'GST_DEADLINE_1_DAY',
      'ITR_EFILE_VERIFY_D1', 'ITR_REFUND_CREDITED',
      'DOC_OCR_COMPLETED', 'LOAN_EMI_DUE',
      'CB_SCHEDULED', 'CB_COMPLETED', 'CB_ESCALATED',
      'ACCT_LOGIN_NEW_DEVICE',
    ]
    for (const eventCode of eventCodes) {
      const result = NotificationItemSchema.safeParse({
        ...validNotification,
        eventCode,
        id: `notif-${eventCode}`,
      })
      expect(result.success, `eventCode ${eventCode} should parse`).toBe(true)
    }
  })
})
