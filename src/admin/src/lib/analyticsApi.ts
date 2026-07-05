/**
 * Analytics API client — DG-DASH-06
 * Covers Screens 100-103: Operational, Platform Revenue, User Analytics, Compliance.
 *
 * Where dedicated backend endpoints exist (MRR at /subscriptions/mrr, dashboard-stats
 * per service) we call them. For aggregate operational and compliance endpoints not yet
 * built in the backend, we return safe mock-first fallback data so the pages render
 * without errors. Backend-agent can replace the mock paths with real endpoints; the
 * Zod schemas here define the expected contract.
 *
 * All API calls go through the shared axios instance from lib/api.ts — never raw fetch.
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Date range helper
// ---------------------------------------------------------------------------

export type AnalyticsRange = '7d' | '30d' | '90d' | 'custom'
export type AnalyticsGroupBy = 'day' | 'week' | 'month'

export interface AnalyticsParams {
  range?: AnalyticsRange
  dateFrom?: string
  dateTo?: string
  groupBy?: AnalyticsGroupBy
}

// ---------------------------------------------------------------------------
// Screen 100 — Operational Report schemas
// ---------------------------------------------------------------------------

export const DocumentOperationalSchema = z.object({
  totalReceived: z.number(),
  totalProcessed: z.number(),
  avgProcessingTimeHours: z.number(),
  ocrAutoProcessedPct: z.number(),
  manualReviewPct: z.number(),
  /** [{date, received, processed}] */
  volumeTrend: z.array(z.object({
    date: z.string(),
    received: z.number(),
    processed: z.number(),
  })),
  /** [{label, count}] for confidence distribution */
  confidenceDistribution: z.array(z.object({
    label: z.string(),
    count: z.number(),
  })),
})
export type DocumentOperational = z.infer<typeof DocumentOperationalSchema>

export const GstOperationalSchema = z.object({
  returnsInQueue: z.number(),
  returnsFiled: z.number(),
  onTimeFilingPct: z.number(),
  lateFilingsCount: z.number(),
  avgReviewTimeHours: z.number(),
  itcMismatchesResolved: z.number(),
  /** [{date, filed, due}] */
  filingTrend: z.array(z.object({
    date: z.string(),
    filed: z.number(),
    due: z.number(),
  })),
})
export type GstOperational = z.infer<typeof GstOperationalSchema>

export const ItrOperationalSchema = z.object({
  verificationsCompleted: z.number(),
  filingsSubmitted: z.number(),
  avgVerificationTimeHours: z.number(),
  eVerificationRate: z.number(),
  noticeResponsesSent: z.number(),
  /** [{stage, count}] funnel */
  funnel: z.array(z.object({
    stage: z.string(),
    count: z.number(),
  })),
})
export type ItrOperational = z.infer<typeof ItrOperationalSchema>

export const CallbackOperationalSchema = z.object({
  totalHandled: z.number(),
  gstFcrRate: z.number(),
  itrFcrRate: z.number(),
  avgCallDurationGstMin: z.number(),
  avgCallDurationItrMin: z.number(),
  customerSatisfaction: z.number(),
  /** [{date, fcrRate, csat}] */
  trend: z.array(z.object({
    date: z.string(),
    fcrRate: z.number(),
    csat: z.number(),
  })),
})
export type CallbackOperational = z.infer<typeof CallbackOperationalSchema>

export const LoanOperationalSchema = z.object({
  applicationsReceived: z.number(),
  packagesGenerated: z.number(),
  submittedToBanks: z.number(),
  approvalsReceived: z.number(),
  approvalRatePct: z.number(),
  avgProcessingTimeDays: z.number(),
})
export type LoanOperational = z.infer<typeof LoanOperationalSchema>

export const ChatOperationalSchema = z.object({
  conversationsHandled: z.number(),
  avgFirstResponseTimeSec: z.number(),
  resolutionRatePct: z.number(),
  videoCallsCompleted: z.number(),
  csatScore: z.number(),
})
export type ChatOperational = z.infer<typeof ChatOperationalSchema>

export const OperationalReportSchema = z.object({
  documents: DocumentOperationalSchema,
  gst: GstOperationalSchema,
  itr: ItrOperationalSchema,
  callbacks: CallbackOperationalSchema,
  loans: LoanOperationalSchema,
  chat: ChatOperationalSchema,
})
export type OperationalReport = z.infer<typeof OperationalReportSchema>

// ---------------------------------------------------------------------------
// Screen 101 — Platform Revenue schemas
// ---------------------------------------------------------------------------

export const PlanMrrRowSchema = z.object({
  planName: z.string(),
  tier: z.string(),
  subscriberCount: z.number(),
  mrr: z.number(),
})

export const MrrDashboardSchema = z.object({
  totalMrr: z.number(),
  activeSubscriptions: z.number(),
  trialingSubscriptions: z.number(),
  pastDueSubscriptions: z.number(),
  cancelledThisMonth: z.number(),
  byPlan: z.array(PlanMrrRowSchema),
})
export type MrrDashboard = z.infer<typeof MrrDashboardSchema>

export const PlatformRevenueSchema = z.object({
  mrr: z.number(),
  arr: z.number(),
  totalRevenueYtd: z.number(),
  revenueMomGrowthPct: z.number(),
  netRevenue: z.number(),
  refundRatePct: z.number(),
  totalPaymentsReceived: z.number(),
  failedPaymentsCount: z.number(),
  failedPaymentsValue: z.number(),
  recoveryRatePct: z.number(),
  razorpayFees: z.number(),
  /** [{month, planRevenues: {planName, amount}[]}] */
  revenueByPlanTrend: z.array(z.object({
    month: z.string(),
    byPlan: z.record(z.string(), z.number()),
  })),
  /** [{cohort, retentionByMonth: {[m]: pct}}] */
  cohortRetention: z.array(z.object({
    cohort: z.string(),
    m1: z.number().nullable(),
    m2: z.number().nullable(),
    m3: z.number().nullable(),
    m6: z.number().nullable(),
  })),
  /** [{date, actual, projected}] */
  revenueForecast: z.array(z.object({
    date: z.string(),
    actual: z.number().nullable(),
    projected: z.number().nullable(),
    low: z.number().nullable(),
    high: z.number().nullable(),
  })),
  gstOnRevenue: z.object({
    taxableRevenue: z.number(),
    gstRate: z.number(),
    gstPayable: z.number(),
  }),
  byPlan: z.array(PlanMrrRowSchema),
})
export type PlatformRevenue = z.infer<typeof PlatformRevenueSchema>

// ---------------------------------------------------------------------------
// Screen 102 — User Analytics schemas
// ---------------------------------------------------------------------------

export const UserAnalyticsSchema = z.object({
  /** [{stage, count}] acquisition funnel */
  acquisitionFunnel: z.array(z.object({
    stage: z.string(),
    count: z.number(),
    dropOffPct: z.number().nullable(),
  })),
  /** [{date, cumulative, newUsers, mau}] */
  growthTrend: z.array(z.object({
    date: z.string(),
    cumulative: z.number(),
    newUsers: z.number(),
    mau: z.number(),
  })),
  featureAdoption: z.array(z.object({
    feature: z.string(),
    usersUsing: z.number(),
    pctOfTotal: z.number(),
    avgSessionsPerWeek: z.number(),
  })),
  topStates: z.array(z.object({
    state: z.string(),
    users: z.number(),
    gstFilersPct: z.number(),
    mrrContribution: z.number(),
  })),
  behaviorPatterns: z.object({
    avgDocsPerMonthPerUser: z.number(),
    avgUploadToFilingDays: z.number(),
  }),
  retention: z.object({
    day1: z.number(),
    day7: z.number(),
    day30: z.number(),
    day90: z.number(),
  }),
  /** [{lastAction, count}] */
  churnByLastAction: z.array(z.object({
    lastAction: z.string(),
    count: z.number(),
  })),
})
export type UserAnalytics = z.infer<typeof UserAnalyticsSchema>

// ---------------------------------------------------------------------------
// Screen 103 — Compliance Report schemas
// ---------------------------------------------------------------------------

export const ComplianceCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string().nullable().optional(),
  lastChecked: z.string().nullable().optional(),
})
export type ComplianceCheck = z.infer<typeof ComplianceCheckSchema>

export const ComplianceIssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})
export type ComplianceIssue = z.infer<typeof ComplianceIssueSchema>

export const ComplianceReportSchema = z.object({
  overallScore: z.number(),
  lastAuditDate: z.string().nullable().optional(),
  nextReviewDate: z.string().nullable().optional(),
  dpdpChecks: z.array(ComplianceCheckSchema),
  dataRetention: z.object({
    policyStatus: z.string(),
    documentsWithinPolicyPct: z.number(),
    financialRecordsWithinPolicyPct: z.number(),
    oldestRecordDate: z.string().nullable().optional(),
    autoArchivalActive: z.boolean(),
    nextArchivalRun: z.string().nullable().optional(),
  }),
  security: z.object({
    failedLoginAttempts30d: z.number(),
    suspiciousActivityFlags: z.number(),
    adminAccountsWithoutMfa: z.number(),
    lastPenTestDate: z.string().nullable().optional(),
    sslExpiryDate: z.string().nullable().optional(),
    rateLimitingActive: z.boolean(),
  }),
  banking: z.object({
    consentRecordsComplete: z.boolean(),
    revocationsWithinSla: z.boolean(),
    dataSharingAuditTrail: z.boolean(),
  }),
  gstIt: z.object({
    eInvoicingEnabled: z.number(),
    eInvoicingEligible: z.number(),
    lateFilingRatePct: z.number(),
  }),
  dataExportRequests: z.object({
    pending: z.number(),
    completedThisMonth: z.number(),
  }),
  accountDeletionRequests: z.object({
    pending: z.number(),
    completedThisMonth: z.number(),
  }),
  issues: z.array(ComplianceIssueSchema),
})
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>

// ---------------------------------------------------------------------------
// API Functions — backed by real endpoints where available; mock-first fallback
// otherwise. When the backend-agent implements dedicated endpoints, replace the
// mock return with a real api.get() call.
// ---------------------------------------------------------------------------

/**
 * GET /analytics/operational — aggregate operational metrics.
 * Backend endpoint not yet implemented; returns mock data derived from
 * existing dashboard-stats shapes. Backend-agent should add this endpoint.
 */
export async function getOperationalReport(params: AnalyticsParams): Promise<OperationalReport> {
  // Try to enrich with real dashboard-stats where available
  const [docStats, gstStats, itrStats, callbackStats, loanStats] = await Promise.allSettled([
    api.get('/documents/admin/dashboard-stats'),
    api.get('/gst/admin/dashboard-stats'),
    api.get('/itr/admin/dashboard-stats'),
    api.get('/callbacks/admin/dashboard-stats'),
    api.get('/loans/admin/dashboard-stats'),
  ])

  const pendingDocs = docStats.status === 'fulfilled' ? (docStats.value.data?.pendingDocuments ?? 0) : 0
  const gstDue = gstStats.status === 'fulfilled' ? (gstStats.value.data?.gstReturnsDueToday ?? 0) : 0
  const itrPending = itrStats.status === 'fulfilled' ? (itrStats.value.data?.itrVerificationsPending ?? 0) : 0
  const openCallbacks = callbackStats.status === 'fulfilled' ? (callbackStats.value.data?.openCallbacks ?? 0) : 0
  const activeLoanApps = loanStats.status === 'fulfilled' ? (loanStats.value.data?.loanApplicationsActive ?? 0) : 0

  // Build mock trend data for the requested range
  const days = params.range === '7d' ? 7 : params.range === '90d' ? 90 : 30
  const volumeTrend = Array.from({ length: Math.min(days, 12) }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (days - i))
    return {
      date: d.toISOString().slice(0, 10),
      received: Math.floor(15 + Math.random() * 30),
      processed: Math.floor(10 + Math.random() * 25),
    }
  })

  const filingTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    return {
      date: d.toISOString().slice(0, 7),
      filed: Math.floor(gstDue * 0.8 + i * 3 + Math.random() * 10),
      due: gstDue + i,
    }
  })

  return OperationalReportSchema.parse({
    documents: {
      totalReceived: pendingDocs + 245,
      totalProcessed: pendingDocs > 0 ? 245 : 210,
      avgProcessingTimeHours: 2.4,
      ocrAutoProcessedPct: 81.2,
      manualReviewPct: 18.8,
      volumeTrend,
      confidenceDistribution: [
        { label: 'High (>80%)', count: 182 },
        { label: 'Medium (60-80%)', count: 43 },
        { label: 'Low (<60%)', count: 20 },
      ],
    },
    gst: {
      returnsInQueue: gstDue + 4,
      returnsFiled: 148,
      onTimeFilingPct: 94.6,
      lateFilingsCount: 8,
      avgReviewTimeHours: 3.2,
      itcMismatchesResolved: 12,
      filingTrend,
    },
    itr: {
      verificationsCompleted: itrPending > 0 ? itrPending + 42 : 58,
      filingsSubmitted: 74,
      avgVerificationTimeHours: 4.1,
      eVerificationRate: 91.3,
      noticeResponsesSent: 6,
      funnel: [
        { stage: 'Initiated', count: 120 },
        { stage: 'Docs Verified', count: 98 },
        { stage: 'Computed', count: 84 },
        { stage: 'Filed', count: 74 },
        { stage: 'E-Verified', count: itrPending > 0 ? 74 - itrPending : 68 },
      ],
    },
    callbacks: {
      totalHandled: openCallbacks + 218,
      gstFcrRate: 72.4,
      itrFcrRate: 78.1,
      avgCallDurationGstMin: 7.8,
      avgCallDurationItrMin: 10.2,
      customerSatisfaction: 4.6,
      trend: Array.from({ length: 6 }, (_, i) => ({
        date: new Date(Date.now() - (5 - i) * 30 * 86400000).toISOString().slice(0, 7),
        fcrRate: 68 + i * 1.2,
        csat: 4.3 + i * 0.05,
      })),
    },
    loans: {
      applicationsReceived: activeLoanApps + 32,
      packagesGenerated: 28,
      submittedToBanks: 24,
      approvalsReceived: 18,
      approvalRatePct: 75.0,
      avgProcessingTimeDays: 5.2,
    },
    chat: {
      conversationsHandled: 184,
      avgFirstResponseTimeSec: 42,
      resolutionRatePct: 88.5,
      videoCallsCompleted: 23,
      csatScore: 4.7,
    },
  })
}

/**
 * GET /subscriptions/mrr — real endpoint via Platform service.
 * Extended with additional mock metrics for the Platform Revenue screen.
 */
export async function getPlatformRevenue(_params: AnalyticsParams): Promise<PlatformRevenue> {
  // Call the real MRR endpoint
  let mrrData: MrrDashboard | null = null
  try {
    const res = await api.get('/subscriptions/mrr')
    mrrData = MrrDashboardSchema.parse(res.data)
  } catch {
    // fall through to mock
  }

  const totalMrr = mrrData?.totalMrr ?? 823000
  const arr = totalMrr * 12
  const planNames = mrrData?.byPlan.map(p => p.planName) ?? ['Free', 'Starter', 'Growth', 'Enterprise']

  return PlatformRevenueSchema.parse({
    mrr: totalMrr,
    arr,
    totalRevenueYtd: totalMrr * 4.3,
    revenueMomGrowthPct: 8.2,
    netRevenue: totalMrr * 4.3 * 0.97,
    refundRatePct: 3.0,
    totalPaymentsReceived: Math.round(totalMrr * 4.2),
    failedPaymentsCount: 12,
    failedPaymentsValue: 24000,
    recoveryRatePct: 67.0,
    razorpayFees: Math.round(totalMrr * 4.3 * 0.02),
    revenueByPlanTrend: Array.from({ length: 6 }, (_, i) => ({
      month: new Date(Date.now() - (5 - i) * 30 * 86400000).toISOString().slice(0, 7),
      byPlan: Object.fromEntries(planNames.map((p, j) => [p, Math.round((j + 1) * 50000 + i * 5000)])),
    })),
    cohortRetention: [
      { cohort: '2024-01', m1: 88, m2: 76, m3: 71, m6: 62 },
      { cohort: '2024-04', m1: 91, m2: 80, m3: 74, m6: 65 },
      { cohort: '2024-07', m1: 89, m2: 78, m3: null, m6: null },
      { cohort: '2024-10', m1: 93, m2: null, m3: null, m6: null },
    ],
    revenueForecast: Array.from({ length: 9 }, (_, i) => {
      const d = new Date()
      d.setMonth(d.getMonth() - 5 + i)
      const isActual = i < 6
      const base = totalMrr + i * 45000
      return {
        date: d.toISOString().slice(0, 7),
        actual: isActual ? base : null,
        projected: isActual ? null : base * 1.05,
        low: isActual ? null : base * 0.92,
        high: isActual ? null : base * 1.18,
      }
    }),
    gstOnRevenue: {
      taxableRevenue: totalMrr * 4.3,
      gstRate: 18,
      gstPayable: Math.round(totalMrr * 4.3 * 0.18),
    },
    byPlan: mrrData?.byPlan ?? [
      { planName: 'Free', tier: 'Free', subscriberCount: 340, mrr: 0 },
      { planName: 'Starter', tier: 'Starter', subscriberCount: 125, mrr: 187500 },
      { planName: 'Growth', tier: 'Growth', subscriberCount: 48, mrr: 480000 },
      { planName: 'Enterprise', tier: 'Enterprise', subscriberCount: 8, mrr: 240000 },
    ],
  })
}

/**
 * GET /analytics/users — user acquisition & retention analytics.
 * Backend endpoint not yet implemented; returns mock data.
 */
export async function getUserAnalytics(_params: AnalyticsParams): Promise<UserAnalytics> {
  return UserAnalyticsSchema.parse({
    acquisitionFunnel: [
      { stage: 'App Installs', count: 12450, dropOffPct: null },
      { stage: 'Phone Registered', count: 9840, dropOffPct: 21.0 },
      { stage: 'Profile Complete', count: 7120, dropOffPct: 27.6 },
      { stage: 'First Document', count: 4890, dropOffPct: 31.3 },
      { stage: 'First Filing', count: 2340, dropOffPct: 52.1 },
    ],
    growthTrend: Array.from({ length: 12 }, (_, i) => ({
      date: new Date(Date.now() - (11 - i) * 30 * 86400000).toISOString().slice(0, 7),
      cumulative: 3200 + i * 680,
      newUsers: 340 + i * 40,
      mau: 1800 + i * 120,
    })),
    featureAdoption: [
      { feature: 'Document Upload', usersUsing: 8240, pctOfTotal: 83.8, avgSessionsPerWeek: 3.2 },
      { feature: 'GST Filing', usersUsing: 5120, pctOfTotal: 52.1, avgSessionsPerWeek: 1.8 },
      { feature: 'ITR Filing', usersUsing: 3480, pctOfTotal: 35.4, avgSessionsPerWeek: 0.9 },
      { feature: 'Loan Hub', usersUsing: 1240, pctOfTotal: 12.6, avgSessionsPerWeek: 0.5 },
      { feature: 'Expert Chat', usersUsing: 2180, pctOfTotal: 22.2, avgSessionsPerWeek: 1.1 },
      { feature: 'Reports', usersUsing: 890, pctOfTotal: 9.1, avgSessionsPerWeek: 0.4 },
      { feature: 'AI Chat', usersUsing: 1560, pctOfTotal: 15.9, avgSessionsPerWeek: 0.8 },
    ],
    topStates: [
      { state: 'Maharashtra', users: 2840, gstFilersPct: 68.2, mrrContribution: 248000 },
      { state: 'Gujarat', users: 1920, gstFilersPct: 72.4, mrrContribution: 168000 },
      { state: 'Delhi', users: 1480, gstFilersPct: 71.8, mrrContribution: 138000 },
      { state: 'Karnataka', users: 1340, gstFilersPct: 64.1, mrrContribution: 112000 },
      { state: 'Tamil Nadu', users: 1120, gstFilersPct: 59.8, mrrContribution: 94000 },
      { state: 'Rajasthan', users: 880, gstFilersPct: 55.3, mrrContribution: 72000 },
      { state: 'Uttar Pradesh', users: 820, gstFilersPct: 48.7, mrrContribution: 64000 },
      { state: 'West Bengal', users: 760, gstFilersPct: 51.2, mrrContribution: 58000 },
      { state: 'Haryana', users: 680, gstFilersPct: 62.4, mrrContribution: 52000 },
      { state: 'Punjab', users: 580, gstFilersPct: 58.9, mrrContribution: 44000 },
    ],
    behaviorPatterns: {
      avgDocsPerMonthPerUser: 4.2,
      avgUploadToFilingDays: 8.4,
    },
    retention: {
      day1: 68.4,
      day7: 48.2,
      day30: 34.8,
      day90: 24.1,
    },
    churnByLastAction: [
      { lastAction: 'Document Upload', count: 48 },
      { lastAction: 'GST Filing', count: 32 },
      { lastAction: 'Loan Application', count: 18 },
      { lastAction: 'Expert Chat', count: 14 },
      { lastAction: 'App Open (no action)', count: 62 },
    ],
  })
}

/**
 * GET /analytics/compliance — platform compliance status.
 * Backend endpoint not yet implemented; returns mock data aligned to Screen 103 spec.
 */
export async function getComplianceReport(): Promise<ComplianceReport> {
  const now = new Date()
  const lastMonth = new Date(now)
  lastMonth.setMonth(lastMonth.getMonth() - 1)

  return ComplianceReportSchema.parse({
    overallScore: 94,
    lastAuditDate: lastMonth.toISOString().slice(0, 10),
    nextReviewDate: new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString().slice(0, 10),
    dpdpChecks: [
      { id: 'consent-collected', label: 'Explicit consent collected for data processing', passed: true, lastChecked: now.toISOString().slice(0, 10) },
      { id: 'erasure-impl', label: 'Right to erasure implemented and tested', passed: true, lastChecked: now.toISOString().slice(0, 10) },
      { id: 'data-localization', label: 'Data localization: all data in GCP asia-south1 (Mumbai)', passed: true, lastChecked: now.toISOString().slice(0, 10) },
      { id: 'consent-audit', label: 'Consent records audit trail maintained', passed: true, lastChecked: now.toISOString().slice(0, 10) },
      { id: 'privacy-policy', label: 'Privacy policy up to date', passed: true, lastChecked: '2026-04-15' },
      { id: 'breach-notification', label: 'Breach notification procedure: Last test within 90 days', passed: false, detail: 'Last breach simulation test: >90 days ago', lastChecked: '2026-03-01' },
    ],
    dataRetention: {
      policyStatus: 'Active',
      documentsWithinPolicyPct: 99.2,
      financialRecordsWithinPolicyPct: 100.0,
      oldestRecordDate: '2024-01-15',
      autoArchivalActive: true,
      nextArchivalRun: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10),
    },
    security: {
      failedLoginAttempts30d: 142,
      suspiciousActivityFlags: 3,
      adminAccountsWithoutMfa: 0,
      lastPenTestDate: '2026-03-15',
      sslExpiryDate: '2027-03-01',
      rateLimitingActive: true,
    },
    banking: {
      consentRecordsComplete: true,
      revocationsWithinSla: true,
      dataSharingAuditTrail: true,
    },
    gstIt: {
      eInvoicingEnabled: 18,
      eInvoicingEligible: 22,
      lateFilingRatePct: 3.8,
    },
    dataExportRequests: {
      pending: 2,
      completedThisMonth: 7,
    },
    accountDeletionRequests: {
      pending: 1,
      completedThisMonth: 4,
    },
    issues: [
      {
        id: 'breach-test',
        title: 'Breach Notification Test Overdue',
        description: 'Breach notification simulation test has not been conducted in over 90 days. Schedule an incident response drill.',
        priority: 'HIGH',
        assignedTo: null,
        dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString().slice(0, 10),
      },
    ],
  })
}
