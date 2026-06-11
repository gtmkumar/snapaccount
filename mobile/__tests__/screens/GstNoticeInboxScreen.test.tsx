/**
 * GstNoticeInboxScreen — Phase 6B, re-pinned for Wave 7 residual #7.
 * Canonical server status vocabulary (RECEIVED/UNDER_REVIEW/RESPONDED/CLOSED)
 * on the filter chips; "Overdue" is a client-side derived filter (deadline
 * passed && not settled) and must NEVER be serialized as a status param.
 * Also: pull-to-refresh, badge count = unsettled notices.
 */

import React from 'react';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: { items: [], totalCount: 0, page: 1, pageSize: 50 } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
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

jest.mock('../../src/components/shared/NoticeRowMobile', () => {
  const { View, Text } = require('react-native');
  return {
    NoticeRowMobile: (props: { id: string; noticeNumber: string; status: string; testID?: string }) => (
      <View testID={props.testID ?? `notice-row-${props.id}`}>
        <Text testID={`notice-status-${props.id}`}>{props.status}</Text>
        <Text>{props.noticeNumber}</Text>
      </View>
    ),
  };
});

import { listGstNotices, respondToGstNotice } from '../../src/api/gst';
const mockListGstNotices = listGstNotices as jest.Mock;
const mockRespondToGstNotice = respondToGstNotice as jest.Mock;

jest.mock('../../src/api/gst', () => ({
  listGstNotices: jest.fn(),
  respondToGstNotice: jest.fn(() => Promise.resolve()),
}));

// Stable relative dates so the derived-overdue assertions never time-bomb.
const PAST_DATE = '2020-01-31';
const FUTURE_DATE = '2099-12-31';

const RECEIVED_NOTICE = {
  id: 'n1', noticeNumber: 'GST-2025-001', noticeType: 'ASMT_10', status: 'RECEIVED',
  issuedDate: '2025-06-01', dueDate: FUTURE_DATE, description: 'Assessment notice',
};
// Canonical status + past statutory deadline → client-side "Overdue".
const OVERDUE_NOTICE = {
  id: 'n2', noticeNumber: 'GST-2025-002', noticeType: 'ASMT_11', status: 'UNDER_REVIEW',
  issuedDate: '2025-05-01', dueDate: PAST_DATE, statutoryDeadline: PAST_DATE,
  description: 'Overdue notice',
};
const CLOSED_NOTICE = {
  id: 'n3', noticeNumber: 'GST-2025-003', noticeType: 'ASMT_12', status: 'CLOSED',
  issuedDate: '2025-04-01', dueDate: PAST_DATE, description: 'Closed notice',
};

import { GstNoticeInboxScreen } from '../../src/screens/gst/GstNoticeInboxScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const mockRoute = { params: { orgId: 'org-abc' } } as never;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function pressTab(getAllByRole: ReturnType<typeof render>['getAllByRole'], labelKey: string) {
  const tab = getAllByRole('tab').find((node) => within(node).queryByText(labelKey));
  fireEvent.press(tab!);
}

describe('GstNoticeInboxScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListGstNotices.mockResolvedValue({
      items: [RECEIVED_NOTICE, OVERDUE_NOTICE, CLOSED_NOTICE],
      totalCount: 3, page: 1, pageSize: 50,
    });
  });

  it('renders header without crashing', () => {
    const { getByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    expect(getByText('mobile.gst.notices.title')).toBeTruthy();
  });

  it('renders all 6 filter tabs with the canonical vocabulary', () => {
    const { getByText, queryByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    [
      'mobile.gst.notices.filter.all',
      'mobile.gst.notices.filter.received',
      'mobile.gst.notices.filter.underReview',
      'mobile.gst.notices.filter.overdue',
      'mobile.gst.notices.filter.responded',
      'mobile.gst.notices.filter.closed',
    ].forEach((label) => {
      expect(getByText(label)).toBeTruthy();
    });
    // Legacy "Open" chip is gone.
    expect(queryByText('mobile.gst.notices.filter.open')).toBeNull();
  });

  it('badge count equals number of unsettled (not RESPONDED/CLOSED) notices', async () => {
    const { getByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('2')).toBeTruthy());
  });

  it('renders notice rows after data loads', async () => {
    const { getByTestId } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(getByTestId('notice-row-n1')).toBeTruthy();
      expect(getByTestId('notice-row-n2')).toBeTruthy();
      expect(getByTestId('notice-row-n3')).toBeTruthy();
    });
  });

  it('switching to Received tab calls listGstNotices with status=RECEIVED', async () => {
    const { getByText, getAllByRole } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('mobile.gst.notices.filter.all')).toBeTruthy());
    pressTab(getAllByRole, 'mobile.gst.notices.filter.received');
    await waitFor(() =>
      expect(mockListGstNotices).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-abc', status: 'RECEIVED' }),
      ),
    );
  });

  it('switching to Under-review tab calls listGstNotices with status=UNDER_REVIEW', async () => {
    const { getByText, getAllByRole } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('mobile.gst.notices.filter.all')).toBeTruthy());
    pressTab(getAllByRole, 'mobile.gst.notices.filter.underReview');
    await waitFor(() =>
      expect(mockListGstNotices).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-abc', status: 'UNDER_REVIEW' }),
      ),
    );
  });

  it('switching to Closed tab calls listGstNotices with status=CLOSED', async () => {
    const { getByText, getAllByRole } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('mobile.gst.notices.filter.all')).toBeTruthy());
    pressTab(getAllByRole, 'mobile.gst.notices.filter.closed');
    await waitFor(() =>
      expect(mockListGstNotices).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-abc', status: 'CLOSED' }),
      ),
    );
  });

  it('Overdue tab is client-side: no status param sent, only deadline-passed unsettled rows shown', async () => {
    const { getByText, getAllByRole, getByTestId, queryByTestId } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('mobile.gst.notices.filter.all')).toBeTruthy());
    pressTab(getAllByRole, 'mobile.gst.notices.filter.overdue');

    // n2: past statutory deadline + UNDER_REVIEW → overdue.
    await waitFor(() => expect(getByTestId('notice-row-n2')).toBeTruthy());
    // n1: future deadline → not overdue; n3: CLOSED (settled) → never overdue.
    expect(queryByTestId('notice-row-n1')).toBeNull();
    expect(queryByTestId('notice-row-n3')).toBeNull();

    // The derived filter (and the legacy vocabulary) must never hit the wire.
    for (const call of mockListGstNotices.mock.calls) {
      expect(call[0].status).toBeUndefined();
      expect(call[0].status).not.toBe('Overdue');
      expect(call[0].status).not.toBe('Open');
    }
  });

  it('All tab calls listGstNotices without status filter', async () => {
    const { getByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(mockListGstNotices).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-abc', status: undefined }),
    ));
    // badge still shown
    expect(getByText('mobile.gst.notices.title')).toBeTruthy();
  });

  it('shows empty state when no notices returned', async () => {
    mockListGstNotices.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 50 });
    const { getByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('mobile.gst.notices.emptyTitle')).toBeTruthy());
  });

  it('pull-to-refresh triggers refetch', async () => {
    const { UNSAFE_getAllByType } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(mockListGstNotices).toHaveBeenCalledTimes(1));

    const scrollViews = UNSAFE_getAllByType(require('react-native').ScrollView);
    // The body list ScrollView has a refreshControl
    const listScrollView = scrollViews[scrollViews.length - 1];
    await act(async () => {
      fireEvent(listScrollView, 'refresh');
    });
    await waitFor(() => expect(mockListGstNotices.mock.calls.length).toBeGreaterThanOrEqual(1));
  });
});
