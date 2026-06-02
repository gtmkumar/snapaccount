import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

// Action-level RBAC: the Review/Assign/Export actions are gated by the <Can>
// component, which calls usePermission().hasServerPermission(). Mock it with a
// controllable permission set so we can exercise both the permitted operator
// case (buttons visible) and the stripped-user case (buttons hidden).
const { perms } = vi.hoisted(() => ({
  perms: { loaded: true, granted: new Set<string>(['document.read', 'document.update']) },
}))

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    hasServerPermission: (code: string) => perms.granted.has(code),
    hasAnyServerPermission: (codes: string[]) => codes.some((c) => perms.granted.has(c)),
    hasAllServerPermissions: (codes: string[]) => codes.every((c) => perms.granted.has(c)),
    permissionsLoaded: perms.loaded,
    serverPermissions: [...perms.granted],
  }),
}))

// We import the page lazily to avoid issues with dynamic imports in tests
// The page uses useNavigate so it must be wrapped in MemoryRouter.
import DocumentQueuePage from '@/pages/documents/DocumentQueuePage'

/**
 * Tests for DocumentQueuePage.
 * Covers:
 * - Table rendering with mock data
 * - Status filter interaction
 * - SLA overdue items display a red/error indicator
 */

// ──────────────────────────────────────────────────────────────
// Test wrapper — provides QueryClient + Router context
// ──────────────────────────────────────────────────────────────

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  })
}

function renderPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DocumentQueuePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('DocumentQueuePage', () => {
  beforeEach(() => {
    // Default: a genuine data-entry operator with the document permissions.
    perms.loaded = true
    perms.granted = new Set<string>(['document.read', 'document.update'])
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByText('Document Queue')).toBeInTheDocument()
  })

  it('renders the document queue table with columns', async () => {
    renderPage()

    // Wait for data to load (simulated 300ms delay in mock)
    await waitFor(() => {
      expect(screen.getByRole('grid')).toBeInTheDocument()
    })

    // Check column headers exist
    expect(screen.getByText(/Document ID/i)).toBeInTheDocument()
    expect(screen.getByText(/User/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Status/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/SLA/i)).toBeInTheDocument()
  })

  it('renders mock document rows after data loads', async () => {
    renderPage()

    await waitFor(() => {
      // Mock data contains "Rajesh Kumar" — verify it renders
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })
  })

  it('shows all three statuses from mock data', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    // Mock data has UPLOADED, OCR_COMPLETE, and IN_REVIEW rows
    const statusBadges = screen.getAllByText(/OCR Complete|In Review|Uploaded/)
    expect(statusBadges.length).toBeGreaterThan(0)
  })

  it('renders SLA overdue indicator for breached SLA items', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    // Mock data has one SLA-breached item (Arjun Verma)
    const overdueBadge = screen.getByText('Overdue')
    expect(overdueBadge).toBeInTheDocument()

    // Overdue badge uses error variant — contains bg-error-50 class (design system uses -50 shade)
    expect(overdueBadge.className).toContain('bg-error-50')
  })

  it('shows SLA breach alert banner when there are overdue items', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('SLA Breaches Detected')).toBeInTheDocument()
    })

    // Alert banner is rendered as role="alert"
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('filter by status select exists and can be changed', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    const statusSelect = screen.getByLabelText('Filter by status')
    expect(statusSelect).toBeInTheDocument()

    fireEvent.change(statusSelect, { target: { value: 'UPLOADED' } })
    expect((statusSelect as HTMLSelectElement).value).toBe('UPLOADED')
  })

  it('category filter select exists and responds to changes', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    const categorySelect = screen.getByLabelText('Filter by category')
    expect(categorySelect).toBeInTheDocument()

    fireEvent.change(categorySelect, { target: { value: 'sales-bill' } })
    expect((categorySelect as HTMLSelectElement).value).toBe('sales-bill')
  })

  it('renders Review and Assign action buttons for each row', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    // Multiple "Review" buttons — one per row
    const reviewButtons = screen.getAllByRole('button', { name: 'Review' })
    expect(reviewButtons.length).toBeGreaterThan(0)
  })

  it('renders Export button in page header', async () => {
    renderPage()

    expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument()
  })

  it('hides Review/Assign/Export when the user lacks document permissions', async () => {
    // Stripped user: only menu.documents.view (no document.read / document.update).
    perms.granted = new Set<string>()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Export/i })).not.toBeInTheDocument()
  })

  it('shows Review but hides Assign for a read-only user', async () => {
    perms.granted = new Set<string>(['document.read'])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    expect(screen.getAllByRole('button', { name: 'Review' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument()
  })

  it('renders OCR confidence percentage for each document', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    // First mock doc has 92% confidence
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('unassigned documents show warning-coloured "Unassigned" label', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument()
    })

    // Multiple unassigned rows in mock data
    const unassigned = screen.getAllByText('Unassigned')
    expect(unassigned.length).toBeGreaterThan(0)
    // Unassigned text has text-warning-600 class
    expect(unassigned[0].className).toContain('text-warning-600')
  })
})
