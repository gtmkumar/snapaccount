/**
 * ChatDetailScreen — Phase 6F full test suite
 * Track F2 · SEC-015 · SignalR · haptics · optimistic send
 *
 * Covers:
 *   - Message bubble render (self vs other)
 *   - Optimistic send: message appears before API resolves
 *   - SignalR `typing` event triggers typing indicator
 *   - SignalR `messageReceived` appends to list
 *   - useSensitiveScreen applied (SEC-015)
 *   - Haptic on send success and error
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { usePreventScreenCapture } from 'expo-screen-capture';
import * as Haptics from 'expo-haptics';

import '../../src/i18n';

// ── Mock: navigation ──────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useRoute: () => ({ params: { threadId: 'thread-test-1' } }),
    useNavigation: () => ({ goBack: jest.fn() }),
    useFocusEffect: jest.fn((cb: () => unknown) => { cb(); }),
  };
});

// ── Mock: lib/api (prevents real Axios calls from ThemeContext debounce) ──────

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

// ── Captured SignalR handlers ─────────────────────────────────────────────────
// subscribeChatHub mock stores handlers so tests can fire events directly.

type HubHandlers = {
  onMessageReceived?: (msg: unknown) => void;
  onTypingStarted?: (uid: string) => void;
  onTypingStopped?: () => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onDisconnected?: () => void;
};

const capturedHandlers: HubHandlers = {};

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

const mockSendMessage = jest.fn();

jest.mock('../../src/api/chat', () => ({
  buildChatHubConnection: jest.fn().mockReturnValue(mockHub),
  getMessages: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
  getThread: jest.fn().mockResolvedValue({
    threadId: 'thread-test-1',
    category: 'general',
    status: 'open',
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    createdAt: new Date().toISOString(),
  }),
  markThreadRead: jest.fn().mockResolvedValue(undefined),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  startChatHub: jest.fn().mockResolvedValue(undefined),
  stopChatHub: jest.fn().mockResolvedValue(undefined),
  subscribeChatHub: jest.fn().mockImplementation((_hub: unknown, handlers: HubHandlers) => {
    Object.assign(capturedHandlers, handlers);
    return jest.fn(); // unsubscribe fn
  }),
  postTypingPing: jest.fn().mockResolvedValue(undefined),
  HubConnectionState: { Disconnected: 'Disconnected', Connected: 'Connected' },
}));

import { subscribeChatHub } from '../../src/api/chat';
import { ChatDetailScreen } from '../../src/screens/chat/ChatDetailScreen';

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatDetailScreen', () => {
  beforeEach(() => {
    // Use clearAllMocks but re-set subscribeChatHub implementation since
    // clearAllMocks removes mockImplementation from all mocks.
    jest.clearAllMocks();
    Object.keys(capturedHandlers).forEach((k) => {
      delete (capturedHandlers as Record<string, unknown>)[k];
    });
    // Re-apply mock implementations since jest.clearAllMocks() removes them.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nav = require('@react-navigation/native');
    (nav.useFocusEffect as jest.Mock).mockImplementation((cb: () => unknown) => { cb(); });
    (subscribeChatHub as jest.Mock).mockImplementation(
      (_hub: unknown, handlers: HubHandlers) => {
        Object.assign(capturedHandlers, handlers);
        return jest.fn();
      },
    );
    mockSendMessage.mockResolvedValue({
      messageId: 'm-server-1',
      threadId: 'thread-test-1',
      senderUserId: 'me',
      body: 'Hello',
      createdAt: new Date().toISOString(),
    });
  });

  // ── render ────────────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    expect(() =>
      render(
        <Wrapper>
          <ChatDetailScreen />
        </Wrapper>,
      ),
    ).not.toThrow();
  });

  it('shows composer placeholder', () => {
    const { getByPlaceholderText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );
    expect(getByPlaceholderText('Message…')).toBeTruthy();
  });

  // ── SEC-015: useSensitiveScreen ───────────────────────────────────────────

  it('useSensitiveScreen (SEC-015) is called on mount', () => {
    render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );
    expect(usePreventScreenCapture).toHaveBeenCalled();
  });

  // ── SignalR: messageReceived ──────────────────────────────────────────────

  it('SignalR messageReceived event appends message bubble to list', async () => {
    const { queryByText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    // Wait for loading queries to resolve (thread + messages) so FlatList renders
    await waitFor(() => {
      expect(queryByText('Say hello')).toBeTruthy(); // empty state = loaded
    });

    await act(async () => {
      capturedHandlers.onMessageReceived?.({
        messageId: 'incoming-1',
        threadId: 'thread-test-1',
        senderUserId: 'agent-007',
        body: 'Hello from agent',
        createdAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(queryByText('Hello from agent')).toBeTruthy();
    });
  });

  // ── SignalR: typing indicator ─────────────────────────────────────────────

  it('SignalR onTypingStarted shows typing indicator (··· dots)', async () => {
    const { queryByText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    // Wait for queries to resolve so screen is in loaded state (empty state visible)
    await waitFor(() => {
      expect(queryByText('Say hello')).toBeTruthy();
    });

    // Add a message first so FlatList renders (typing indicator is ListFooterComponent)
    await act(async () => {
      capturedHandlers.onMessageReceived?.({
        messageId: 'msg-for-typing-test',
        threadId: 'thread-test-1',
        senderUserId: 'agent',
        body: 'Setup message',
        createdAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(queryByText('Setup message')).toBeTruthy();
    });

    // Now fire typing started — FlatList is active, footer renders
    await act(async () => {
      capturedHandlers.onTypingStarted?.('expert-user');
    });

    await waitFor(() => {
      expect(queryByText('···')).toBeTruthy();
    });
  });

  it('typing indicator disappears after 3s TYPING_STOP_TIMEOUT_MS', async () => {
    jest.useFakeTimers();
    const { queryByText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    // Let async mock queries resolve
    await act(async () => {
      jest.runAllTicks();
    });

    // Add a message so FlatList renders
    act(() => {
      capturedHandlers.onMessageReceived?.({
        messageId: 'msg-timer-test',
        threadId: 'thread-test-1',
        senderUserId: 'agent',
        body: 'Timer test message',
        createdAt: new Date().toISOString(),
      });
    });

    act(() => {
      capturedHandlers.onTypingStarted?.('expert-user');
    });

    await waitFor(() => {
      expect(queryByText('···')).toBeTruthy();
    });

    act(() => { jest.advanceTimersByTime(3100); });

    await waitFor(() => {
      expect(queryByText('···')).toBeNull();
    });

    jest.useRealTimers();
  });

  // ── Optimistic send ───────────────────────────────────────────────────────

  it('optimistic send: message appears immediately (before API resolves)', async () => {
    // sendMessage never resolves during this test
    mockSendMessage.mockReturnValue(new Promise(() => undefined));

    const { getByPlaceholderText, getByLabelText, queryByText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Message…'), 'Optimistic message');
    });

    const sendBtn = getByLabelText('Send');
    fireEvent.press(sendBtn);

    expect(queryByText('Optimistic message')).toBeTruthy();
  });

  // ── Haptics ───────────────────────────────────────────────────────────────

  it('haptic success fires when sendMessage resolves', async () => {
    mockSendMessage.mockResolvedValue({
      messageId: 'm-ok',
      threadId: 'thread-test-1',
      senderUserId: 'me',
      body: 'Hi',
      createdAt: new Date().toISOString(),
    });

    const { getByPlaceholderText, getByLabelText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Message…'), 'Hi');
    });
    fireEvent.press(getByLabelText('Send'));

    await waitFor(() => {
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Success,
      );
    });
  });

  it('haptic error fires when sendMessage rejects', async () => {
    mockSendMessage.mockRejectedValue(new Error('network error'));

    const { getByPlaceholderText, getByLabelText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Message…'), 'Failing message');
    });
    fireEvent.press(getByLabelText('Send'));

    await waitFor(() => {
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Error,
      );
    });
  });

  // ── NEW-D08: clientMessageId UUID + retry dedupe ──────────────────────────

  it('send includes a client-generated UUID clientMessageId', async () => {
    mockSendMessage.mockResolvedValue({
      messageId: 'm-ok',
      threadId: 'thread-test-1',
      senderUserId: 'me',
      body: 'Hi',
      createdAt: new Date().toISOString(),
    });

    const { getByPlaceholderText, getByLabelText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Message…'), 'Hi');
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
    const [, req] = mockSendMessage.mock.calls[0] as [string, { clientMessageId?: string }];
    expect(req.clientMessageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('retry after failure reuses the SAME clientMessageId (dedupe key)', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('network error'));

    const { getByPlaceholderText, getByLabelText, getByText } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.changeText(getByPlaceholderText('Message…'), 'Retry me');
    });
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    // First attempt failed — bubble shows the retry affordance
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
    const firstReq = mockSendMessage.mock.calls[0][1] as { clientMessageId: string };
    expect(firstReq.clientMessageId).toBeTruthy();

    const failedCaption = await waitFor(() => getByText('Failed · tap to retry'));

    // Second attempt succeeds
    mockSendMessage.mockResolvedValueOnce({
      messageId: 'm-server-2',
      threadId: 'thread-test-1',
      senderUserId: 'me',
      body: 'Retry me',
      createdAt: new Date().toISOString(),
    });

    await act(async () => {
      fireEvent.press(failedCaption);
    });

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));
    const secondReq = mockSendMessage.mock.calls[1][1] as { clientMessageId: string };

    // The dedupe contract: same id on retry, never regenerated
    expect(secondReq.clientMessageId).toBe(firstReq.clientMessageId);
    expect(mockSendMessage.mock.calls[1][0]).toBe('thread-test-1');
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it('back button has accessible role "button"', () => {
    const { getAllByRole } = render(
      <Wrapper>
        <ChatDetailScreen />
      </Wrapper>,
    );
    // Back button, camera button, send button all have role=button
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
