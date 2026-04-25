/**
 * Phase 6C — loanApi.ts Zod schema validation tests.
 * Tests that schemas correctly parse valid payloads and reject invalid ones.
 */
import { describe, it, expect } from 'vitest'
import {
  PartnerBankSchema,
  LoanApplicationSummarySchema,
  ConsentRecordSchema,
  StatusLogEntrySchema,
  BankCommMessageSchema,
  LoanKpiSchema,
  BankCommKpiSchema,
  LoanDocumentSchema,
} from '@/lib/loanApi'

// ---------------------------------------------------------------------------
// PartnerBankSchema — write-only security: no api_config_encrypted in schema
// ---------------------------------------------------------------------------

describe('PartnerBankSchema', () => {
  const validBank = {
    bankId: 'bank-001',
    name: 'HDFC Bank',
    adapterType: 'EMAIL',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
  }

  it('parses a valid partner bank', () => {
    const result = PartnerBankSchema.safeParse(validBank)
    expect(result.success).toBe(true)
  })

  it('accepts optional logoUrl', () => {
    const result = PartnerBankSchema.safeParse({ ...validBank, logoUrl: 'https://example.com/logo.png' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.logoUrl).toBe('https://example.com/logo.png')
  })

  it('accepts optional contactEmail', () => {
    const result = PartnerBankSchema.safeParse({ ...validBank, contactEmail: 'ops@hdfc.com' })
    expect(result.success).toBe(true)
  })

  it('requires bankId', () => {
    const { bankId: _omit, ...rest } = validBank
    const result = PartnerBankSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('requires valid adapterType enum value', () => {
    const result = PartnerBankSchema.safeParse({ ...validBank, adapterType: 'INVALID_TYPE' })
    expect(result.success).toBe(false)
  })

  it('does not expose api_config_encrypted in schema', () => {
    const withSecret = { ...validBank, api_config_encrypted: 'secret-token' }
    const result = PartnerBankSchema.safeParse(withSecret)
    expect(result.success).toBe(true)
    if (result.success) {
      // The field should NOT be present in the parsed output (schema strips it)
      expect('api_config_encrypted' in result.data).toBe(false)
    }
  })

  it('accepts all BankAdapterType values', () => {
    for (const adapterType of ['EMAIL', 'REST', 'OAUTH'] as const) {
      const result = PartnerBankSchema.safeParse({ ...validBank, adapterType })
      expect(result.success).toBe(true)
    }
  })

  it('accepts all health status values', () => {
    for (const status of ['healthy', 'degraded', 'down', 'inactive']) {
      const result = PartnerBankSchema.safeParse({ ...validBank, healthStatus: status })
      expect(result.success).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// LoanApplicationSummarySchema
// ---------------------------------------------------------------------------

describe('LoanApplicationSummarySchema', () => {
  const validSummary = {
    applicationId: 'app-001',
    orgId: 'org-001',
    status: 'SUBMITTED',
    requestedAmount: 1000000,
    tenureMonths: 36,
  }

  it('parses a minimal valid summary', () => {
    const result = LoanApplicationSummarySchema.safeParse(validSummary)
    expect(result.success).toBe(true)
  })

  it('requires applicationId', () => {
    const { applicationId: _omit, ...rest } = validSummary
    const result = LoanApplicationSummarySchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('validates all valid status values', () => {
    const statuses = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DOCS_REQUESTED', 'APPROVED', 'REJECTED', 'DISBURSED', 'CLOSED']
    for (const status of statuses) {
      const result = LoanApplicationSummarySchema.safeParse({ ...validSummary, status })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = LoanApplicationSummarySchema.safeParse({ ...validSummary, status: 'INVALID_STATUS' })
    expect(result.success).toBe(false)
  })

  it('parses optional bankName', () => {
    const result = LoanApplicationSummarySchema.safeParse({ ...validSummary, bankName: 'ICICI Bank' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.bankName).toBe('ICICI Bank')
  })
})

// ---------------------------------------------------------------------------
// ConsentRecordSchema
// ---------------------------------------------------------------------------

describe('ConsentRecordSchema', () => {
  const validConsent = {
    consentId: 'consent-001',
    consentType: 'CREDIT_BUREAU',
    consentVersion: 'v2.1',
    signedAt: '2024-01-15T10:00:00Z',
    signatureHex: 'abcdef1234567890',
  }

  it('parses a valid consent record', () => {
    const result = ConsentRecordSchema.safeParse(validConsent)
    expect(result.success).toBe(true)
  })

  it('validates consent type enum', () => {
    const types = ['CREDIT_BUREAU', 'DATA_SHARE_WITH_BANK', 'DISBURSEMENT_MANDATE']
    for (const consentType of types) {
      const result = ConsentRecordSchema.safeParse({ ...validConsent, consentType })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid consent type', () => {
    const result = ConsentRecordSchema.safeParse({ ...validConsent, consentType: 'INVALID' })
    expect(result.success).toBe(false)
  })

  it('accepts optional biometricUsed', () => {
    const result = ConsentRecordSchema.safeParse({ ...validConsent, biometricUsed: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.biometricUsed).toBe(true)
  })

  it('accepts null ip and userAgent', () => {
    const result = ConsentRecordSchema.safeParse({ ...validConsent, ipAddress: null, userAgent: null })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// StatusLogEntrySchema
// ---------------------------------------------------------------------------

describe('StatusLogEntrySchema', () => {
  const validEntry = {
    id: 'log-001',
    toStatus: 'UNDER_REVIEW',
    timestamp: '2024-01-16T09:00:00Z',
    actorType: 'officer',
  }

  it('parses a valid status log entry', () => {
    const result = StatusLogEntrySchema.safeParse(validEntry)
    expect(result.success).toBe(true)
  })

  it('accepts optional note', () => {
    const result = StatusLogEntrySchema.safeParse({ ...validEntry, note: 'Reviewed by CA' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.note).toBe('Reviewed by CA')
  })

  it('requires id', () => {
    const { id: _omit, ...rest } = validEntry
    const result = StatusLogEntrySchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BankCommMessageSchema
// ---------------------------------------------------------------------------

describe('BankCommMessageSchema', () => {
  const validMsg = {
    messageId: 'msg-001',
    bankId: 'bank-001',
    adapterType: 'EMAIL',
    status: 'SENT',
    direction: 'outbound',
    channel: 'email',
    timestamp: '2024-01-17T08:00:00Z',
  }

  it('parses a valid bank comm message', () => {
    const result = BankCommMessageSchema.safeParse(validMsg)
    expect(result.success).toBe(true)
  })

  it('validates all BankCommStatus values', () => {
    const statuses = ['QUEUED', 'SENT', 'DELIVERED', 'RESPONDED', 'BOUNCED', 'FAILED']
    for (const status of statuses) {
      const result = BankCommMessageSchema.safeParse({ ...validMsg, status })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = BankCommMessageSchema.safeParse({ ...validMsg, status: 'PENDING' })
    expect(result.success).toBe(false)
  })

  it('accepts optional payloadMasked', () => {
    const result = BankCommMessageSchema.safeParse({ ...validMsg, payloadMasked: '{"key":"***"}' })
    expect(result.success).toBe(true)
  })

  it('accepts optional responseStatus', () => {
    const result = BankCommMessageSchema.safeParse({ ...validMsg, responseStatus: 200 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.responseStatus).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// LoanKpiSchema
// ---------------------------------------------------------------------------

describe('LoanKpiSchema', () => {
  const validKpi = {
    totalApps: 150,
    submitted: 30,
    underReview: 45,
    awaitingDocs: 10,
    approved: 25,
    disbursed: 40,
  }

  it('parses valid KPI data', () => {
    const result = LoanKpiSchema.safeParse(validKpi)
    expect(result.success).toBe(true)
  })

  it('requires all numeric fields', () => {
    const { totalApps: _omit, ...rest } = validKpi
    const result = LoanKpiSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BankCommKpiSchema
// ---------------------------------------------------------------------------

describe('BankCommKpiSchema', () => {
  const validKpi = {
    sentToday: 12,
    pending: 3,
    failed: 1,
  }

  it('parses valid bank comm KPI data', () => {
    const result = BankCommKpiSchema.safeParse(validKpi)
    expect(result.success).toBe(true)
  })

  it('accepts optional avgResponseMinutes and bounceRate', () => {
    const result = BankCommKpiSchema.safeParse({ ...validKpi, avgResponseMinutes: 45.5, bounceRate: 2.1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.avgResponseMinutes).toBe(45.5)
      expect(result.data.bounceRate).toBe(2.1)
    }
  })
})

// ---------------------------------------------------------------------------
// LoanDocumentSchema
// ---------------------------------------------------------------------------

describe('LoanDocumentSchema', () => {
  const validDoc = {
    documentId: 'doc-001',
    documentType: 'BANK_STMT',
    fileName: 'bank_statement.pdf',
    status: 'verified',
    uploadedAt: '2024-01-10T06:00:00Z',
  }

  it('parses a valid document', () => {
    const result = LoanDocumentSchema.safeParse(validDoc)
    expect(result.success).toBe(true)
  })

  it('accepts optional source field', () => {
    const result = LoanDocumentSchema.safeParse({ ...validDoc, source: 'manual' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.source).toBe('manual')
  })

  it('requires documentId', () => {
    const { documentId: _omit, ...rest } = validDoc
    const result = LoanDocumentSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})
