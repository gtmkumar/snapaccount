/**
 * Smoke tests — CallbackStatusScreen
 * Phase 6E
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
  default: {
    get: jest.fn(() => Promise.resolve({ data: null })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { CallbackStatusScreen } from '../../src/screens/callbacks/CallbackStatusScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  popToTop: jest.fn(),
  replace: jest.fn(),
} as never;

const mockRoute = {
  params: { callbackId: 'test-callback-uuid-123' },
} as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('CallbackStatusScreen', () => {
  it('renders loading state without crashing', () => {
    const { getByText } = render(
      <Wrapper>
        <CallbackStatusScreen navigation={mockNavigation} route={mockRoute} />
      </Wrapper>,
    );
    // Header is rendered immediately
    expect(getByText('mobile.callback.status.title')).toBeTruthy();
  });
});
