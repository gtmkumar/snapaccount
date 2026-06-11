/**
 * Subscriptions API — current plan + invoices for the caller's organisation.
 * Task #18 (GAP-060rem): backs the ProfileScreen → Billing screen.
 *
 * Endpoints (SubscriptionService, routed via SERVICE_PORTS '/subscription'):
 *   GET /subscriptions/me        — active subscription (SubscriptionDto | null body)
 *   GET /subscriptions/invoices  — paginated invoice list (InvoicePageDto)
 *
 * NOTE: backend may be mid-fix (Razorpay metering landed in Wave 2) — every
 * caller must surface 4xx/5xx through a visible error state, not swallow it.
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror SubscriptionService.Application DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface SubscriptionDto {
  subscriptionId: string;
  planId: string;
  planName: string;
  planTier: string;
  billingCycle: string;
  priceInr: number;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
}

export interface InvoiceDto {
  invoiceId: string;
  subscriptionId: string;
  invoiceNumber: string;
  amountInr: number;
  gstAmountInr: number;
  totalInr: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt?: string | null;
  pdfGcsUri?: string | null;
}

export interface InvoicePageDto {
  items: InvoiceDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /subscriptions/me — the org's current subscription.
 * Returns null when the org has no subscription yet (free tier) — the
 * backend returns an empty 200 body or 404 depending on handler state.
 */
export async function getMySubscription(): Promise<SubscriptionDto | null> {
  try {
    const res = await apiClient.get<SubscriptionDto | null>('/subscriptions/me');
    // Backend returns Ok(null) for "no subscription" — normalise '' to null.
    return res.data && typeof res.data === 'object' ? res.data : null;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } };
    if (e?.response?.status === 404) return null;
    throw err;
  }
}

/** GET /subscriptions/invoices — paginated invoice history. */
export async function listInvoices(page = 1, pageSize = 20): Promise<InvoicePageDto> {
  const res = await apiClient.get<InvoicePageDto>('/subscriptions/invoices', {
    params: { page, pageSize },
  });
  return res.data;
}
