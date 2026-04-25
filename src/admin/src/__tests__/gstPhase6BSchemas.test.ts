/**
 * gstApi Phase 6B Zod schema contract tests
 *
 * Validates new schemas added in Phase 6B:
 * GstNoticeSchema, IrnStatusSchema, EwbStatusSchema,
 * HsnSacCodeSchema, NoticesDueWidgetDataSchema
 */
import { describe, it, expect } from 'vitest'
import {
  GstNoticeSchema,
  GstNoticeStatusSchema,
  GstNoticeTypeSchema,
  GstNoticeAttachmentSchema,
  IrnStatusSchema,
  EwbStatusSchema,
  HsnSacCodeSchema,
  NoticesDueWidgetDataSchema,
} from '@/lib/gstApi'

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------
describe('gstApi Phase 6B — enum schemas', () => {
  it('GstNoticeStatusSchema accepts all valid statuses', () => {
    for (const s of ['RECEIVED', 'UNDER_REVIEW', 'RESPONDED', 'CLOSED']) {
      expect(() => GstNoticeStatusSchema.parse(s)).not.toThrow()
    }
  })

  it('GstNoticeStatusSchema rejects invalid status', () => {
    expect(() => GstNoticeStatusSchema.parse('PENDING')).toThrow()
  })

  it('GstNoticeTypeSchema accepts known notice types', () => {
    for (const t of ['ASMT-10', 'ASMT-11', 'DRC-01', 'DRC-03', 'REG-17', 'OTHER']) {
      expect(() => GstNoticeTypeSchema.parse(t)).not.toThrow()
    }
  })

  it('GstNoticeTypeSchema rejects unknown type', () => {
    expect(() => GstNoticeTypeSchema.parse('SCN')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// GstNoticeAttachmentSchema
// ---------------------------------------------------------------------------
describe('gstApi Phase 6B — GstNoticeAttachmentSchema', () => {
  const valid = {
    id: 'att-001',
    fileName: 'notice.pdf',
    fileSizeBytes: 204800,
    gcsUri: 'gs://bucket/notice.pdf',
    uploadedAt: '2026-04-20T10:00:00Z',
    uploadedBy: 'agent-001',
  }

  it('parses valid attachment', () => {
    expect(() => GstNoticeAttachmentSchema.parse(valid)).not.toThrow()
  })

  it('allows optional signedUrl to be absent', () => {
    const { signedUrl: _, ...rest } = { ...valid, signedUrl: 'https://signed.url' }
    expect(() => GstNoticeAttachmentSchema.parse(rest)).not.toThrow()
  })

  it('rejects missing fileName', () => {
    const { fileName: _, ...rest } = valid
    expect(() => GstNoticeAttachmentSchema.parse(rest)).toThrow()
  })

  it('rejects missing gcsUri', () => {
    const { gcsUri: _, ...rest } = valid
    expect(() => GstNoticeAttachmentSchema.parse(rest)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// GstNoticeSchema
// ---------------------------------------------------------------------------
describe('gstApi Phase 6B — GstNoticeSchema', () => {
  const valid = {
    id: 'notice-001',
    organizationId: 'org-001',
    gstin: '27AABCS1429B1ZB',
    noticeNumber: 'ASMT-10-2024-001',
    noticeType: 'ASMT-10',
    noticeDate: '2026-03-01T00:00:00Z',
    dueDate: '2026-04-30T00:00:00Z',
    status: 'RECEIVED',
    description: 'Mismatch in GSTR-3B vs GSTR-1 for March 2024',
    assignedCaId: null,
    assignedCaName: null,
    responseText: null,
    respondedAt: null,
    respondedBy: null,
    submissionChannel: null,
    attachments: [],
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-25T00:00:00Z',
  }

  it('parses valid GST notice', () => {
    expect(() => GstNoticeSchema.parse(valid)).not.toThrow()
  })

  it('parses notice with attachments array', () => {
    const withAttach = {
      ...valid,
      attachments: [{
        id: 'att-001',
        fileName: 'notice.pdf',
        fileSizeBytes: 204800,
        gcsUri: 'gs://bucket/notice.pdf',
        uploadedAt: '2026-04-20T10:00:00Z',
        uploadedBy: 'agent-001',
      }],
    }
    expect(() => GstNoticeSchema.parse(withAttach)).not.toThrow()
  })

  it('rejects invalid noticeType', () => {
    expect(() => GstNoticeSchema.parse({ ...valid, noticeType: 'SCN' })).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() => GstNoticeSchema.parse({ ...valid, status: 'OPEN' })).toThrow()
  })

  it('rejects missing gstin', () => {
    const { gstin: _, ...rest } = valid
    expect(() => GstNoticeSchema.parse(rest)).toThrow()
  })

  it('allows null dueDate', () => {
    expect(() => GstNoticeSchema.parse({ ...valid, dueDate: null })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// IrnStatusSchema
// ---------------------------------------------------------------------------
describe('gstApi Phase 6B — IrnStatusSchema', () => {
  const valid = {
    invoiceId: 'inv-001',
    irnNumber: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
    ackNumber: '12345678901234',
    ackDate: '2026-04-10T10:00:00Z',
    signedQRCode: null,
    status: 'GENERATED',
  }

  it('parses valid IRN status — GENERATED', () => {
    expect(() => IrnStatusSchema.parse(valid)).not.toThrow()
  })

  it('parses CANCELLED IRN status', () => {
    const cancelled = {
      ...valid,
      status: 'CANCELLED',
      cancelledAt: '2026-04-11T10:00:00Z',
      cancelRemark: 'Incorrect GSTIN',
    }
    expect(() => IrnStatusSchema.parse(cancelled)).not.toThrow()
  })

  it('parses NOT_APPLICABLE status with null fields', () => {
    const notApplicable = {
      invoiceId: 'inv-002',
      irnNumber: null,
      ackNumber: null,
      ackDate: null,
      signedQRCode: null,
      status: 'NOT_APPLICABLE',
    }
    expect(() => IrnStatusSchema.parse(notApplicable)).not.toThrow()
  })

  it('rejects invalid status', () => {
    expect(() => IrnStatusSchema.parse({ ...valid, status: 'FAILED' })).toThrow()
  })

  it('rejects missing invoiceId', () => {
    const { invoiceId: _, ...rest } = valid
    expect(() => IrnStatusSchema.parse(rest)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// EwbStatusSchema
// ---------------------------------------------------------------------------
describe('gstApi Phase 6B — EwbStatusSchema', () => {
  const valid = {
    invoiceId: 'inv-001',
    ewbNumber: '331234567890',
    ewbDate: '2026-04-10T08:00:00Z',
    validUpto: '2026-04-15T23:59:59Z',
    vehicleNo: 'MH01AB1234',
    transportMode: 'ROAD',
    status: 'GENERATED',
  }

  it('parses valid EWB status — GENERATED', () => {
    expect(() => EwbStatusSchema.parse(valid)).not.toThrow()
  })

  it('parses EXPIRED EWB status', () => {
    const expired = { ...valid, status: 'EXPIRED' }
    expect(() => EwbStatusSchema.parse(expired)).not.toThrow()
  })

  it('parses NOT_REQUIRED status with null fields', () => {
    const notRequired = {
      invoiceId: 'inv-003',
      ewbNumber: null,
      ewbDate: null,
      validUpto: null,
      status: 'NOT_REQUIRED',
    }
    expect(() => EwbStatusSchema.parse(notRequired)).not.toThrow()
  })

  it('rejects invalid status', () => {
    expect(() => EwbStatusSchema.parse({ ...valid, status: 'ACTIVE' })).toThrow()
  })

  it('rejects missing invoiceId', () => {
    const { invoiceId: _, ...rest } = valid
    expect(() => EwbStatusSchema.parse(rest)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// HsnSacCodeSchema
// ---------------------------------------------------------------------------
describe('gstApi Phase 6B — HsnSacCodeSchema', () => {
  const valid = {
    code: '1001',
    description: 'Durum wheat',
    type: 'HSN',
    gstRate: 0,
  }

  it('parses valid HSN code', () => {
    expect(() => HsnSacCodeSchema.parse(valid)).not.toThrow()
  })

  it('parses SAC code', () => {
    const sac = {
      code: '9954',
      description: 'Construction services',
      type: 'SAC',
      gstRate: 18,
    }
    expect(() => HsnSacCodeSchema.parse(sac)).not.toThrow()
  })

  it('rejects invalid type', () => {
    expect(() => HsnSacCodeSchema.parse({ ...valid, type: 'TARIFF' })).toThrow()
  })

  it('rejects missing gstRate', () => {
    const { gstRate: _, ...rest } = valid
    expect(() => HsnSacCodeSchema.parse(rest)).toThrow()
  })

  it('rejects missing description', () => {
    const { description: _, ...rest } = valid
    expect(() => HsnSacCodeSchema.parse(rest)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// NoticesDueWidgetDataSchema
// ---------------------------------------------------------------------------
describe('gstApi Phase 6B — NoticesDueWidgetDataSchema', () => {
  const valid = {
    overdue: 2,
    dueIn2Days: 1,
    dueThisWeek: 4,
    total: 7,
  }

  it('parses valid widget data', () => {
    expect(() => NoticesDueWidgetDataSchema.parse(valid)).not.toThrow()
  })

  it('parses zero counts', () => {
    expect(() => NoticesDueWidgetDataSchema.parse({ overdue: 0, dueIn2Days: 0, dueThisWeek: 0, total: 0 })).not.toThrow()
  })

  it('rejects non-numeric counts', () => {
    expect(() => NoticesDueWidgetDataSchema.parse({ overdue: 'two', dueIn2Days: 0, dueThisWeek: 0, total: 0 })).toThrow()
  })

  it('rejects missing dueIn2Days', () => {
    const { dueIn2Days: _, ...rest } = valid
    expect(() => NoticesDueWidgetDataSchema.parse(rest)).toThrow()
  })

  it('rejects missing total', () => {
    const { total: _, ...rest } = valid
    expect(() => NoticesDueWidgetDataSchema.parse(rest)).toThrow()
  })
})
