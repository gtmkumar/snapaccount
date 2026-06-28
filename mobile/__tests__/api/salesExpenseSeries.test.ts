/**
 * getSalesExpenseSeries — unit tests (DG-DASH-04 / D1.2).
 *
 * The Home "Financial Overview" chart has no dedicated backend endpoint; it
 * reuses GET /accounting/reports/comparative (12 monthly base-FY rows) and folds
 * them into month / quarter granularities. These tests lock that mapping:
 *   - 'month'   → 12 monthly rows passed through.
 *   - 'quarter' → folded into Q1..Q4 (3 months each).
 *   - empty FY  → periods:[] so the caller renders an empty state, not a flat chart.
 *
 * Mock pattern matches __tests__/api/documents.test.ts.
 */

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../../src/lib/api';
import { getSalesExpenseSeries } from '../../src/api/accounting';

const mockGet = apiClient.get as jest.Mock;

const MONTH_LABELS = [
  'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
  'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar',
];

/** A comparative response with non-zero monthly revenue/expense/profit. */
function comparativeWithData() {
  const ramp = (base: number) => MONTH_LABELS.map((_, i) => base * (i + 1));
  return {
    data: {
      orgId: 'org1',
      baseYear: 2026,
      priorYear: 2025,
      labels: MONTH_LABELS,
      baseRevenue: ramp(100),
      priorRevenue: ramp(50),
      baseExpense: ramp(40),
      priorExpense: ramp(30),
      baseProfit: ramp(60),
      priorProfit: ramp(20),
      yoYRevenueGrowth: [],
      moMBaseRevenue: [],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getSalesExpenseSeries', () => {
  it("month granularity returns the 12 monthly base-FY rows", async () => {
    mockGet.mockResolvedValue(comparativeWithData());

    const res = await getSalesExpenseSeries({
      organizationId: 'org1',
      granularity: 'month',
      fiscalYear: '2026',
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/accounting/reports/comparative',
      { params: { orgId: 'org1', baseYear: 2026, priorYear: 2025 } },
    );
    expect(res.granularity).toBe('month');
    expect(res.periods).toHaveLength(12);
    expect(res.periods[0]).toMatchObject({ label: 'Apr', revenue: 100, expenses: 40 });
    expect(res.periods[11]).toMatchObject({ label: 'Mar', revenue: 1200 });
  });

  it('quarter granularity folds 12 months into Q1..Q4 (3 months each)', async () => {
    mockGet.mockResolvedValue(comparativeWithData());

    const res = await getSalesExpenseSeries({
      organizationId: 'org1',
      granularity: 'quarter',
      fiscalYear: '2026',
    });

    expect(res.periods.map((p) => p.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    // Q1 = Apr+May+Jun revenue = 100 + 200 + 300 = 600.
    expect(res.periods[0].revenue).toBe(600);
    // Q1 expenses = 40 + 80 + 120 = 240.
    expect(res.periods[0].expenses).toBe(240);
  });

  it('returns an empty series when the FY has no data (all-zero)', async () => {
    mockGet.mockResolvedValue({
      data: {
        orgId: 'org1',
        baseYear: 2026,
        priorYear: 2025,
        labels: MONTH_LABELS,
        baseRevenue: MONTH_LABELS.map(() => 0),
        priorRevenue: MONTH_LABELS.map(() => 0),
        baseExpense: MONTH_LABELS.map(() => 0),
        priorExpense: MONTH_LABELS.map(() => 0),
        baseProfit: MONTH_LABELS.map(() => 0),
        priorProfit: MONTH_LABELS.map(() => 0),
        yoYRevenueGrowth: [],
        moMBaseRevenue: [],
      },
    });

    const res = await getSalesExpenseSeries({
      organizationId: 'org1',
      granularity: 'month',
    });

    expect(res.periods).toEqual([]);
  });
});
