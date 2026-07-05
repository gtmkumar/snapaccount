/**
 * CallbackListPage — unit tests
 * Phase 6E
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as callbackApi from '@/lib/callbackApi'
import CallbackListPage from '@/pages/callbacks/CallbackListPage'

// GAP-053: KPI button is now wrapped in <Can> — mock usePermission so tests
// see admin.dashboard.read as granted (mirrors SUPER_ADMIN / OPERATIONS_MANAGER).
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasServerPermission: () => true,
    hasAnyServerPermission: () => true,
    hasAllServerPermissions: () => true,
    hasPermission: () => true,
    permissionsLoaded: true,
    serverPermissions: ['callback.read', 'callback.kpi.read', 'admin.dashboard.read'],
  }),
}))

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

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/callbacks']}>
        <CallbackListPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockCallback = {
  id: 'cb-001',
  userId: 'u-001',
  userName: 'Rajesh M',
  userPhone: '+91 98765 43210',
  organizationId: 'org-001',
  status: 'PENDING' as const,
  category: 'GST' as const,
  priority: 'HIGH' as const,
  requestedAt: new Date(Date.now() - 2 * 60000).toISOString(),
  slaExpiresAt: new Date(Date.now() + 3 * 3600000).toISOString(),
}

const mockListResponse = {
  items: [mockCallback],
  page: 1,
  total: 1,
  summary: { open: 1, scheduled: 0, breached: 0, avgTtrMinutes: 0 },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CallbackListPage', () => {
  beforeEach(() => {
    vi.spyOn(callbackApi, 'listCallbacks').mockResolvedValue(mockListResponse)
  })

  it('renders page title', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('shows loading skeleton initially', () => {
    vi.spyOn(callbackApi, 'listCallbacks').mockReturnValue(new Promise(() => {}))
    renderPage()
    // Table skeleton rows are present (animate-pulse elements)
    const rows = document.querySelectorAll('.animate-pulse')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('renders callback row after data loads', async () => {
    renderPage()
    const cells = await screen.findAllByText('Rajesh M')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('renders GST category badge', async () => {
    renderPage()
    const badges = await screen.findAllByText('GST')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders status badge PENDING', async () => {
    renderPage()
    const badges = await screen.findAllByText('Pending')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('shows summary stats strip when summary is present', async () => {
    renderPage()
    await screen.findAllByText('Rajesh M')
    // Stats strip should show Open count
    const openEls = screen.getAllByText('Open')
    expect(openEls.length).toBeGreaterThan(0)
  })

  it('renders density toggle buttons', async () => {
    // DG-ADMIN-10: density vocabulary migrated from 'dense' to 'compact'
    // aligned with shared DataTable pattern (dataTable.density.roomy / .compact keys)
    renderPage()
    await screen.findAllByText('Rajesh M')
    expect(screen.getAllByText('Roomy').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Compact').length).toBeGreaterThan(0)
  })

  it('renders KPI button', async () => {
    renderPage()
    const kpiBtns = await screen.findAllByText('KPI Dashboard')
    expect(kpiBtns.length).toBeGreaterThan(0)
  })

  it('renders SLA remaining indicator', async () => {
    renderPage()
    await screen.findAllByText('Rajesh M')
    // SLA remaining should be visible (3h remaining)
    const slaEl = document.querySelector('[aria-label*="SLA"]')
    expect(slaEl).toBeTruthy()
  })

  it('shows empty state when no callbacks', async () => {
    vi.spyOn(callbackApi, 'listCallbacks').mockResolvedValue({
      items: [],
      page: 1,
      total: 0,
    })
    renderPage()
    const empties = await screen.findAllByText('No callbacks yet')
    expect(empties.length).toBeGreaterThan(0)
  })

  it('shows filter bar with status dropdown', async () => {
    renderPage()
    await screen.findAllByText('Rajesh M')
    const statusSelects = screen.getAllByRole('combobox')
    expect(statusSelects.length).toBeGreaterThan(0)
  })
})
