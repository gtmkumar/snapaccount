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
