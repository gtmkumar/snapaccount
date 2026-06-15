/**
 * NotificationCenterScreen — S3 polish (board #26): shaped skeleton while
 * loading, designed empty state, recoverable error state with retry, and
 * brand-tinted pull-to-refresh. All copy via t().
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn(() =>
  Promise.resolve({ data: { items: [], totalCount: 0, unreadCount: 0 } }),
);

jest.mock('../../src/lib/api', () => {
  const mockClient = { get: (...args: unknown[]) => mockApiGet(...(args as [])) };
  return { __esModule: true, default: mockClient, apiClient: mockClient };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

import { NotificationCenterScreen } from '../../src/screens/notifications/NotificationCenterScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('NotificationCenterScreen — S3 states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: { items: [], totalCount: 0, unreadCount: 0 } });
  });

  it('shows a row-shaped skeleton while loading (no spinner)', () => {
    mockApiGet.mockReturnValue(new Promise(() => undefined) as never); // never resolves
    const { getByTestId } = render(
      <Wrapper>
        <NotificationCenterScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(getByTestId('notif-skeleton', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows the designed empty state when there are no notifications', async () => {
    const { findByTestId, getByText } = render(
      <Wrapper>
        <NotificationCenterScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(await findByTestId('notif-empty-state')).toBeTruthy();
    expect(getByText('mobile.notifications.empty.title')).toBeTruthy();
    expect(getByText('mobile.notifications.empty.body')).toBeTruthy();
  });

  it('shows a recoverable error state and retry re-fetches', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network'));
    const { findByTestId } = render(
      <Wrapper>
        <NotificationCenterScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    const retry = await findByTestId('notif-error-state-retry');
    mockApiGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 'n1',
            title: 'GST due',
            body: 'GSTR-3B due in 3 days',
            type: 'gst',
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
        totalCount: 1,
        unreadCount: 1,
      },
    });
    fireEvent.press(retry);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
  });

  it('renders notification rows after load', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 'n1',
            title: 'GST due',
            body: 'GSTR-3B due in 3 days',
            type: 'gst',
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
        totalCount: 1,
        unreadCount: 1,
      },
    });
    const { findByText } = render(
      <Wrapper>
        <NotificationCenterScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(await findByText('GST due')).toBeTruthy();
  });

  it('all header copy is translated (no hardcoded English)', () => {
    const { getByText } = render(
      <Wrapper>
        <NotificationCenterScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(getByText('mobile.notifications.title')).toBeTruthy();
    expect(getByText('mobile.notifications.markAll')).toBeTruthy();
  });
});
