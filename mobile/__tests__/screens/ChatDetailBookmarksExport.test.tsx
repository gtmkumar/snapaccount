/**
 * ChatDetailScreen — Wave 7A / GAP-043 bookmarks + thread export.
 * Covers: long-press opens the action sheet, bookmark toggle hits the API
 * (and the a11y custom action path is exposed — never long-press-only),
 * bookmark glyph render, header bookmark entry, overflow → export job poll →
 * OS share sheet (RN Share — the app's existing PDF share path).
 */

import React from 'react';
import { Share } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

import '../../src/i18n';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useRoute: () => ({ params: { threadId: 'thread-test-1' } }),
    useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
    useFocusEffect: jest.fn((cb: () => unknown) => { cb(); }),
  };
});

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

const mockHub = {
  state: 'Disconnected',
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  onreconnecting: jest.fn(),
  onreconnected: jest.fn(),
  onclose: jest.fn(),
};

const mockToggleBookmark = jest.fn(() =>
  Promise.resolve({ messageId: 'msg-1', isBookmarked: true, bookmarkId: 'b1' }),
);
const mockStartExport = jest.fn();
const mockGetExportJob = jest.fn();
const mockGetDownloadUrl = jest.fn(() => Promise.resolve('https://signed.example/x.pdf'));

jest.mock('../../src/api/chat', () => ({
  buildChatHubConnection: jest.fn(() => mockHub),
  getMessages: jest.fn().mockResolvedValue({
    items: [
      {
        messageId: 'msg-1',
        threadId: 'thread-test-1',
        senderUserId: 'ca-user',
        body: 'Hello — share your GSTR-2B please.',
        createdAt: new Date().toISOString(),
        isBookmarked: false,
      },
      {
        messageId: 'msg-2',
        threadId: 'thread-test-1',
        senderUserId: 'ca-user',
        body: 'Already bookmarked message.',
        createdAt: new Date().toISOString(),
        isBookmarked: true,
      },
    ],
    hasMore: false,
  }),
  getThread: jest.fn().mockResolvedValue({
    threadId: 'thread-test-1',
    category: 'general',
    status: 'open',
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    createdAt: new Date().toISOString(),
  }),
  markThreadRead: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn(),
  startChatHub: jest.fn().mockResolvedValue(undefined),
  stopChatHub: jest.fn().mockResolvedValue(undefined),
  subscribeChatHub: jest.fn(() => jest.fn()),
  postTypingPing: jest.fn().mockResolvedValue(undefined),
  toggleBookmark: (...args: unknown[]) => mockToggleBookmark(...(args as [])),
  startThreadExport: (...args: unknown[]) => mockStartExport(...(args as [])),
  getThreadExportJob: (...args: unknown[]) => mockGetExportJob(...(args as [])),
  getThreadExportDownloadUrl: (...args: unknown[]) => mockGetDownloadUrl(...(args as [])),
}));

import { ChatDetailScreen } from '../../src/screens/chat/ChatDetailScreen';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('ChatDetailScreen — bookmarks (GAP-043)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the bookmark glyph on bookmarked bubbles', async () => {
    const { getByTestId, queryByTestId } = render(<ChatDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId('bookmark-glyph-msg-2')).toBeTruthy());
    expect(queryByTestId('bookmark-glyph-msg-1')).toBeNull();
  });

  it('long-press opens the action sheet and Bookmark calls the API', async () => {
    const { getByTestId } = render(<ChatDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId('chat-bubble-msg-1')).toBeTruthy());

    fireEvent(getByTestId('chat-bubble-msg-1'), 'longPress');
    await waitFor(() => expect(getByTestId('message-action-sheet')).toBeTruthy());
    fireEvent.press(getByTestId('message-action-bookmark'));

    await waitFor(() => expect(mockToggleBookmark).toHaveBeenCalledWith('msg-1'));
  });

  it('the bubble also exposes a custom a11y "bookmark" action (not long-press-only)', async () => {
    const { getByTestId } = render(<ChatDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId('chat-bubble-msg-1')).toBeTruthy());
    const bubble = getByTestId('chat-bubble-msg-1');
    expect(bubble.props.accessibilityActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'bookmark' })]),
    );
    fireEvent(bubble, 'accessibilityAction', { nativeEvent: { actionName: 'bookmark' } });
    await waitFor(() => expect(getByTestId('message-action-sheet')).toBeTruthy());
  });

  it('header bookmark icon navigates to the bookmarks list', async () => {
    const { getByTestId } = render(<ChatDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId('chat-header-bookmarks')).toBeTruthy());
    fireEvent.press(getByTestId('chat-header-bookmarks'));
    expect(mockNavigate).toHaveBeenCalledWith('ChatBookmarks');
  });
});

describe('ChatDetailScreen — export thread as PDF (GAP-043)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('overflow menu → export runs the async job and opens the OS share sheet', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    mockStartExport.mockResolvedValue({ jobId: 'job-1', status: 'COMPLETED' });

    const { getByTestId } = render(<ChatDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId('chat-header-overflow')).toBeTruthy());

    fireEvent.press(getByTestId('chat-header-overflow'));
    await waitFor(() => expect(getByTestId('thread-overflow-sheet')).toBeTruthy());
    fireEvent.press(getByTestId('thread-export-action'));

    await waitFor(() => expect(mockStartExport).toHaveBeenCalledWith('thread-test-1'));
    await waitFor(() => expect(mockGetDownloadUrl).toHaveBeenCalledWith('job-1'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    shareSpy.mockRestore();
  });

  it('failed export shows the recoverable error banner with retry', async () => {
    mockStartExport.mockResolvedValue({ jobId: 'job-1', status: 'FAILED', errorMessage: 'boom' });

    const { getByTestId } = render(<ChatDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(getByTestId('chat-header-overflow')).toBeTruthy());

    fireEvent.press(getByTestId('chat-header-overflow'));
    await waitFor(() => expect(getByTestId('thread-overflow-sheet')).toBeTruthy());
    fireEvent.press(getByTestId('thread-export-action'));

    await waitFor(() => expect(getByTestId('chat-export-banner')).toBeTruthy());
    await waitFor(() => expect(getByTestId('chat-export-retry')).toBeTruthy());
  });
});
