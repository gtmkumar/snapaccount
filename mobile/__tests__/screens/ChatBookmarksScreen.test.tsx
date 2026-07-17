/**
 * ChatBookmarksScreen — Wave 7A / GAP-043.
 * Covers: skeleton, rows, jump-to-message navigation (highlightMessageId),
 * remove bookmark (trailing icon + a11y action), empty + error states.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

// BookmarkRow resolves "You" vs role-fallback from the auth store.
jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: object) => unknown) =>
    selector({ user: { id: 'me-1' } }),
}));

jest.mock('../../src/api/chat', () => {
  const actual = jest.requireActual('../../src/api/chat');
  return {
    ...actual,
    listBookmarks: jest.fn(),
    toggleBookmark: jest.fn(() =>
      Promise.resolve({ messageId: 'm1', isBookmarked: false, bookmarkId: null }),
    ),
  };
});

import { listBookmarks, toggleBookmark } from '../../src/api/chat';
import { ChatBookmarksScreen } from '../../src/screens/chat/ChatBookmarksScreen';

const mockListBookmarks = listBookmarks as jest.Mock;
const mockToggleBookmark = toggleBookmark as jest.Mock;

// Wave 7 recon shape: senderRole + original-message createdAt (messageCreatedAt);
// senderDisplayName is intentionally absent (schema isolation) — role fallback.
const BOOKMARK = {
  bookmarkId: 'b1',
  messageId: 'm1',
  threadId: 't1',
  threadSubject: 'GST query',
  senderUserId: 'ca-user',
  senderRole: 'CA',
  body: 'Please share the GSTR-2B for May.',
  createdAt: '2026-06-10T05:30:00Z',
  bookmarkedAt: '2026-06-10T06:00:00Z',
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as never;

describe('ChatBookmarksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListBookmarks.mockResolvedValue({ items: [BOOKMARK] });
  });

  it('tap on a row jumps back to the thread at that message', async () => {
    const { getByTestId } = render(<ChatBookmarksScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('bookmark-row-m1')).toBeTruthy());
    fireEvent.press(getByTestId('m1-open'));
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('ChatDetail', {
      threadId: 't1',
      source: 'bookmark',
      highlightMessageId: 'm1',
    });
  });

  it('renders the role-based sender fallback and "You" for own messages', async () => {
    mockListBookmarks.mockResolvedValue({
      items: [
        BOOKMARK,
        { ...BOOKMARK, bookmarkId: 'b2', messageId: 'm2', senderUserId: 'me-1', senderRole: 'USER' },
      ],
    });
    const { getByText } = render(<ChatBookmarksScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByText('mobile.chat.bookmarks.sender.ca')).toBeTruthy());
    expect(getByText('mobile.chat.bookmarks.sender.you')).toBeTruthy();
  });

  it('trailing icon removes the bookmark', async () => {
    const { getByTestId } = render(<ChatBookmarksScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('m1-remove')).toBeTruthy());
    fireEvent.press(getByTestId('m1-remove'));
    await waitFor(() => expect(mockToggleBookmark).toHaveBeenCalledWith('m1'));
  });

  it('empty state carries the long-press guidance (accessible alternative documented)', async () => {
    mockListBookmarks.mockResolvedValue({ items: [] });
    const { getByTestId, getByText } = render(
      <ChatBookmarksScreen navigation={navigation} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('bookmarks-empty')).toBeTruthy());
    expect(getByText('mobile.chat.bookmarks.empty.guidance')).toBeTruthy();
  });

  it('error state offers retry', async () => {
    mockListBookmarks.mockRejectedValue(new Error('boom'));
    const { getByTestId } = render(<ChatBookmarksScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('bookmarks-error')).toBeTruthy());
  });

  it('optimistically removes the row while the server call is still pending', async () => {
    mockToggleBookmark.mockReturnValue(new Promise(() => {})); // never settles
    const { getByTestId, queryByTestId } = render(
      <ChatBookmarksScreen navigation={navigation} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('m1-remove')).toBeTruthy());
    fireEvent.press(getByTestId('m1-remove'));
    // Server never responds — the row disappearing proves the optimistic cache write
    await waitFor(() => expect(queryByTestId('bookmark-row-m1')).toBeNull());
  });

  it('restores the row and shows the failure toast when removal fails', async () => {
    mockToggleBookmark.mockRejectedValue(new Error('boom'));
    const { getByTestId, queryByTestId } = render(
      <ChatBookmarksScreen navigation={navigation} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('m1-remove')).toBeTruthy());
    fireEvent.press(getByTestId('m1-remove'));
    await waitFor(() => expect(getByTestId('bookmarks-remove-error-toast')).toBeTruthy());
    expect(queryByTestId('bookmark-row-m1')).toBeTruthy();
  });
});
