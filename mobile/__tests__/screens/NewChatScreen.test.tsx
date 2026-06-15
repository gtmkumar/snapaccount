/**
 * NewChatScreen — BUG-W7-002 test suite.
 *
 * Covers:
 *   - Renders title, category chips and inputs (translated labels)
 *   - Submit disabled when the message is empty (createThread NOT called)
 *   - Happy path: pick category → type subject + message → submit →
 *     createThread called with the right args → navigation.replace(ChatDetail)
 *   - Error path: createThread rejects → inline error shown, no navigation
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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

// ── Mock: api/chat ────────────────────────────────────────────────────────────

const mockCreateThread = jest.fn();

jest.mock('../../src/api/chat', () => ({
  createThread: (...args: unknown[]) => mockCreateThread(...args),
}));

// ── Navigation mock ───────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

const mockNavigation = {
  navigate: mockNavigate,
  replace: mockReplace,
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

// ── Wrapper ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <NavigationContainer>{children}</NavigationContainer>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import { NewChatScreen } from '../../src/screens/chat/NewChatScreen';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NewChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateThread.mockResolvedValue({
      threadId: 'new-thread-1',
      status: 'Open',
      category: 'GENERAL',
      messageId: 'msg-1',
    });
  });

  it('renders title, category chips and inputs', () => {
    const { getByText, getByTestId } = render(
      <Wrapper>
        <NewChatScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    expect(getByText('New conversation')).toBeTruthy();
    // Translated category labels, not raw keys
    expect(getByText('General')).toBeTruthy();
    expect(getByText('GST')).toBeTruthy();
    expect(getByText('Income Tax')).toBeTruthy();
    expect(getByTestId('new-chat-subject')).toBeTruthy();
    expect(getByTestId('new-chat-message')).toBeTruthy();
    expect(getByTestId('new-chat-submit')).toBeTruthy();
  });

  it('does not call createThread when the message is empty', () => {
    const { getByTestId } = render(
      <Wrapper>
        <NewChatScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.press(getByTestId('new-chat-submit'));

    expect(mockCreateThread).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('happy path: creates a GST thread and replaces into ChatDetail', async () => {
    const { getByTestId } = render(
      <Wrapper>
        <NewChatScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.press(getByTestId('new-chat-category-GST'));
    fireEvent.changeText(getByTestId('new-chat-subject'), 'GSTR-1 doubt');
    fireEvent.changeText(getByTestId('new-chat-message'), 'How do I amend an invoice?');
    fireEvent.press(getByTestId('new-chat-submit'));

    await waitFor(() => {
      expect(mockCreateThread).toHaveBeenCalledWith({
        category: 'GST',
        subject: 'GSTR-1 doubt',
        initialMessage: 'How do I amend an invoice?',
        clientMessageId: expect.any(String),
      });
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('ChatDetail', {
        threadId: 'new-thread-1',
        source: 'list',
      });
    });
  });

  it('defaults to GENERAL category and omits empty subject', async () => {
    const { getByTestId } = render(
      <Wrapper>
        <NewChatScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.changeText(getByTestId('new-chat-message'), 'Hello, I need help');
    fireEvent.press(getByTestId('new-chat-submit'));

    await waitFor(() => {
      expect(mockCreateThread).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'GENERAL',
          subject: undefined,
          initialMessage: 'Hello, I need help',
        }),
      );
    });
  });

  it('shows an inline error and does not navigate when create fails', async () => {
    mockCreateThread.mockRejectedValue(new Error('network'));

    const { getByTestId, queryByTestId } = render(
      <Wrapper>
        <NewChatScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.changeText(getByTestId('new-chat-message'), 'Will fail');
    fireEvent.press(getByTestId('new-chat-submit'));

    await waitFor(() => {
      expect(queryByTestId('new-chat-error')).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('close button goes back', () => {
    const { getByTestId } = render(
      <Wrapper>
        <NewChatScreen navigation={mockNavigation as never} />
      </Wrapper>,
    );

    fireEvent.press(getByTestId('new-chat-back'));

    expect(mockGoBack).toHaveBeenCalled();
  });
});
