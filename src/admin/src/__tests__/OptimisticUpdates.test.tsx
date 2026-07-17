/**
 * Optimistic updates — regression tests.
 *
 * Verifies the optimistic-mutation contract on the converted surfaces:
 *   1. The UI reflects the action IMMEDIATELY (server still pending).
 *   2. On server failure the previous state is restored and an error toast
 *      tells the user the change was reverted.
 *
 * Covers: FeatureFlagsSettings (flag toggle), NotificationCenter (mark read).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as settingsApi from '@/lib/settingsApi'
import * as notificationApi from '@/lib/notificationApi'
import { FeatureFlagsSettings } from '@/pages/settings/sections/FeatureFlagsSettings'
import { NotificationCenter } from '@/components/shared/NotificationCenter'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

import { toast } from 'sonner'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

/** A promise that never settles — freezes the mutation in its in-flight state. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

// ---------------------------------------------------------------------------
// FeatureFlagsSettings — toggle flips instantly, rolls back on failure
// ---------------------------------------------------------------------------
describe('FeatureFlagsSettings optimistic toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(settingsApi, 'getFeatureFlags').mockResolvedValue({
      whatsapp_messaging: false,
      tally_export: true,
    })
  })

  function getToggle(): HTMLInputElement {
    const toggles = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    // Flags render in insertion order — whatsapp_messaging is first
    return toggles[0]!
  }

  it('flips the toggle immediately while the server call is still pending', async () => {
    vi.spyOn(settingsApi, 'updateFeatureFlag').mockReturnValue(pending())
    wrap(<FeatureFlagsSettings />)
    await waitFor(() => screen.getByText('WhatsApp Messaging'))

    expect(getToggle().checked).toBe(false)
    fireEvent.click(getToggle())

    // Server never responds — the flip must come from the optimistic cache write
    await waitFor(() => expect(getToggle().checked).toBe(true))
    expect(settingsApi.updateFeatureFlag).toHaveBeenCalledWith('whatsapp_messaging', true)
  })

  it('rolls the toggle back and shows an error toast when the server rejects', async () => {
    vi.spyOn(settingsApi, 'updateFeatureFlag').mockRejectedValue(new Error('boom'))
    wrap(<FeatureFlagsSettings />)
    await waitFor(() => screen.getByText('WhatsApp Messaging'))

    fireEvent.click(getToggle())

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await waitFor(() => expect(getToggle().checked).toBe(false))
    expect(toast.success).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// NotificationCenter — unread state clears instantly, restores on failure
// ---------------------------------------------------------------------------
describe('NotificationCenter optimistic mark-read', () => {
  const unreadItem = {
    id: 'notif-001',
    eventCode: 'GST_DEADLINE_3_DAYS',
    category: 'GST' as const,
    title: 'GST Return Due in 3 Days',
    body: 'Your GSTR-3B for March 2026 is due on 20 April 2026.',
    status: 'UNREAD' as const,
    sentAt: new Date().toISOString(),
    deepLinkUrl: null,
    deepLinkLabel: null,
    linkedEntityType: null,
    linkedEntityId: null,
    linkedEntityLabel: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(notificationApi, 'getNotificationInbox').mockResolvedValue({
      items: [unreadItem],
      totalCount: 1,
      unreadCount: 1,
    })
  })

  async function openDropdownWithItem() {
    const bell = screen.getByRole('button', { name: /notifications/i })
    await userEvent.click(bell)
    const titles = await screen.findAllByText('GST Return Due in 3 Days')
    return titles[0]!.closest('button')!
  }

  it('clears the unread indicators immediately while mark-read is pending', async () => {
    vi.spyOn(notificationApi, 'markNotificationRead').mockReturnValue(pending())
    wrap(<NotificationCenter />)
    // Badge dot present from the initial unreadCount=1
    await waitFor(() =>
      expect(document.querySelector('[aria-label*="unread notifications"]')).toBeTruthy()
    )

    const row = await openDropdownWithItem()
    await userEvent.click(row)

    // Server never responds — badge dot must disappear from the optimistic write
    await waitFor(() =>
      expect(document.querySelector('[aria-label*="unread notifications"]')).toBeNull()
    )
  })

  it('restores the unread state and shows an error toast when mark-read fails', async () => {
    vi.spyOn(notificationApi, 'markNotificationRead').mockRejectedValue(new Error('boom'))
    wrap(<NotificationCenter />)
    await waitFor(() =>
      expect(document.querySelector('[aria-label*="unread notifications"]')).toBeTruthy()
    )

    const row = await openDropdownWithItem()
    await userEvent.click(row)

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    // Rollback (then invalidation refetch) restores the unread badge
    await waitFor(() =>
      expect(document.querySelector('[aria-label*="unread notifications"]')).toBeTruthy()
    )
  })

  it('mark-all-read zeroes the badge immediately while the call is pending', async () => {
    vi.spyOn(notificationApi, 'markAllNotificationsRead').mockReturnValue(pending())
    wrap(<NotificationCenter />)
    await waitFor(() =>
      expect(document.querySelector('[aria-label*="unread notifications"]')).toBeTruthy()
    )

    await openDropdownWithItem()
    const markAllBtn = screen.getByRole('button', { name: /mark all read/i })
    await userEvent.click(markAllBtn)

    await waitFor(() =>
      expect(document.querySelector('[aria-label*="unread notifications"]')).toBeNull()
    )
  })
})
