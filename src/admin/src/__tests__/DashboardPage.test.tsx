/**
 * DashboardPage — unit tests
 *
 * Covers:
 *   - Page renders key sections (Tier 1, Tier 2, Tier 3)
 *   - Tier3TabBar ARIA keyboard navigation (BUG-DASH-KB-004)
 *     ArrowRight / ArrowLeft (wrap-around), Home / End
 *   - Roving tabIndex: active tab = 0, inactive tabs = -1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

// ── Permission mock — grant dashboard.full so Tier3 renders ─────────────────
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasServerPermission: () => true,
    hasAnyServerPermission: () => true,
    hasAllServerPermissions: () => true,
    hasPermission: () => true,
    permissionsLoaded: true,
    serverPermissions: ['dashboard.full', 'dashboard.system_health'],
  }),
}))

// ── Dashboard API mock ──────────────────────────────────────────────────────
vi.mock('@/lib/dashboardApi', () => ({
  getAdminDashboardStats: vi.fn().mockResolvedValue({
    pendingDocuments: 10,
    gstReturnsDueToday: 0,
    itrVerificationsPending: 5,
    openCallbacks: 3,
    loanApplicationsActive: 7,
    errors: {},
  }),
  getAdminDashboardActivity: vi.fn().mockResolvedValue([]),
  getAdminChatQueueSnapshot: vi.fn().mockResolvedValue([]),
  getAdminTeamWorkload: vi.fn().mockResolvedValue([]),
  getAdminAuditEvents: vi.fn().mockResolvedValue([]),
}))

// ── Recharts stub (avoids ResizeObserver issues in jsdom) ──────────────────
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import DashboardPage from '@/pages/dashboard/DashboardPage'

// ── Helpers ────────────────────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Basic render ──────────────────────────────────────────────────────────

  it('renders the dashboard page title', () => {
    renderPage()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders Tier 1 metric cards', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pending Documents')).toBeInTheDocument()
      expect(screen.getByText('GST Returns Due Today')).toBeInTheDocument()
      expect(screen.getByText('Open Callbacks')).toBeInTheDocument()
    })
  })

  it('renders Tier 2 metric cards', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('ITR Verifications Pending')).toBeInTheDocument()
      expect(screen.getByText('Active Loan Applications')).toBeInTheDocument()
    })
  })

  it('renders Tier 3 tablist when dashboard.full permission is granted', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument()
    })
  })

  // ── Tier3TabBar ARIA keyboard navigation (BUG-DASH-KB-004) ───────────────

  describe('Tier3TabBar keyboard navigation (BUG-DASH-KB-004)', () => {
    async function getTabs() {
      renderPage()
      // Wait for the tablist to appear (Tier3 section needs dashboard.full)
      const tablist = await screen.findByRole('tablist')
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]')) as HTMLElement[]
      expect(tabs.length).toBe(3)
      return tabs
    }

    it('first tab has tabIndex=0 and inactive tabs have tabIndex=-1 (roving tabIndex)', async () => {
      const tabs = await getTabs()
      // First tab is "activity" — selected by default
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
      expect(tabs[0]).toHaveAttribute('tabindex', '0')
      expect(tabs[1]).toHaveAttribute('tabindex', '-1')
      expect(tabs[2]).toHaveAttribute('tabindex', '-1')
    })

    it('ArrowRight moves focus to the next tab', async () => {
      const tabs = await getTabs()
      // Focus the first tab
      tabs[0].focus()
      fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
      await waitFor(() => {
        // Second tab should now be selected
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
        expect(tabs[1]).toHaveAttribute('tabindex', '0')
        expect(tabs[0]).toHaveAttribute('tabindex', '-1')
      })
    })

    it('ArrowLeft moves focus to the previous tab', async () => {
      const tabs = await getTabs()
      // Click the second tab first to activate it
      fireEvent.click(tabs[1])
      await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-selected', 'true'))

      fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' })
      await waitFor(() => {
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
        expect(tabs[0]).toHaveAttribute('tabindex', '0')
      })
    })

    it('ArrowRight wraps from last tab to first', async () => {
      const tabs = await getTabs()
      // Navigate to the last tab first
      fireEvent.click(tabs[2])
      await waitFor(() => expect(tabs[2]).toHaveAttribute('aria-selected', 'true'))

      fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
      await waitFor(() => {
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
        expect(tabs[0]).toHaveAttribute('tabindex', '0')
      })
    })

    it('ArrowLeft wraps from first tab to last', async () => {
      const tabs = await getTabs()
      // Focus first tab
      tabs[0].focus()
      fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
      await waitFor(() => {
        expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
        expect(tabs[2]).toHaveAttribute('tabindex', '0')
      })
    })

    it('Home key moves focus to the first tab', async () => {
      const tabs = await getTabs()
      // Navigate to last tab first
      fireEvent.click(tabs[2])
      await waitFor(() => expect(tabs[2]).toHaveAttribute('aria-selected', 'true'))

      fireEvent.keyDown(tabs[2], { key: 'Home' })
      await waitFor(() => {
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
        expect(tabs[0]).toHaveAttribute('tabindex', '0')
      })
    })

    it('End key moves focus to the last tab', async () => {
      const tabs = await getTabs()
      // Start at first tab
      tabs[0].focus()
      fireEvent.keyDown(tabs[0], { key: 'End' })
      await waitFor(() => {
        expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
        expect(tabs[2]).toHaveAttribute('tabindex', '0')
      })
    })

    it('ArrowRight key calls preventDefault to prevent page scroll', async () => {
      const tabs = await getTabs()
      tabs[0].focus()
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
      tabs[0].dispatchEvent(event)
      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('active tab has aria-selected=true, inactive tabs have aria-selected=false', async () => {
      const tabs = await getTabs()
      // Default: first tab active
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
      expect(tabs[2]).toHaveAttribute('aria-selected', 'false')

      // Click second tab — it becomes active
      fireEvent.click(tabs[1])
      await waitFor(() => {
        expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
        expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
      })
    })
  })
})
