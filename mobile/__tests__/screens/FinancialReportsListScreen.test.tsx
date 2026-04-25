/**
 * Smoke tests — FinancialReportsListScreen
 * Phase 6A
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: { sections: [], generatedAt: new Date().toISOString() } })),
  },
  default: {
    get: jest.fn(() => Promise.resolve({ data: { sections: [] } })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'test-user', organizationId: 'org-test' },
    isAuthenticated: true,
  }),
}));

import { FinancialReportsListScreen } from '../../src/screens/home/FinancialReportsListScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('FinancialReportsListScreen', () => {
  it('renders without crashing and shows title', () => {
    const { getByText } = render(
      <Wrapper>
        <FinancialReportsListScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(getByText('mobile.reports.title')).toBeTruthy();
  });

  it('shows Profit & Loss report card', () => {
    const { getByText } = render(
      <Wrapper>
        <FinancialReportsListScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(getByText('Profit & Loss')).toBeTruthy();
  });

  it('shows Trial Balance report card', () => {
    const { getByText } = render(
      <Wrapper>
        <FinancialReportsListScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(getByText('Trial Balance')).toBeTruthy();
  });
});
