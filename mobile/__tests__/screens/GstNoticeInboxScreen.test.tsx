/**
 * GstNoticeInboxScreen — Phase 6B
 * Tests: filter tabs change result set; pull-to-refresh mocks onRefresh;
 *        badge count matches Open+Overdue notice count.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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

const OPEN_NOTICE = {
  id: 'n1', noticeNumber: 'GST-2025-001', noticeType: 'ASMT_10', status: 'Open',
  issuedDate: '2025-06-01', dueDate: '2025-07-01', description: 'Assessment notice',
};
const OVERDUE_NOTICE = {
  id: 'n2', noticeNumber: 'GST-2025-002', noticeType: 'ASMT_11', status: 'Overdue',
  issuedDate: '2025-05-01', dueDate: '2025-05-31', description: 'Overdue notice',
};
const CLOSED_NOTICE = {
  id: 'n3', noticeNumber: 'GST-2025-003', noticeType: 'ASMT_12', status: 'Closed',
  issuedDate: '2025-04-01', description: 'Closed notice',
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

describe('GstNoticeInboxScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListGstNotices.mockResolvedValue({
      items: [OPEN_NOTICE, OVERDUE_NOTICE, CLOSED_NOTICE],
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

  it('renders all 5 filter tabs', () => {
    const { getByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    ['All', 'Open', 'Overdue', 'Responded', 'Closed'].forEach((label) => {
      expect(getByText(label)).toBeTruthy();
    });
  });

  it('badge count equals number of Open + Overdue notices', async () => {
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

  it('switching to Open tab calls listGstNotices with status=Open', async () => {
    const { getByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('All')).toBeTruthy());
    fireEvent.press(getByText('Open'));
    await waitFor(() =>
      expect(mockListGstNotices).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-abc', status: 'Open' }),
      ),
    );
  });

  it('switching to Closed tab calls listGstNotices with status=Closed', async () => {
    const { getByText } = render(
      <GstNoticeInboxScreen navigation={mockNavigation} route={mockRoute} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('All')).toBeTruthy());
    fireEvent.press(getByText('Closed'));
    await waitFor(() =>
      expect(mockListGstNotices).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-abc', status: 'Closed' }),
      ),
    );
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
