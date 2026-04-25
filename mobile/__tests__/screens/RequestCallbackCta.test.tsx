/**
 * Smoke tests — RequestCallbackCta component
 * Phase 6E
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock axios to prevent real network calls
jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: { items: [], totalCount: 0 } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
  default: {
    get: jest.fn(() => Promise.resolve({ data: { items: [], totalCount: 0 } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}(${JSON.stringify(opts)})`;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

import { RequestCallbackCta } from '../../src/components/callbacks/RequestCallbackCta';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('RequestCallbackCta', () => {
  const mockNavigateToModal = jest.fn();
  const mockNavigateToStatus = jest.fn();

  it('renders card variant without crashing', () => {
    const { getByTestId } = render(
      <Wrapper>
        <RequestCallbackCta
          variant="card"
          category="GST"
          onNavigateToModal={mockNavigateToModal}
          onNavigateToStatus={mockNavigateToStatus}
          testID="callback-cta"
        />
      </Wrapper>,
    );
    expect(getByTestId('callback-cta')).toBeTruthy();
  });

  it('renders bottom-sheet variant without crashing', () => {
    const { getByTestId } = render(
      <Wrapper>
        <RequestCallbackCta
          variant="bottomSheet"
          category="ITR"
          onNavigateToModal={mockNavigateToModal}
          onNavigateToStatus={mockNavigateToStatus}
          testID="callback-cta-sheet"
        />
      </Wrapper>,
    );
    expect(getByTestId('callback-cta-sheet')).toBeTruthy();
  });

  it('renders offline state without crashing', () => {
    const { getByTestId } = render(
      <Wrapper>
        <RequestCallbackCta
          variant="card"
          category="LOAN"
          onNavigateToModal={mockNavigateToModal}
          onNavigateToStatus={mockNavigateToStatus}
          isOnline={false}
          testID="callback-cta-offline"
        />
      </Wrapper>,
    );
    expect(getByTestId('callback-cta-offline')).toBeTruthy();
  });
});
