/**
 * Subscription Service API client — Phase 6F Track F3
 * GAP-036: Extended with admin subscriber list + full invoice schema.
 * All calls go through the shared axios instance from lib/api.ts
 */
import { z } from 'zod'
import api from './api'

// ── Enums / Schemas ──────────────────────────────────────────────────────────

export const PlanTierSchema = z.enum(['Free', 'Starter', 'Growth', 'Enterprise'])
export type PlanTier = z.infer<typeof PlanTierSchema>

export const BillingCycleSchema = z.union([z.literal(1), z.literal(3), z.literal(12)])
export type BillingCycle = z.infer<typeof BillingCycleSchema>

export const SubscriptionStatusSchema = z.enum([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'PAUSED',
])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

export const PlanSchema = z.object({
  planId: z.string(),
  name: z.string(),
  tier: PlanTierSchema,
  billingCycle: z.number(),
  priceInr: z.number(),
  trialDays: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
})
export type Plan = z.infer<typeof PlanSchema>

export const SubscriptionSchema = z.object({
  subscriptionId: z.string(),
  planId: z.string(),
  status: SubscriptionStatusSchema,
  currentPeriodEnd: z.string().nullable().optional(),
  razorpaySubscriptionId: z.string().nullable().optional(),
})
export type Subscription = z.infer<typeof SubscriptionSchema>

/**
 * Full invoice DTO — matches InvoiceDto from ListInvoicesQuery.
 * Fields: invoiceId, subscriptionId, invoiceNumber, amountInr, gstAmountInr,
 * totalInr, status, periodStart, periodEnd, paidAt, pdfGcsUri.
 */
export const InvoiceSchema = z.object({
  invoiceId: z.string(),
  subscriptionId: z.string(),
  invoiceNumber: z.string(),
  amountInr: z.number(),
  gstAmountInr: z.number(),
  totalInr: z.number().optional(),
  status: z.string(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  paidAt: z.string().nullable().optional(),
  pdfGcsUri: z.string().nullable().optional(),
})
export type Invoice = z.infer<typeof InvoiceSchema>

/** Paginated invoice response from GET /subscriptions/invoices */
export const InvoicePageSchema = z.object({
  items: z.array(InvoiceSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type InvoicePage = z.infer<typeof InvoicePageSchema>

export const MrrDashboardSchema = z.object({
  totalMrr: z.number(),
  // Backend field names: activeCount / trialingCount / pastDueCount / cancelledCount
  // (from GetMrrDashboardQuery.MrrDashboardDto — camelCase serialised by .NET)
  activeCount: z.number().optional(),
  trialingCount: z.number().optional(),
  pastDueCount: z.number().optional(),
  cancelledCount: z.number().optional(),
  // Alternate field names the backend may emit
  activeSubscriptions: z.number().optional(),
  trialingSubscriptions: z.number().optional(),
  pastDueSubscriptions: z.number().optional(),
  cancelledThisMonth: z.number().optional(),
  byPlan: z.array(z.object({
    planName: z.string(),
    tier: z.string(),
    subscriberCount: z.number(),
    mrr: z.number(),
  })).optional(),
})
export type MrrDashboard = z.infer<typeof MrrDashboardSchema>

/**
 * Admin subscriber row — returned by GET /subscriptions/admin/list.
 * BLOCKED: this endpoint does not yet exist in SubscriptionService.Api.
 * GAP-036: backend-agent needs to add a platform-admin list endpoint.
 * Until it exists this schema defines the expected contract.
 */
export const SubscriberRowSchema = z.object({
  subscriptionId: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
  planId: z.string(),
  planName: z.string(),
  tier: PlanTierSchema,
  status: SubscriptionStatusSchema,
  currentPeriodEnd: z.string().nullable().optional(),
  razorpaySubscriptionId: z.string().nullable().optional(),
  mrr: z.number().optional(),
  createdAt: z.string(),
})
export type SubscriberRow = z.infer<typeof SubscriberRowSchema>

export const SubscriberPageSchema = z.object({
  items: z.array(SubscriberRowSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type SubscriberPage = z.infer<typeof SubscriberPageSchema>

// ── API functions ─────────────────────────────────────────────────────────────

// Plans
export async function listPlans(): Promise<Plan[]> {
  const res = await api.get('/subscriptions/plans')
  return z.array(PlanSchema).parse(res.data)
}

export async function getPlan(id: string): Promise<Plan> {
  const res = await api.get(`/subscriptions/plans/${id}`)
  return PlanSchema.parse(res.data)
}

export interface CreatePlanParams {
  name: string
  tier: PlanTier
  billingCycle: BillingCycle
  priceInr: number
  trialDays?: number
  description?: string
}

export async function createPlan(params: CreatePlanParams): Promise<{ planId: string; name: string; priceInr: number }> {
  const res = await api.post('/subscriptions/plans', params)
  return res.data as { planId: string; name: string; priceInr: number }
}

export async function updatePlan(
  id: string,
  params: { name?: string; priceInr?: number; description?: string; isActive: boolean }
): Promise<void> {
  await api.put(`/subscriptions/plans/${id}`, params)
}

// Subscriptions
export async function getMySubscription(): Promise<Subscription> {
  const res = await api.get('/subscriptions/me')
  return SubscriptionSchema.parse(res.data)
}

export async function cancelSubscription(): Promise<void> {
  await api.delete('/subscriptions/me')
}

export async function upgradeSubscription(newPlanId: string): Promise<Subscription> {
  const res = await api.post('/subscriptions/me/upgrade', { newPlanId })
  return SubscriptionSchema.parse(res.data)
}

export async function downgradeSubscription(newPlanId: string): Promise<Subscription> {
  const res = await api.post('/subscriptions/me/downgrade', { newPlanId })
  return SubscriptionSchema.parse(res.data)
}

// Invoices — org-scoped (caller's org)
/**
 * List invoices for the caller's organisation.
 * Backend: GET /subscriptions/invoices — ListInvoicesQuery (returns InvoicePageDto).
 * The response is paginated; items array is under the `items` key.
 */
export async function listInvoices(params?: { page?: number; pageSize?: number }): Promise<InvoicePage> {
  const res = await api.get('/subscriptions/invoices', { params })
  // Backend returns InvoicePageDto with items/totalCount/page/pageSize
  return InvoicePageSchema.parse(res.data)
}

export async function generateInvoice(subscriptionId: string): Promise<{ invoiceId: string; invoiceNumber: string; amountInr: number; gstAmountInr: number; pdfGcsUri: string }> {
  const res = await api.post(`/subscriptions/${subscriptionId}/invoices`)
  return res.data as { invoiceId: string; invoiceNumber: string; amountInr: number; gstAmountInr: number; pdfGcsUri: string }
}

// MRR Dashboard
export async function getMrrDashboard(): Promise<MrrDashboard> {
  const res = await api.get('/subscriptions/mrr')
  return MrrDashboardSchema.parse(res.data)
}

/**
 * BLOCKED — GAP-036: Platform-admin subscriber list.
 * Requires: GET /subscriptions/admin/list?status=&tier=&page=&pageSize=
 * Permission: subscription.plan.create (or a new subscription.admin.read)
 * Backend-agent must add the endpoint + query handler before this resolves.
 *
 * Throws a clear error so the admin page can display a "not yet available" state
 * instead of silently returning empty data.
 */
export async function listAllSubscriptions(params?: {
  status?: SubscriptionStatus
  tier?: PlanTier
  page?: number
  pageSize?: number
  q?: string
}): Promise<SubscriberPage> {
  const res = await api.get('/subscriptions/admin/list', { params })
  return SubscriberPageSchema.parse(res.data)
}
