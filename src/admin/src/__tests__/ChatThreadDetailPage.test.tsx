/**
 * ChatThreadDetailPage — Phase 6F smoke tests
 * Covers: message bubbles, SignalR typing indicator, status transitions, send message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as chatApi from '@/lib/chatApi'
import ChatThreadDetailPage from '@/pages/chat/ChatThreadDetailPage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockJoinThread = vi.fn().mockResolvedValue(undefined)
const mockLeaveThread = vi.fn().mockResolvedValue(undefined)
let capturedOnTyping: ((evt: { threadId: string; userId: string }) => void) | undefined

vi.mock('@/hooks/useChatHub', () => ({
  useChatHub: vi.fn((handlers: { onMessage?: (...args: unknown[]) => void; onTyping?: (...args: unknown[]) => void }) => {
    capturedOnTyping = handlers.onTyping as ((evt: { threadId: string; userId: string }) => void) | undefined
    return {
      isConnected: true,
      joinThread: mockJoinThread,
      leaveThread: mockLeaveThread,
    }
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'agent-001', email: 'agent@snapaccount.in', displayName: 'Agent', role: 'CA' },
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  })),
}))

vi.mock('@/lib/firebase', () => ({ auth: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

const THREAD_ID = 'thread-test-001'

function renderPage(threadId = THREAD_ID) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[`/chat/${threadId}`]}>
        <Routes>
          <Route path="/chat/:threadId" element={<ChatThreadDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockThread: chatApi.ThreadDetail = {
  threadId: THREAD_ID,
  subject: 'Help with GST filing',
  category: 'tax-query',
  status: 'open',
  assignedToUserId: null,
  participants: [
    { userId: 'user-001', role: 'User' },
    { userId: 'agent-001', role: 'Agent' },
  ],
  createdAt: '2024-03-01T08:00:00Z',
}

const mockMessages: { items: chatApi.Message[]; hasMore: boolean } = {
  items: [
    {
      messageId: 'msg-001',
      senderUserId: 'user-001',
      body: 'Hello, I need help with GST',
      attachmentsJson: null,
      clientMessageId: null,
      createdAt: '2024-03-01T08:05:00Z',
    },
    {
      messageId: 'msg-002',
      senderUserId: 'agent-001',
      body: 'Sure, I can help you with that!',
      attachmentsJson: null,
      clientMessageId: null,
      createdAt: '2024-03-01T08:06:00Z',
    },
  ],
  hasMore: false,
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  capturedOnTyping = undefined
  vi.spyOn(chatApi, 'getThread').mockResolvedValue(mockThread)
  vi.spyOn(chatApi, 'getMessages').mockResolvedValue(mockMessages)
  vi.spyOn(chatApi, 'markThreadRead').mockResolvedValue(undefined)
  vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
    messageId: 'msg-003',
    senderUserId: 'agent-001',
    body: 'New message',
    attachmentsJson: null,
    clientMessageId: 'client-001',
    createdAt: new Date().toISOString(),
  })
  vi.spyOn(chatApi, 'resolveThread').mockResolvedValue(undefined)
  vi.spyOn(chatApi, 'escalateThread').mockResolvedValue(undefined)
  vi.spyOn(chatApi, 'reopenThread').mockResolvedValue(undefined)
  vi.spyOn(chatApi, 'sendTypingPing').mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatThreadDetailPage', () => {
  it('renders thread subject in header', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Help with GST filing')).toBeInTheDocument()
    })
  })

  it('renders status badge in header', async () => {
    renderPage()
    await waitFor(() => {
      // Status badge renders with thread status value
      expect(screen.getByText('open')).toBeInTheDocument()
    })
  })

  it('renders participant count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('2 participants')).toBeInTheDocument()
    })
  })

  it('renders message bubbles for each message', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Hello, I need help with GST')).toBeInTheDocument()
      expect(screen.getByText('Sure, I can help you with that!')).toBeInTheDocument()
    })
  })

  it('marks thread as read on mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(chatApi.markThreadRead).toHaveBeenCalledWith(THREAD_ID)
    })
  })

  it('renders message composer for open thread', async () => {
    renderPage()
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Type a message/)
      expect(textarea).toBeInTheDocument()
    })
  })

  it('send button is disabled when textarea is empty', async () => {
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Type a message/))

    const sendBtn = screen.getByRole('button', { name: /Send message/i })
    expect(sendBtn).toBeDisabled()
  })

  it('send button enables when textarea has text', async () => {
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Type a message/))

    const textarea = screen.getByPlaceholderText(/Type a message/)
    fireEvent.change(textarea, { target: { value: 'Hello!' } })

    const sendBtn = screen.getByRole('button', { name: /Send message/i })
    expect(sendBtn).not.toBeDisabled()
  })

  it('clicking send calls sendMessage API', async () => {
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Type a message/))

    const textarea = screen.getByPlaceholderText(/Type a message/)
    fireEvent.change(textarea, { target: { value: 'Test message' } })

    const sendBtn = screen.getByRole('button', { name: /Send message/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith(
        THREAD_ID,
        expect.objectContaining({ body: 'Test message' })
      )
    })
  })

  it('Enter key sends message', async () => {
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Type a message/))

    const textarea = screen.getByPlaceholderText(/Type a message/)
    fireEvent.change(textarea, { target: { value: 'Enter send' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith(
        THREAD_ID,
        expect.objectContaining({ body: 'Enter send' })
      )
    })
  })

  it('Shift+Enter does NOT send message', async () => {
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Type a message/))

    const textarea = screen.getByPlaceholderText(/Type a message/)
    fireEvent.change(textarea, { target: { value: 'multi\nline' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    await waitFor(() => {
      expect(chatApi.sendMessage).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // SignalR typing indicator
  // ---------------------------------------------------------------------------

  it('shows typing indicator when another user is typing', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Hello, I need help with GST'))

    // Simulate SignalR onTyping event from another user
    if (capturedOnTyping) {
      capturedOnTyping({ threadId: THREAD_ID, userId: 'user-001' })
    }

    await waitFor(() => {
      expect(screen.getByText(/typing…/)).toBeInTheDocument()
    })
  })

  it('does not show typing indicator for own messages', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Hello, I need help with GST'))

    // agent-001 is the current user — should not show typing indicator
    if (capturedOnTyping) {
      capturedOnTyping({ threadId: THREAD_ID, userId: 'agent-001' })
    }

    // No typing indicator for self
    expect(screen.queryByText(/typing…/)).not.toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------------

  it('actions menu contains Resolve and Escalate for open thread', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: 'Actions' }))

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))

    await waitFor(() => {
      expect(screen.getByText('Mark resolved')).toBeInTheDocument()
      expect(screen.getByText('Escalate')).toBeInTheDocument()
    })
  })

  it('clicking Resolve calls resolveThread', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: 'Actions' }))

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await waitFor(() => screen.getByText('Mark resolved'))
    fireEvent.click(screen.getByText('Mark resolved'))

    await waitFor(() => {
      expect(chatApi.resolveThread).toHaveBeenCalledWith(THREAD_ID)
    })
  })

  it('clicking Escalate calls escalateThread', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: 'Actions' }))

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await waitFor(() => screen.getByText('Escalate'))
    fireEvent.click(screen.getByText('Escalate'))

    await waitFor(() => {
      expect(chatApi.escalateThread).toHaveBeenCalledWith(THREAD_ID)
    })
  })

  it('resolved thread hides composer', async () => {
    vi.spyOn(chatApi, 'getThread').mockResolvedValue({ ...mockThread, status: 'resolved' })
    renderPage()
    await waitFor(() => screen.getByText('Help with GST filing'))

    expect(screen.queryByPlaceholderText(/Type a message/)).not.toBeInTheDocument()
  })

  it('resolved thread shows Reopen option', async () => {
    vi.spyOn(chatApi, 'getThread').mockResolvedValue({ ...mockThread, status: 'resolved' })
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: 'Actions' }))

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))

    await waitFor(() => {
      expect(screen.getByText('Reopen')).toBeInTheDocument()
    })
  })

  it('clicking Reopen calls reopenThread', async () => {
    vi.spyOn(chatApi, 'getThread').mockResolvedValue({ ...mockThread, status: 'resolved' })
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: 'Actions' }))

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await waitFor(() => screen.getByText('Reopen'))
    fireEvent.click(screen.getByText('Reopen'))

    await waitFor(() => {
      expect(chatApi.reopenThread).toHaveBeenCalledWith(THREAD_ID)
    })
  })

  it('shows empty state when thread has no messages', async () => {
    vi.spyOn(chatApi, 'getMessages').mockResolvedValue({ items: [], hasMore: false })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/No messages yet/)).toBeInTheDocument()
    })
  })
})
