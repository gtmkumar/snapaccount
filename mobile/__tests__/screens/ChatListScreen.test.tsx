/**
 * ChatListScreen — Phase 6F full test suite
 * Track F2 · filter chips · CategoryBadge · unread badge · pull-to-refresh
 *
 * Covers:
 *   - Renders without crashing / shows title
 *   - Filter chips switch result set (query called with correct category)
 *   - Unread badge count matches API unreadCount
 *   - 9+ truncation when unreadCount > 9
 *   - CategoryBadge renders label text
 *   - Empty state shown when no threads
 *   - Thread row press navigates to ChatDetail
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

import '../../src/i18n';

// ── Mock: lib/api ─────────────────────────────────────────────────────────────

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

// ── Navigation mock ───────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
  canGoBack: () => true,
  dispatch: jest.fn(),
  reset: jest.fn(),
  isFocused: jest.fn().mockReturnValue(true),
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  removeListener: jest.fn(),
  setOptions: jest.fn(),
  setParams: jest.fn(),
  getParent: jest.fn(),
  getState: jest.fn(),
};

// ── Thread fixtures ───────────────────────────────────────────────────────────

const makeThread = (overrides: Partial<{
  threadId: string;
  category: string;
  subject: string;
  unreadCount: number;
  status: string;
  lastMessageAt: string;
  createdAt: string;
}> = {}) => ({
  threadId: 'thread-1',
  category: 'general',
  subject: 'My Thread',
  unreadCount: 0,
  status: 'open',
  lastMessageAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  ...overrides,
});

const mockListThreads = jest.fn();

jest.mock('../../src/api/chat', () => ({
  listThreads: (...args: unknown[]) => mockListThreads(...args),
}));

// ── Wrapper ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <NavigationContainer>{children}</NavigationContainer>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import { ChatListScreen } from '../../src/screens/chat/ChatListScreen';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListThreads.mockResolvedValue({ items: [], totalCount: 0 });
  });

  // ── basic render ──────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    expect(() =>
      render(
        <Wrapper>
          <ChatListScreen navigation={mockNavigation as never} />
        </Wrapper>,
      ),
    ).not.toThrow();
  });

  it('shows Expert Chat title', () => {
    const { getByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );
    expect(getByText('Expert Chat')).toBeTruthy();
  });

  // ── filter chips ──────────────────────────────────────────────────────────

  it('renders filter chips row with at least 7 buttons', () => {
    const { getAllByRole } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(7);
  });

  // AND-10: chips previously rendered raw keys (`chat.list.filter.*`) because
  // the `mobile.` prefix was missing from the t() calls. Labels must resolve.
  it('filter chips render translated labels, not raw i18n keys', () => {
    const { getByText, queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    expect(getByText('All')).toBeTruthy();
    expect(getByText('Unread')).toBeTruthy();
    expect(getByText('GST')).toBeTruthy();
    expect(queryByText('chat.list.filter.all')).toBeNull();
    expect(queryByText('mobile.chat.list.filter.all')).toBeNull();
  });

  it('pressing GST filter chip calls listThreads with gst-notice category', async () => {
    mockListThreads.mockResolvedValue({ items: [], totalCount: 0 });

    const { getByLabelText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    const gstChip = getByLabelText('GST');
    fireEvent.press(gstChip);

    await waitFor(() => {
      expect(mockListThreads).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'gst-notice' }),
      );
    });
  });

  it('pressing Loan filter chip calls listThreads with loan category', async () => {
    const { getByLabelText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.press(getByLabelText('Loan'));

    await waitFor(() => {
      expect(mockListThreads).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'loan' }),
      );
    });
  });

  it('Unread filter chip filters out zero-unread threads client-side', async () => {
    mockListThreads.mockResolvedValue({
      items: [
        makeThread({ threadId: 't1', unreadCount: 3, subject: 'Unread Thread' }),
        makeThread({ threadId: 't2', unreadCount: 0, subject: 'Read Thread' }),
      ],
      totalCount: 2,
    });

    const { getByLabelText, queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.press(getByLabelText('Unread'));

    await waitFor(() => {
      expect(queryByText('Unread Thread')).toBeTruthy();
    });
    expect(queryByText('Read Thread')).toBeNull();
  });

  // ── unread badge count ────────────────────────────────────────────────────

  it('unread badge shows correct count from API', async () => {
    mockListThreads.mockResolvedValue({
      items: [makeThread({ threadId: 't-u1', unreadCount: 7, subject: 'Inbox' })],
      totalCount: 1,
    });

    const { queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(queryByText('7')).toBeTruthy();
    });
  });

  it('unread badge shows 9+ when unreadCount > 9', async () => {
    mockListThreads.mockResolvedValue({
      items: [makeThread({ threadId: 't-u2', unreadCount: 15, subject: 'Flood' })],
      totalCount: 1,
    });

    const { queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(queryByText('9+')).toBeTruthy();
    });
  });

  // ── CategoryBadge ─────────────────────────────────────────────────────────

  it('CategoryBadge renders "tax query" label for tax-query thread', async () => {
    mockListThreads.mockResolvedValue({
      items: [makeThread({ threadId: 't-tax', category: 'tax-query', subject: 'Tax Q' })],
      totalCount: 1,
    });

    const { queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    await waitFor(() => {
      // CategoryBadge replaces hyphens: 'tax-query' → 'tax query'
      expect(queryByText('tax query')).toBeTruthy();
    });
  });

  it('CategoryBadge renders "gst notice" label for gst-notice thread', async () => {
    mockListThreads.mockResolvedValue({
      items: [makeThread({ threadId: 't-gst', category: 'gst-notice', subject: 'GST' })],
      totalCount: 1,
    });

    const { queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(queryByText('gst notice')).toBeTruthy();
    });
  });

  it('CategoryBadge renders "loan" label for loan thread', async () => {
    mockListThreads.mockResolvedValue({
      items: [makeThread({ threadId: 't-loan', category: 'loan', subject: 'Loan' })],
      totalCount: 1,
    });

    const { queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(queryByText('loan')).toBeTruthy();
    });
  });

  // ── empty state ───────────────────────────────────────────────────────────

  it('shows empty state when API returns no threads', async () => {
    mockListThreads.mockResolvedValue({ items: [], totalCount: 0 });

    const { queryByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    await waitFor(() => {
      // t('mobile.chat.list.empty') = 'Inbox zero · Tap + to start a conversation'
      expect(queryByText('Inbox zero · Tap + to start a conversation')).toBeTruthy();
    });
  });

  // ── navigation ────────────────────────────────────────────────────────────

  it('tapping a thread row navigates to ChatDetail with correct threadId', async () => {
    mockListThreads.mockResolvedValue({
      items: [makeThread({ threadId: 'nav-thread', subject: 'Nav Thread' })],
      totalCount: 1,
    });

    const { getByText } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(getByText('Nav Thread')).toBeTruthy();
    });

    fireEvent.press(getByText('Nav Thread'));

    expect(mockNavigate).toHaveBeenCalledWith('ChatDetail', {
      threadId: 'nav-thread',
      source: 'list',
    });
  });

  // ── new conversation (BUG-W7-002) ─────────────────────────────────────────
  // Both the header "+" button and the FAB must open the NewChat compose
  // screen — they previously had NO onPress handler at all.

  it('header + button navigates to NewChat', () => {
    const { getByTestId } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.press(getByTestId('chat-list-new-header'));

    expect(mockNavigate).toHaveBeenCalledWith('NewChat');
  });

  it('FAB navigates to NewChat', () => {
    const { getByTestId } = render(
      <Wrapper>
        <ChatListScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.press(getByTestId('chat-list-new-fab'));

    expect(mockNavigate).toHaveBeenCalledWith('NewChat');
  });
});
