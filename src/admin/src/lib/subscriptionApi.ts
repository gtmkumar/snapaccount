/**
 * Subscription Service API client — Phase 6F Track F3
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

export const InvoiceSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  amountInr: z.number(),
  gstAmountInr: z.number(),
  status: z.string(),
  paidAt: z.string().nullable().optional(),
})
export type Invoice = z.infer<typeof InvoiceSchema>

export const MrrDashboardSchema = z.object({
  totalMrr: z.number(),
  activeCount: z.number(),
  trialingCount: z.number(),
  pastDueCount: z.number(),
  cancelledCount: z.number(),
})
export type MrrDashboard = z.infer<typeof MrrDashboardSchema>

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

// Invoices
export async function listInvoices(params?: { page?: number; pageSize?: number }): Promise<Invoice[]> {
  const res = await api.get('/subscriptions/invoices', { params })
  return z.array(InvoiceSchema).parse(res.data)
}

export async function generateInvoice(): Promise<{ invoiceId: string; invoiceNumber: string; amountInr: number; gstAmountInr: number; pdfGcsUri: string }> {
  const res = await api.post('/subscriptions/invoices/generate')
  return res.data as { invoiceId: string; invoiceNumber: string; amountInr: number; gstAmountInr: number; pdfGcsUri: string }
}

// MRR Dashboard
export async function getMrrDashboard(): Promise<MrrDashboard> {
  const res = await api.get('/subscriptions/mrr')
  return MrrDashboardSchema.parse(res.data)
}
