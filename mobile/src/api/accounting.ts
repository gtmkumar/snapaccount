/**
 * Accounting Service API — typed client functions
 * Endpoint contract: docs/api/endpoints.md §AccountingService
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ReportType = 'profit-and-loss' | 'balance-sheet' | 'trial-balance';

export interface ReportAccount {
  code: string;
  name: string;
  balance: number;
  debitTotal?: number;
  creditTotal?: number;
}

export interface ReportSection {
  name: string;
  accounts: ReportAccount[];
  total: number;
}

export interface FinancialReport {
  type: ReportType;
  organizationId: string;
  fiscalYear: string;
  periodMonth?: number;
  sections: ReportSection[];
  /** P&L only */
  netProfit?: number;
  /** Balance sheet only */
  totalAssets?: number;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

export async function getFinancialReport(
  type: ReportType,
  params: {
    organizationId: string;
    fiscalYear: string;
    periodMonth?: number;
  },
): Promise<FinancialReport> {
  const res = await apiClient.get<FinancialReport>(`/accounting/reports/${type}`, {
    params,
  });
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wave 7 — GAP-044 comparative (YoY / MoM)
// RECONCILED 2026-06-12 against docs/api/endpoints.md "Wave 7B → GAP-044" and
// AccountingService GetComparativeAnalysisQuery:
//   GET /accounting/reports/comparative?orgId&baseYear&priorYear&categoryFilter
//   → { orgId, baseYear, priorYear, labels[12 Apr–Mar], baseRevenue[],
//       priorRevenue[], baseExpense[], priorExpense[], baseProfit[],
//       priorProfit[], yoYRevenueGrowth[], moMBaseRevenue[], topMovers[] }
// The mobile chart consumes a period-row mapping of that response:
//   MoM  → 12 monthly rows of the base FY.
//   YoY  → 2 aggregate rows (prior FY vs base FY totals).
// ─────────────────────────────────────────────────────────────────────────────

export type ComparativeGranularity = 'month' | 'year';

export interface ComparativePeriod {
  /** "Apr" / "FY 2025-26" display label. */
  label: string;
  /** Period key for stable ordering. */
  periodKey: string;
  revenue: number;
  expenses: number;
  netProfit: number;
}

export interface ComparativeReport {
  organizationId: string;
  granularity: ComparativeGranularity;
  periods: ComparativePeriod[];
  generatedAt: string;
}

interface ComparativeAnalysisResponse {
  orgId: string;
  baseYear: number;
  priorYear: number;
  labels: string[];
  baseRevenue: number[];
  priorRevenue: number[];
  baseExpense: number[];
  priorExpense: number[];
  baseProfit: number[];
  priorProfit: number[];
  yoYRevenueGrowth: (number | null)[];
  moMBaseRevenue: (number | null)[];
}

const sum = (xs: number[] | undefined) => (xs ?? []).reduce((a, b) => a + b, 0);
const fyLabel = (startYear: number) =>
  `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

/** GET /accounting/reports/comparative — chart-friendly mapping (see header). */
export async function getComparativeReport(params: {
  organizationId: string;
  granularity: ComparativeGranularity;
  /** Indian-FY start year, e.g. "2026" for FY 2026-27. */
  fiscalYear?: string;
}): Promise<ComparativeReport> {
  const baseYear = parseInt(params.fiscalYear ?? '', 10) || new Date().getFullYear();
  const res = await apiClient.get<ComparativeAnalysisResponse>(
    '/accounting/reports/comparative',
    { params: { orgId: params.organizationId, baseYear, priorYear: baseYear - 1 } },
  );
  const d = res.data;

  const periods: ComparativePeriod[] =
    params.granularity === 'month'
      ? (d.labels ?? []).map((label, i) => ({
          label,
          periodKey: `m-${i}`,
          revenue: d.baseRevenue?.[i] ?? 0,
          expenses: d.baseExpense?.[i] ?? 0,
          netProfit: d.baseProfit?.[i] ?? 0,
        }))
      : [
          {
            label: fyLabel(d.priorYear ?? baseYear - 1),
            periodKey: `fy-${d.priorYear ?? baseYear - 1}`,
            revenue: sum(d.priorRevenue),
            expenses: sum(d.priorExpense),
            netProfit: sum(d.priorProfit),
          },
          {
            label: fyLabel(d.baseYear ?? baseYear),
            periodKey: `fy-${d.baseYear ?? baseYear}`,
            revenue: sum(d.baseRevenue),
            expenses: sum(d.baseExpense),
            netProfit: sum(d.baseProfit),
          },
        ];

  // MoM with an entirely empty FY (all zero) renders as empty-state.
  const hasData = periods.some(
    (p) => p.revenue !== 0 || p.expenses !== 0 || p.netProfit !== 0,
  );

  return {
    organizationId: d.orgId ?? params.organizationId,
    granularity: params.granularity,
    periods: hasData ? periods : [],
    generatedAt: new Date().toISOString(),
  };
}
