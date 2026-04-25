/**
 * itrApi Zod schema contract tests — Phase 6D
 *
 * Validates that sample server responses parse through the Zod schemas
 * defined in itrApi.ts. Serves as a contract guard: backend field changes
 * fail here before any UI tests run.
 */
import { describe, it, expect } from 'vitest'
import {
  AssesseeProfileSchema,
  TaxSlabVersionSchema,
  ComputationInputSchema,
  ComputationResultSchema,
  RegimeComparisonSchema,
  FilingSchema,
  ComputationVersionSchema,
  ItrNoticeSchema,
  ItrVerificationKpiSchema,
  ItrFormTypeSchema,
  RegimeSchema,
  FilingStatusSchema,
} from '@/lib/itrApi'

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------
describe('itrApi — enum schemas', () => {
  it('ItrFormTypeSchema accepts ITR-1 through ITR-7', () => {
    for (const form of ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-7']) {
      expect(() => ItrFormTypeSchema.parse(form)).not.toThrow()
    }
  })

  it('ItrFormTypeSchema rejects invalid value', () => {
    expect(() => ItrFormTypeSchema.parse('ITR-8')).toThrow()
  })

  it('RegimeSchema accepts OLD and NEW', () => {
    expect(() => RegimeSchema.parse('OLD')).not.toThrow()
    expect(() => RegimeSchema.parse('NEW')).not.toThrow()
  })

  it('FilingStatusSchema accepts all expected statuses', () => {
    const statuses = [
      'DRAFT', 'UNDER_CA_REVIEW', 'USER_APPROVED', 'FILED',
      'E_VERIFIED', 'REFUND_ISSUED', 'NOTICE_RECEIVED',
    ]
    for (const s of statuses) {
      expect(() => FilingStatusSchema.parse(s)).not.toThrow()
    }
  })

  it('FilingStatusSchema rejects unknown status', () => {
    expect(() => FilingStatusSchema.parse('PENDING_REVIEW')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// AssesseeProfileSchema
// ---------------------------------------------------------------------------
describe('itrApi — AssesseeProfileSchema', () => {
  const valid = {
    id: 'prof-001',
    userId: 'u-001',
    panLast4: '1234',
    fullName: 'Ravi Kumar',
    assesseeType: 'INDIVIDUAL',
    email: 'ravi@example.com',
    phone: '+919876543210',
  }

  it('parses valid assessee profile', () => {
    expect(() => AssesseeProfileSchema.parse(valid)).not.toThrow()
  })

  it('allows optional fields to be absent', () => {
    const minimal = { id: 'prof-001', userId: 'u-001', panLast4: '1234', fullName: 'A', assesseeType: 'INDIVIDUAL' }
    expect(() => AssesseeProfileSchema.parse(minimal)).not.toThrow()
  })

  it('rejects missing userId', () => {
    const { userId: _, ...rest } = valid
    expect(() => AssesseeProfileSchema.parse(rest)).toThrow()
  })

  it('rejects invalid assesseeType', () => {
    expect(() => AssesseeProfileSchema.parse({ ...valid, assesseeType: 'PARTNERSHIP' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// TaxSlabVersionSchema
// ---------------------------------------------------------------------------
describe('itrApi — TaxSlabVersionSchema', () => {
  const valid = {
    versionId: 'slabs-001',
    assessmentYear: 'AY2025-26',
    regime: 'NEW',
    slabsJson: [
      { from: 0, to: 300000, rate: 0 },
      { from: 300001, to: 700000, rate: 5 },
      { from: 700001, to: null, rate: 30 },
    ],
    standardDeduction: 75000,
    rebate87AIncomeLimit: 700000,
    rebate87AMaxAmount: 25000,
    cessRatePct: 4,
  }

  it('parses valid tax slab version', () => {
    expect(() => TaxSlabVersionSchema.parse(valid)).not.toThrow()
  })

  it('parses with null "to" in last slab', () => {
    const result = TaxSlabVersionSchema.parse(valid)
    const lastSlab = result.slabsJson[result.slabsJson.length - 1]
    expect(lastSlab.to).toBeNull()
    expect(lastSlab.rate).toBe(30)
  })

  it('rejects missing assessmentYear', () => {
    const { assessmentYear: _, ...rest } = valid
    expect(() => TaxSlabVersionSchema.parse(rest)).toThrow()
  })

  it('rejects invalid regime', () => {
    expect(() => TaxSlabVersionSchema.parse({ ...valid, regime: 'FLAT' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// ComputationInputSchema
// ---------------------------------------------------------------------------
describe('itrApi — ComputationInputSchema', () => {
  const valid = {
    salaryIncome: 600000,
    housePropertyIncome: -200000,
    businessIncome: 0,
    capitalGains: 50000,
    otherIncome: 10000,
    section80C: 150000,
    section80D: 25000,
    section80E: 0,
    otherDeductions: 0,
    advanceTaxPaid: 0,
    tdsPaid: 42000,
  }

  it('parses valid computation input', () => {
    expect(() => ComputationInputSchema.parse(valid)).not.toThrow()
  })

  it('applies defaults for missing numeric fields', () => {
    const result = ComputationInputSchema.parse({})
    expect(result.salaryIncome).toBe(0)
    expect(result.businessIncome).toBe(0)
    expect(result.tdsPaid).toBe(0)
  })

  it('parses partial input using defaults for remaining fields', () => {
    const result = ComputationInputSchema.parse({ salaryIncome: 500000 })
    expect(result.salaryIncome).toBe(500000)
    expect(result.section80C).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// ComputationResultSchema
// ---------------------------------------------------------------------------
describe('itrApi — ComputationResultSchema', () => {
  const valid = {
    filingId: 'fil-001',
    grossTotalIncome: 770000,
    deductions: 75000,
    taxableIncome: 695000,
    taxOnIncome: 17250,
    surcharge: 0,
    cessAmount: 690,
    rebate87A: 0,
    grossTaxLiability: 17940,
    tdsPaid: 42000,
    advanceTaxPaid: 0,
    totalCredits: 42000,
    payableOrRefund: -24060,
    computationHash: 'abc123def456',
    regime: 'OLD',
    assessmentYear: 'AY2025-26',
  }

  it('parses valid computation result', () => {
    expect(() => ComputationResultSchema.parse(valid)).not.toThrow()
  })

  it('allows negative payableOrRefund (refund scenario)', () => {
    const result = ComputationResultSchema.parse(valid)
    expect(result.payableOrRefund).toBe(-24060)
  })

  it('allows optional slabBreakdown', () => {
    const withSlabs = {
      ...valid,
      slabBreakdown: [{ from: 0, to: 300000, rate: 0, taxOnSlab: 0 }],
    }
    expect(() => ComputationResultSchema.parse(withSlabs)).not.toThrow()
  })

  it('rejects missing filingId', () => {
    const { filingId: _, ...rest } = valid
    expect(() => ComputationResultSchema.parse(rest)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// RegimeComparisonSchema
// ---------------------------------------------------------------------------
describe('itrApi — RegimeComparisonSchema', () => {
  const makeResult = (regime: 'OLD' | 'NEW', payableOrRefund: number) => ({
    filingId: 'fil-001',
    grossTotalIncome: 770000,
    deductions: regime === 'OLD' ? 225000 : 75000,
    taxableIncome: 770000,
    taxOnIncome: 17000,
    surcharge: 0,
    cessAmount: 680,
    rebate87A: 0,
    grossTaxLiability: 17680,
    tdsPaid: 42000,
    advanceTaxPaid: 0,
    totalCredits: 42000,
    payableOrRefund,
    computationHash: 'xyz789',
    regime,
    assessmentYear: 'AY2025-26',
  })

  const valid = {
    old: makeResult('OLD', -24320),
    new: makeResult('NEW', -34200),
    recommendedRegime: 'NEW',
    taxSaving: 9880,
  }

  it('parses valid regime comparison', () => {
    expect(() => RegimeComparisonSchema.parse(valid)).not.toThrow()
  })

  it('surfaces recommended regime correctly', () => {
    const result = RegimeComparisonSchema.parse(valid)
    expect(result.recommendedRegime).toBe('NEW')
    expect(result.taxSaving).toBe(9880)
  })

  it('rejects invalid recommendedRegime', () => {
    expect(() => RegimeComparisonSchema.parse({ ...valid, recommendedRegime: 'FLAT' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// FilingSchema
// ---------------------------------------------------------------------------
describe('itrApi — FilingSchema', () => {
  const valid = {
    id: 'fil-001',
    assesseeId: 'prof-001',
    assessmentYear: 'AY2025-26',
    itrFormType: 'ITR-1',
    status: 'DRAFT',
    regime: 'NEW',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-25T00:00:00Z',
  }

  it('parses valid filing', () => {
    expect(() => FilingSchema.parse(valid)).not.toThrow()
  })

  it('allows optional and nullable fields to be absent', () => {
    const result = FilingSchema.parse(valid)
    expect(result.assignedCaId).toBeUndefined()
    expect(result.acknowledgementNumber).toBeUndefined()
  })

  it('rejects invalid status', () => {
    expect(() => FilingSchema.parse({ ...valid, status: 'INVALID_STATUS' })).toThrow()
  })

  it('rejects invalid itrFormType', () => {
    expect(() => FilingSchema.parse({ ...valid, itrFormType: 'ITR-9' })).toThrow()
  })

  it('allows null regime', () => {
    expect(() => FilingSchema.parse({ ...valid, regime: null })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// ComputationVersionSchema
// ---------------------------------------------------------------------------
describe('itrApi — ComputationVersionSchema', () => {
  const makeResult = (regime: 'OLD' | 'NEW') => ({
    filingId: 'fil-001',
    grossTotalIncome: 770000,
    deductions: 75000,
    taxableIncome: 695000,
    taxOnIncome: 17000,
    surcharge: 0,
    cessAmount: 680,
    rebate87A: 0,
    grossTaxLiability: 17680,
    tdsPaid: 42000,
    advanceTaxPaid: 0,
    totalCredits: 42000,
    payableOrRefund: -24320,
    computationHash: 'abc123',
    regime,
    assessmentYear: 'AY2025-26',
  })

  const valid = {
    id: 'cv-001',
    filingId: 'fil-001',
    version: 1,
    actorName: 'CA Ravi Kumar',
    createdAt: '2026-04-25T03:00:00Z',
    input: {},
    result: makeResult('NEW'),
  }

  it('parses valid computation version', () => {
    expect(() => ComputationVersionSchema.parse(valid)).not.toThrow()
  })

  it('allows optional label to be absent', () => {
    const { label: _, ...rest } = { ...valid, label: 'v1' }
    expect(() => ComputationVersionSchema.parse(rest)).not.toThrow()
  })

  it('rejects missing actorName', () => {
    const { actorName: _, ...rest } = valid
    expect(() => ComputationVersionSchema.parse(rest)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// ItrNoticeSchema
// ---------------------------------------------------------------------------
describe('itrApi — ItrNoticeSchema', () => {
  const valid = {
    id: 'itrn-001',
    assesseeId: 'prof-001',
    noticeNumber: 'ITR-N-2026-001',
    noticeType: 'DEFECTIVE_RETURN',
    issuedDate: '2026-04-20T00:00:00Z',
    dueDate: '2026-05-20T00:00:00Z',
    severity: 'HIGH',
    status: 'RECEIVED',
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-25T00:00:00Z',
  }

  it('parses valid ITR notice', () => {
    expect(() => ItrNoticeSchema.parse(valid)).not.toThrow()
  })

  it('rejects invalid severity', () => {
    expect(() => ItrNoticeSchema.parse({ ...valid, severity: 'CRITICAL' })).toThrow()
  })

  it('allows null dueDate', () => {
    expect(() => ItrNoticeSchema.parse({ ...valid, dueDate: null })).not.toThrow()
  })

  it('rejects missing assesseeId', () => {
    const { assesseeId: _, ...rest } = valid
    expect(() => ItrNoticeSchema.parse(rest)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// ItrVerificationKpiSchema
// ---------------------------------------------------------------------------
describe('itrApi — ItrVerificationKpiSchema', () => {
  const valid = {
    awaitingReview: 12,
    slaBreached: 3,
    avgTimeToReviewDays: 1.5,
    totalFilingsAy: 48,
  }

  it('parses valid KPI object', () => {
    expect(() => ItrVerificationKpiSchema.parse(valid)).not.toThrow()
  })

  it('rejects non-numeric KPI values', () => {
    expect(() => ItrVerificationKpiSchema.parse({ ...valid, awaitingReview: 'many' })).toThrow()
  })

  it('rejects missing required field', () => {
    const { slaBreached: _, ...rest } = valid
    expect(() => ItrVerificationKpiSchema.parse(rest)).toThrow()
  })
})
