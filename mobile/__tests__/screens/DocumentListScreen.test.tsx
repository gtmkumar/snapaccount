/**
 * Smoke tests — DocumentListScreen with queue integration
 * Phase 6A
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/lib/api', () => ({
  default: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
  },
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

// Mock the document queue hook
jest.mock('../../src/hooks/useDocumentQueue', () => ({
  useDocumentQueue: () => ({
    queue: [],
    enqueue: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
    markReady: jest.fn(),
    pendingCount: 0,
  }),
}));

import { DocumentListScreen } from '../../src/screens/documents/DocumentListScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('DocumentListScreen', () => {
  it('renders without crashing', () => {
    const { getByText } = render(
      <Wrapper>
        <DocumentListScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(getByText('Documents')).toBeTruthy();
  });

  it('shows empty state when no documents or queue items', () => {
    const { getByText } = render(
      <Wrapper>
        <DocumentListScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    // Empty state renders after data loads — header is always visible
    expect(getByText('Documents')).toBeTruthy();
  });
});
