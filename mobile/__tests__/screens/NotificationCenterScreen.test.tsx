/**
 * NotificationCenterScreen — Phase 6E enhancements (DG-NOTIF-05).
 *
 * Keeps the S3-polish coverage (skeleton / empty / error+retry / translated
 * header) and adds the Phase 6E assertions: rows render against the Wave 2
 * inbox DTO (status READ|UNREAD, category, sentAt), day-group headers appear,
 * the category filter + "Unread only" toggle re-query, and "Mark all read"
 * calls the real markAllNotificationsRead() API (previously a stub Alert).
 *
 * The screen calls the api/notifications module (not raw apiClient), so we mock
 * that module directly.
 */

import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getNotificationInbox,
  markAllNotificationsRead,
} from '../../src/api/notifications';
import { NotificationCenterScreen } from '../../src/screens/notifications/NotificationCenterScreen';

// jest.mock calls are hoisted above the imports by babel-jest.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/api/notifications', () => ({
  getNotificationInbox: jest.fn(),
  markAllNotificationsRead: jest.fn(() => Promise.resolve({ markedCount: 1 })),
  markNotificationRead: jest.fn(() => Promise.resolve()),
}));

const mockGetInbox = getNotificationInbox as jest.Mock;
const mockMarkAll = markAllNotificationsRead as jest.Mock;

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

const GST_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  eventCode: 'GST_DEADLINE_3_DAYS',
  category: 'GST',
  title: 'GST due',
  body: 'GSTR-3B due in 3 days',
  status: 'UNREAD',
  sentAt: new Date().toISOString(),
  deepLinkUrl: null,
  deepLinkLabel: null,
  linkedEntityType: 'gst',
  linkedEntityId: null,
  linkedEntityLabel: 'GSTR-3B Mar 2026',
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderScreen() {
  return render(
    <Wrapper>
      <NotificationCenterScreen navigation={mockNavigation} />
    </Wrapper>,
  );
}

describe('NotificationCenterScreen — states + Phase 6E', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInbox.mockResolvedValue({ items: [], totalCount: 0, unreadCount: 0 });
  });

  it('shows a row-shaped skeleton while loading (no spinner)', () => {
    mockGetInbox.mockReturnValue(new Promise(() => undefined) as never);
    const { getByTestId } = renderScreen();
    expect(getByTestId('notif-skeleton', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows the designed empty state when there are no notifications', async () => {
    const { findByTestId, getByText } = renderScreen();
    expect(await findByTestId('notif-empty-state')).toBeTruthy();
    expect(getByText('mobile.notifications.empty.title')).toBeTruthy();
    expect(getByText('mobile.notifications.empty.body')).toBeTruthy();
  });

  it('shows a recoverable error state and retry re-fetches', async () => {
    mockGetInbox.mockRejectedValueOnce(new Error('network'));
    const { findByTestId } = renderScreen();
    const retry = await findByTestId('notif-error-state-retry');
    mockGetInbox.mockResolvedValue({ items: [GST_ROW], totalCount: 1, unreadCount: 1 });
    await act(async () => {
      fireEvent.press(retry);
    });
    await waitFor(() => expect(mockGetInbox).toHaveBeenCalledTimes(2));
  });

  it('renders day-grouped notification rows after load', async () => {
    mockGetInbox.mockResolvedValue({ items: [GST_ROW], totalCount: 1, unreadCount: 1 });
    const { findByText, getByTestId, getAllByText } = renderScreen();
    expect(await findByText('GST due')).toBeTruthy();
    expect(getByTestId('notif-row-11111111-1111-1111-1111-111111111111')).toBeTruthy();
    // Today section header from the SectionList grouping.
    expect(getAllByText('mobile.notifications.group.today').length).toBeGreaterThan(0);
  });

  it('Mark all read calls the markAllNotificationsRead API (not a stub Alert)', async () => {
    mockGetInbox.mockResolvedValue({ items: [GST_ROW], totalCount: 1, unreadCount: 1 });
    const { getByLabelText, findByText } = renderScreen();
    // Wait for the loaded state (unreadCount=1) so the button is enabled.
    await findByText('GST due');
    await act(async () => {
      fireEvent.press(getByLabelText('mobile.notifications.markAll'));
    });
    await waitFor(() => expect(mockMarkAll).toHaveBeenCalledTimes(1));
  });

  it('selecting a category chip re-queries with the category param', async () => {
    mockGetInbox.mockResolvedValue({ items: [GST_ROW], totalCount: 1, unreadCount: 1 });
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(mockGetInbox).toHaveBeenCalled());
    await act(async () => {
      fireEvent.press(getByTestId('notif-filter-chips-gst'));
    });
    await waitFor(() =>
      expect(mockGetInbox).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: 'GST' }),
      ),
    );
  });

  it('"Unread only" toggle re-queries with unreadOnly=true', async () => {
    mockGetInbox.mockResolvedValue({ items: [GST_ROW], totalCount: 1, unreadCount: 1 });
    const { getByLabelText } = renderScreen();
    await waitFor(() => expect(mockGetInbox).toHaveBeenCalled());
    await act(async () => {
      fireEvent(
        getByLabelText('mobile.notifications.filter.unreadOnly'),
        'valueChange',
        true,
      );
    });
    await waitFor(() =>
      expect(mockGetInbox).toHaveBeenLastCalledWith(
        expect.objectContaining({ unreadOnly: true }),
      ),
    );
  });

  it('all header copy is translated (no hardcoded English)', () => {
    const { getByText } = renderScreen();
    expect(getByText('mobile.notifications.title')).toBeTruthy();
    expect(getByText('mobile.notifications.markAll')).toBeTruthy();
  });

  it('Mark all read zeroes the unread state immediately while the call is pending', async () => {
    mockGetInbox.mockResolvedValue({ items: [GST_ROW], totalCount: 1, unreadCount: 1 });
    mockMarkAll.mockReturnValue(new Promise(() => undefined) as never); // never settles
    const { getByLabelText, findByText, queryByText } = renderScreen();
    await findByText('GST due');
    expect(queryByText('1')).toBeTruthy(); // unread count badge
    await act(async () => {
      fireEvent.press(getByLabelText('mobile.notifications.markAll'));
    });
    // Server never responds — badge clearing proves the optimistic cache write
    await waitFor(() => expect(queryByText('1')).toBeNull());
  });

  it('rolls back and shows the failure toast when Mark all read fails', async () => {
    mockGetInbox.mockResolvedValue({ items: [GST_ROW], totalCount: 1, unreadCount: 1 });
    mockMarkAll.mockRejectedValue(new Error('boom'));
    const { getByLabelText, findByText, findByTestId, queryByText } = renderScreen();
    await findByText('GST due');
    await act(async () => {
      fireEvent.press(getByLabelText('mobile.notifications.markAll'));
    });
    expect(await findByTestId('notif-error-toast')).toBeTruthy();
    // Rollback (then invalidation refetch) restores the unread badge
    await waitFor(() => expect(queryByText('1')).toBeTruthy());
  });
});
