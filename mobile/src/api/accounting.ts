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

// ─────────────────────────────────────────────────────────────────────────────
// DG-DASH-04 — Home "Financial Overview" Sales-vs-Expense series (D1.2)
// The Home chart needs a monthly sales-vs-expense time-series. There is no
// dedicated GET /accounting/sales-expense-trend endpoint; the only real
// time-series source today is GET /accounting/reports/comparative (already
// mapped by getComparativeReport above into 12 monthly base-FY rows). This
// helper reuses that mapping and exposes the two granularities D1.2 calls for:
//   'month'   → the 12 monthly rows of the current FY (Apr…Mar).
//   'quarter' → the 12 monthly rows folded into Q1…Q4 (Apr-Jun, …, Jan-Mar).
// netProfit is preserved so the shared ComparativeBarChart can render all three
// series; the Home section uses revenue/expenses + the salesTrend label.
// ─────────────────────────────────────────────────────────────────────────────

export type OverviewGranularity = 'month' | 'quarter';

export interface SalesExpenseSeries {
  organizationId: string;
  granularity: OverviewGranularity;
  /** Chart-ready rows (reuses the ComparativeBarChart ComparativePeriod shape). */
  periods: ComparativePeriod[];
  generatedAt: string;
}

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

/** Folds 12 Indian-FY monthly rows (Apr=0 … Mar=11) into 4 calendar quarters. */
function foldToQuarters(monthly: ComparativePeriod[]): ComparativePeriod[] {
  const quarters: ComparativePeriod[] = QUARTER_LABELS.map((label, q) => ({
    label,
    periodKey: `q-${q}`,
    revenue: 0,
    expenses: 0,
    netProfit: 0,
  }));
  monthly.forEach((m, i) => {
    const q = Math.min(3, Math.floor(i / 3));
    quarters[q].revenue += m.revenue;
    quarters[q].expenses += m.expenses;
    quarters[q].netProfit += m.netProfit;
  });
  return quarters;
}

/**
 * Fetches a monthly (or quarterly) sales-vs-expense series for the Home
 * "Financial Overview" chart. Built on getComparativeReport (monthly base-FY)
 * so no new backend endpoint is required.
 *
 * Returns `periods: []` when the FY has no data (lets the caller render an
 * empty-state instead of a flat all-zero chart).
 */
export async function getSalesExpenseSeries(params: {
  organizationId: string;
  granularity: OverviewGranularity;
  /** Indian-FY start year, e.g. "2026" for FY 2026-27. */
  fiscalYear?: string;
}): Promise<SalesExpenseSeries> {
  const comparative = await getComparativeReport({
    organizationId: params.organizationId,
    granularity: 'month',
    fiscalYear: params.fiscalYear,
  });

  // getComparativeReport returns [] when the FY is entirely empty.
  const monthly = comparative.periods;
  const periods =
    monthly.length === 0
      ? []
      : params.granularity === 'quarter'
        ? foldToQuarters(monthly)
        : monthly;

  return {
    organizationId: comparative.organizationId,
    granularity: params.granularity,
    periods,
    generatedAt: comparative.generatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DG-DASH-03 — Report Detail rows
// The mobile Report Detail screen renders a flat label/amount row list. The
// backend GET /accounting/reports/{type} returns a DIFFERENT JSON shape per
// report type (camelCase, JsonSerializerDefaults.Web):
//   trial-balance   → { lines:[{accountCode,accountName,balance,totalDebit,totalCredit}], totalDebits, totalCredits }
//   profit-and-loss → { incomeLines:[{accountCode,accountName,amount}], expenseLines:[…], totalIncome, totalExpenses, netProfit }
//   balance-sheet   → { assetLines:[…], liabilityLines:[…], equityLines:[…], totalAssets, totalLiabilities, totalEquity }
//   tax-liability   → { outputIgst, outputCgst, …, netIgst, netCgst, netSgst, totalNetTaxLiability }
// orgId / fyYear are derived server-side from the auth token + ?fyYear=.
// getReportRows() normalises each into a single ReportRow[] for the screen.
// ─────────────────────────────────────────────────────────────────────────────

/** The 4 backend-canonical report slugs that GET /accounting/reports/{type} accepts directly. */
export type ReportDetailType =
  | 'trial-balance'
  | 'profit-and-loss'
  | 'balance-sheet'
  | 'tax-liability';

/** A single rendered row in the Report Detail list. */
export interface ReportRow {
  label: string;
  amount: number;
  /** Bold separator row (a sub-total / grand total). */
  isTotal?: boolean;
  /** Tinted + signed/coloured row (e.g. Net Profit / Net tax payable). */
  isHighlighted?: boolean;
}

export interface ReportRowsResult {
  type: ReportDetailType;
  rows: ReportRow[];
}

/** Backend DTO shapes (camelCase) — only the fields the row mapping consumes. */
interface TrialBalanceResponse {
  lines: { accountCode: string; accountName: string; balance: number }[];
  totalDebits: number;
  totalCredits: number;
}
interface ProfitAndLossResponse {
  incomeLines: { accountCode: string; accountName: string; amount: number }[];
  expenseLines: { accountCode: string; accountName: string; amount: number }[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}
interface BalanceSheetResponse {
  assetLines: { accountCode: string; accountName: string; balance: number }[];
  liabilityLines: { accountCode: string; accountName: string; balance: number }[];
  equityLines: { accountCode: string; accountName: string; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}
interface TaxLiabilityResponse {
  outputIgst: number;
  outputCgst: number;
  outputSgst: number;
  inputIgst: number;
  inputCgst: number;
  inputSgst: number;
  netIgst: number;
  netCgst: number;
  netSgst: number;
  totalNetTaxLiability: number;
}

/**
 * Maps a FinancialReportsList card slug to the backend report slug, or `null`
 * if the slug has no GET /accounting/reports/{type} report (handled by the
 * caller as an unsupported/coming-soon state).
 *
 * - 'pnl'        → 'profit-and-loss'  (UI alias the backend switch does not know)
 * - 'cash-flow'  → null  (no backend cash-flow report exists yet)
 * - 'ledger'     → null  (needs an accountId; not reachable from a type-only route)
 * - 'comparative'/'forecast' → null  (own screens / not implemented)
 */
export function normalizeReportSlug(slug: string): ReportDetailType | null {
  switch (slug) {
    case 'pnl':
    case 'profit-and-loss':
      return 'profit-and-loss';
    case 'trial-balance':
      return 'trial-balance';
    case 'balance-sheet':
      return 'balance-sheet';
    case 'tax-liability':
      return 'tax-liability';
    default:
      return null;
  }
}

function mapTrialBalance(d: TrialBalanceResponse): ReportRow[] {
  const rows: ReportRow[] = (d.lines ?? []).map((l) => ({
    label: `${l.accountName} (${l.accountCode})`,
    amount: l.balance,
  }));
  rows.push({ label: 'Total Debits', amount: d.totalDebits, isTotal: true });
  rows.push({ label: 'Total Credits', amount: d.totalCredits, isTotal: true });
  return rows;
}

function mapProfitAndLoss(d: ProfitAndLossResponse): ReportRow[] {
  const rows: ReportRow[] = [];
  (d.incomeLines ?? []).forEach((l) =>
    rows.push({ label: `${l.accountName} (${l.accountCode})`, amount: l.amount }),
  );
  rows.push({ label: 'Total Income', amount: d.totalIncome, isTotal: true });
  (d.expenseLines ?? []).forEach((l) =>
    rows.push({ label: `${l.accountName} (${l.accountCode})`, amount: l.amount }),
  );
  rows.push({ label: 'Total Expenses', amount: d.totalExpenses, isTotal: true });
  rows.push({ label: 'Net Profit / Loss', amount: d.netProfit, isTotal: true, isHighlighted: true });
  return rows;
}

function mapBalanceSheet(d: BalanceSheetResponse): ReportRow[] {
  const rows: ReportRow[] = [];
  (d.assetLines ?? []).forEach((l) =>
    rows.push({ label: `${l.accountName} (${l.accountCode})`, amount: l.balance }),
  );
  rows.push({ label: 'Total Assets', amount: d.totalAssets, isTotal: true });
  (d.liabilityLines ?? []).forEach((l) =>
    rows.push({ label: `${l.accountName} (${l.accountCode})`, amount: l.balance }),
  );
  rows.push({ label: 'Total Liabilities', amount: d.totalLiabilities, isTotal: true });
  (d.equityLines ?? []).forEach((l) =>
    rows.push({ label: `${l.accountName} (${l.accountCode})`, amount: l.balance }),
  );
  rows.push({ label: 'Total Equity', amount: d.totalEquity, isTotal: true });
  return rows;
}

function mapTaxLiability(d: TaxLiabilityResponse): ReportRow[] {
  return [
    { label: 'Output IGST', amount: d.outputIgst },
    { label: 'Output CGST', amount: d.outputCgst },
    { label: 'Output SGST', amount: d.outputSgst },
    { label: 'Input IGST', amount: d.inputIgst },
    { label: 'Input CGST', amount: d.inputCgst },
    { label: 'Input SGST', amount: d.inputSgst },
    { label: 'Net IGST', amount: d.netIgst, isTotal: true },
    { label: 'Net CGST', amount: d.netCgst, isTotal: true },
    { label: 'Net SGST', amount: d.netSgst, isTotal: true },
    {
      label: 'Net Tax Payable',
      amount: d.totalNetTaxLiability,
      isTotal: true,
      isHighlighted: true,
    },
  ];
}

/**
 * Fetches a financial report from GET /accounting/reports/{type} and normalises
 * the per-type backend DTO into a flat ReportRow[] for the Report Detail screen.
 *
 * @param type   A backend-canonical slug (run user input through
 *               {@link normalizeReportSlug} first).
 * @param params fyYear is sent as the `fyYear` query param (the only param the
 *               backend reads for these reports; org is taken from the token).
 */
export async function getReportRows(
  type: ReportDetailType,
  params: { fyYear: number; periodMonth?: number },
): Promise<ReportRowsResult> {
  const res = await apiClient.get(`/accounting/reports/${type}`, {
    params: { fyYear: params.fyYear, periodMonth: params.periodMonth },
  });
  const data = res.data;

  let rows: ReportRow[];
  switch (type) {
    case 'trial-balance':
      rows = mapTrialBalance(data as TrialBalanceResponse);
      break;
    case 'profit-and-loss':
      rows = mapProfitAndLoss(data as ProfitAndLossResponse);
      break;
    case 'balance-sheet':
      rows = mapBalanceSheet(data as BalanceSheetResponse);
      break;
    case 'tax-liability':
      rows = mapTaxLiability(data as TaxLiabilityResponse);
      break;
  }

  return { type, rows };
}
