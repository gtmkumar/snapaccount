/**
 * BillingScreen — Task #18 (GAP-060rem).
 * Covers: loading → plan + invoices render, no-subscription empty state,
 * and 5xx error state with retry (backend may be mid-fix).
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMySubscription = jest.fn();
const mockListInvoices = jest.fn();

jest.mock('../../src/api/subscriptions', () => ({
  getMySubscription: () => mockGetMySubscription(),
  listInvoices: (...args: unknown[]) => mockListInvoices(...(args as [])),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { BillingScreen } from '../../src/screens/profile/BillingScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

const subscription = {
  subscriptionId: 's-1',
  planId: 'p-1',
  planName: 'Growth',
  planTier: 'GROWTH',
  billingCycle: 'Monthly',
  priceInr: 999,
  status: 'Active',
  currentPeriodStart: '2026-06-01T00:00:00Z',
  currentPeriodEnd: '2026-07-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

const invoicePage = {
  items: [
    {
      invoiceId: 'i-1',
      subscriptionId: 's-1',
      invoiceNumber: 'INV-2026-001',
      amountInr: 999,
      gstAmountInr: 179.82,
      totalInr: 1178.82,
      status: 'Paid',
      periodStart: '2026-05-01T00:00:00Z',
      periodEnd: '2026-06-01T00:00:00Z',
      paidAt: '2026-05-02T00:00:00Z',
      pdfGcsUri: null,
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 20,
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BillingScreen', () => {
  it('renders current plan and invoices', async () => {
    mockGetMySubscription.mockResolvedValue(subscription);
    mockListInvoices.mockResolvedValue(invoicePage);

    const { findByText, getByTestId } = render(
      <BillingScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(await findByText('Growth')).toBeTruthy();
    expect(getByTestId('invoice-INV-2026-001')).toBeTruthy();
  });

  it('renders no-subscription state when API returns null', async () => {
    mockGetMySubscription.mockResolvedValue(null);
    mockListInvoices.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20 });

    const { findByText } = render(<BillingScreen navigation={mockNavigation} />, {
      wrapper: makeWrapper(),
    });

    expect(await findByText('mobile.billing.noPlan.title')).toBeTruthy();
    expect(await findByText('mobile.billing.invoicesEmpty')).toBeTruthy();
  });

  it('renders error state with retry on 5xx and refetches on retry', async () => {
    mockGetMySubscription.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );
    mockListInvoices.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );

    const { findByText, getByLabelText } = render(
      <BillingScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(await findByText('mobile.billing.error.title')).toBeTruthy();

    mockGetMySubscription.mockResolvedValue(subscription);
    mockListInvoices.mockResolvedValue(invoicePage);
    fireEvent.press(getByLabelText('mobile.common.retry'));

    await waitFor(() => expect(mockGetMySubscription).toHaveBeenCalledTimes(2));
    expect(await findByText('Growth')).toBeTruthy();
  });
});
