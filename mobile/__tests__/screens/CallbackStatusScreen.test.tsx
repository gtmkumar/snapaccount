/**
 * Smoke tests — CallbackStatusScreen
 * Phase 6E · AND-15 category-label regression (live Android sweep 2026-06-11)
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn(() => Promise.resolve({ data: null as unknown }));

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...(args as [])),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
  default: {
    get: (...args: unknown[]) => mockApiGet(...(args as [])),
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

const baseCallback = {
  id: 'test-callback-uuid-123',
  userId: 'user-1',
  status: 'Pending',
  category: 'Gst',
  priority: 'Normal',
  phoneNumber: '+919000000009',
  issueDescription: 'Need help with GSTR-3B',
  notes: [],
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
};

describe('CallbackStatusScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: null });
  });

  it('renders loading state without crashing', () => {
    const { getByText } = render(
      <Wrapper>
        <CallbackStatusScreen navigation={mockNavigation} route={mockRoute} />
      </Wrapper>,
    );
    // Header is rendered immediately
    expect(getByText('mobile.callback.status.title')).toBeTruthy();
  });

  // AND-15: backend serializes CallbackCategory as the enum's numeric value
  // in some payloads — the screen must render a localized label, never "1".
  it('maps a numeric category ID to the localized category label', async () => {
    mockApiGet.mockResolvedValue({ data: { ...baseCallback, category: 1 } });

    const { findByText, queryByText } = render(
      <Wrapper>
        <CallbackStatusScreen navigation={mockNavigation} route={mockRoute} />
      </Wrapper>,
    );

    expect(await findByText('mobile.callback.status.category.gst')).toBeTruthy();
    expect(queryByText('1')).toBeNull();
  });

  it('maps a string category name to the localized category label', async () => {
    mockApiGet.mockResolvedValue({ data: { ...baseCallback, category: 'Technical' } });

    const { findByText } = render(
      <Wrapper>
        <CallbackStatusScreen navigation={mockNavigation} route={mockRoute} />
      </Wrapper>,
    );

    expect(await findByText('mobile.callback.status.category.technical')).toBeTruthy();
  });

  it('falls back to the raw value for unknown future categories', async () => {
    mockApiGet.mockResolvedValue({ data: { ...baseCallback, category: 'NewThing' } });

    const { findByText } = render(
      <Wrapper>
        <CallbackStatusScreen navigation={mockNavigation} route={mockRoute} />
      </Wrapper>,
    );

    expect(await findByText('NewThing')).toBeTruthy();
  });
});
