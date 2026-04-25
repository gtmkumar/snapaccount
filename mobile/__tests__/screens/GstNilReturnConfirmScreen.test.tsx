/**
 * Smoke tests — GstNilReturnConfirmScreen
 * Phase 6B
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: { ackNumber: 'ACK123', filedAt: '2025-07-31' } })),
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

jest.mock('../../src/hooks/usePreventScreenCapture', () => ({
  useSensitiveScreen: jest.fn(),
}));

jest.mock('../../src/api/gst', () => ({
  fileNilReturn: jest.fn(() => Promise.resolve({ ackNumber: 'ACK123', filedAt: '2025-07-31' })),
  getGstReturn: jest.fn(() => Promise.resolve(null)),
}));

import { GstNilReturnConfirmScreen } from '../../src/screens/gst/GstNilReturnConfirmScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  popToTop: jest.fn(),
} as never;

const mockRoute = {
  params: { returnId: 'ret-123', period: 'Jul 2025', gstin: '27AABCU9603R1ZM' },
} as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('GstNilReturnConfirmScreen', () => {
  it('renders header without crashing', () => {
    const { getByText } = render(
      <Wrapper>
        <GstNilReturnConfirmScreen navigation={mockNavigation} route={mockRoute} />
      </Wrapper>,
    );
    expect(getByText('mobile.gst.nilReturn.title')).toBeTruthy();
  });

  it('renders file CTA button', () => {
    const { getByText } = render(
      <Wrapper>
        <GstNilReturnConfirmScreen navigation={mockNavigation} route={mockRoute} />
      </Wrapper>,
    );
    expect(getByText('mobile.gst.nilReturn.fileCta')).toBeTruthy();
  });
});
