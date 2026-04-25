/**
 * NotificationCenter — unit tests
 * Phase 6E
 *
 * Covers:
 * - Bell button renders and aria attributes
 * - Unread badge dot appears when unreadCount > 0
 * - Badge dot hidden when unreadCount === 0
 * - Clicking bell opens dropdown
 * - Loading skeleton shown while inbox fetches
 * - Notification items rendered after load
 * - Mark-as-read called when clicking an unread notification
 * - Mark all read button calls markAllNotificationsRead
 * - Empty state renders when inbox is empty
 * - Category filter chips render
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as notificationApi from '@/lib/notificationApi'
import { NotificationCenter } from '@/components/shared/NotificationCenter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderComponent() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <NotificationCenter />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockUnreadItem = {
  id: 'notif-001',
  eventCode: 'GST_DEADLINE_3_DAYS',
  category: 'GST' as const,
  title: 'GST Return Due in 3 Days',
  body: 'Your GSTR-3B for March 2026 is due on 20 April 2026.',
  status: 'UNREAD' as const,
  sentAt: new Date().toISOString(),
  deepLinkUrl: '/gst',
  deepLinkLabel: 'View GST Dashboard',
  linkedEntityType: null,
  linkedEntityId: null,
  linkedEntityLabel: null,
}

const mockReadItem = {
  ...mockUnreadItem,
  id: 'notif-002',
  status: 'READ' as const,
  title: 'ITR Refund Credited',
  eventCode: 'ITR_REFUND_CREDITED',
  category: 'ITR' as const,
}

const mockInboxWithUnread = {
  items: [mockUnreadItem, mockReadItem],
  totalCount: 2,
  unreadCount: 1,
}

const mockInboxEmpty = {
  items: [],
  totalCount: 0,
  unreadCount: 0,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.spyOn(notificationApi, 'getNotificationInbox').mockResolvedValue(mockInboxWithUnread)
    vi.spyOn(notificationApi, 'markNotificationRead').mockResolvedValue(undefined)
    vi.spyOn(notificationApi, 'markAllNotificationsRead').mockResolvedValue(undefined)
  })

  // ──────────────────────────────────────────────────────────────
  // Bell button
  // ──────────────────────────────────────────────────────────────

  it('renders bell button with correct aria-label', () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    expect(bell).toBeTruthy()
  })

  it('bell button has aria-haspopup and aria-expanded=false initially', () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    expect(bell.getAttribute('aria-haspopup')).toBe('true')
    expect(bell.getAttribute('aria-expanded')).toBe('false')
  })

  // ──────────────────────────────────────────────────────────────
  // Unread badge dot
  // ──────────────────────────────────────────────────────────────

  it('unread dot is visible when unreadCount > 0', async () => {
    renderComponent()
    // The badge query is always active — wait for it
    await waitFor(() => {
      const dot = document.querySelector('[aria-label*="unread notifications"]')
      expect(dot).toBeTruthy()
    })
  })

  it('unread dot is hidden when unreadCount is 0', async () => {
    vi.spyOn(notificationApi, 'getNotificationInbox').mockResolvedValue(mockInboxEmpty)
    renderComponent()
    await waitFor(() => {
      const dot = document.querySelector('[aria-label*="unread notifications"]')
      expect(dot).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────
  // Dropdown open / close
  // ──────────────────────────────────────────────────────────────

  it('clicking bell opens the dropdown', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    const dialog = screen.getByRole('dialog', { name: /notifications/i })
    expect(dialog).toBeTruthy()
  })

  it('aria-expanded becomes true when dropdown is open', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    expect(bell.getAttribute('aria-expanded')).toBe('true')
  })

  // ──────────────────────────────────────────────────────────────
  // Loading state
  // ──────────────────────────────────────────────────────────────

  it('shows loading skeleton inside dropdown while fetching', async () => {
    vi.spyOn(notificationApi, 'getNotificationInbox').mockReturnValue(new Promise(() => {}))
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  // ──────────────────────────────────────────────────────────────
  // Notification items
  // ──────────────────────────────────────────────────────────────

  it('renders notification titles after data loads', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    const title = await screen.findByText('GST Return Due in 3 Days')
    expect(title).toBeTruthy()
  })

  it('renders notification body text', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    // Multiple items may render the same body text (e.g. badge query + inbox query) — just confirm at least one exists
    const bodies = await screen.findAllByText(/GSTR-3B for March 2026/)
    expect(bodies.length).toBeGreaterThan(0)
  })

  // ──────────────────────────────────────────────────────────────
  // Mark as read
  // ──────────────────────────────────────────────────────────────

  it('clicking an unread notification calls markNotificationRead', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    // Wait for the notification to render
    const titleEls = await screen.findAllByText('GST Return Due in 3 Days')
    // Navigate up to the containing button element
    const rowButton = titleEls[0].closest('button')
    expect(rowButton).toBeTruthy()
    await userEvent.click(rowButton!)
    await waitFor(() => expect(notificationApi.markNotificationRead).toHaveBeenCalledWith('notif-001'))
  })

  // ──────────────────────────────────────────────────────────────
  // Mark all read
  // ──────────────────────────────────────────────────────────────

  it('Mark all read button is visible when there are unread items', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    await screen.findByText('GST Return Due in 3 Days')
    const markAllBtn = screen.getByRole('button', { name: /mark all read/i })
    expect(markAllBtn).toBeTruthy()
  })

  it('clicking Mark all read calls markAllNotificationsRead', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    await screen.findByText('GST Return Due in 3 Days')
    const markAllBtn = screen.getByRole('button', { name: /mark all read/i })
    await userEvent.click(markAllBtn)
    await waitFor(() => expect(notificationApi.markAllNotificationsRead).toHaveBeenCalledTimes(1))
  })

  // ──────────────────────────────────────────────────────────────
  // Empty state
  // ──────────────────────────────────────────────────────────────

  it('shows empty state when inbox has no items', async () => {
    vi.spyOn(notificationApi, 'getNotificationInbox').mockResolvedValue(mockInboxEmpty)
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    // Empty state renders a heading
    const emptyHeading = await screen.findByText(/all caught up/i)
    expect(emptyHeading).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────
  // Category filter chips
  // ──────────────────────────────────────────────────────────────

  it('renders category filter chips inside dropdown', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    await screen.findByText('GST Return Due in 3 Days')
    // Filter chips: All, GST, ITR, Callback
    const gstChips = screen.getAllByRole('button', { name: 'GST' })
    expect(gstChips.length).toBeGreaterThan(0)
  })

  it('View all button is present in footer', async () => {
    renderComponent()
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    await screen.findByText('GST Return Due in 3 Days')
    const viewAll = screen.getByRole('button', { name: /view all/i })
    expect(viewAll).toBeTruthy()
  })
})
