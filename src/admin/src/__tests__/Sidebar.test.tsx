/**
 * Sidebar — backend-driven navigation (gap #1) tests.
 * Verifies the sidebar renders from the /auth/me/menu tree, and falls back to the
 * static role/permission-gated list when the menu endpoint is unavailable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as menuApi from '@/lib/menuApi'
import { Sidebar } from '@/components/layout/Sidebar'

// Stable auth + permission context (SUPER_ADMIN so the static fallback is broad).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'admin@snap.in', displayName: 'Admin', photoURL: null, role: 'SUPER_ADMIN' },
    loading: false,
    error: null,
    signOut: vi.fn(),
  }),
}))
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    canAccess: () => true,
    hasServerPermission: () => true,
    serverPermissions: ['*'],
  }),
}))

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderSidebar() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <Sidebar collapsed={false} onToggle={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const menuTree: menuApi.MenuNode[] = [
  { key: 'dashboard', label: 'Dashboard', iconKey: 'LayoutDashboard', url: '/dashboard', children: [] },
  {
    key: 'loans', label: 'Loans', iconKey: 'CreditCard', url: '/loans',
    children: [
      { key: 'loans.partner_banks', label: 'Partner Banks', iconKey: 'CreditCard', url: '/loans/partner-banks', children: [] },
    ],
  },
]

beforeEach(() => vi.clearAllMocks())

describe('Sidebar — data-driven menu', () => {
  it('renders the menu tree from /auth/me/menu (incl. nested children)', async () => {
    vi.spyOn(menuApi, 'getMyMenu').mockResolvedValue(menuTree)
    renderSidebar()

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Loans')).toBeInTheDocument()
      // Nested child is flattened into the rendered list.
      expect(screen.getByText('Partner Banks')).toBeInTheDocument()
    })
    expect(screen.getByText('Loans').closest('a')).toHaveAttribute('href', '/loans')
  })

  it('falls back to the static list when the menu endpoint fails', async () => {
    vi.spyOn(menuApi, 'getMyMenu').mockRejectedValue(new Error('menu unavailable'))
    renderSidebar()

    // Static fallback still renders the core items (SUPER_ADMIN + canAccess→true).
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Team')).toBeInTheDocument()
    })
  })
})
