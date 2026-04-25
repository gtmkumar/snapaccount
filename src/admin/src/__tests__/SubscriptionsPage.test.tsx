/**
 * SubscriptionsPage — Phase 6F smoke tests
 * Covers: Plans CRUD; MRR dashboard renders; create/edit plan dialog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as subscriptionApi from '@/lib/subscriptionApi'
import SubscriptionsPage from '@/pages/subscriptions/SubscriptionsPage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <SubscriptionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const mockMrr: subscriptionApi.MrrDashboard = {
  totalMrr: 1250000,
  activeCount: 42,
  trialingCount: 8,
  pastDueCount: 3,
  cancelledCount: 12,
}

const makePlan = (overrides: Partial<subscriptionApi.Plan> = {}): subscriptionApi.Plan => ({
  planId: 'plan-001',
  name: 'Starter Plan',
  tier: 'Starter',
  billingCycle: 1,
  priceInr: 99900,
  trialDays: 14,
  isActive: true,
  description: 'For small businesses',
  ...overrides,
})

const mockPlans: subscriptionApi.Plan[] = [
  makePlan({ planId: 'plan-001', name: 'Starter Plan', tier: 'Starter', priceInr: 99900 }),
  makePlan({ planId: 'plan-002', name: 'Growth Plan', tier: 'Growth', priceInr: 249900, trialDays: 0 }),
  // Use a different name from the tier to avoid duplicate-text issues in tests
  makePlan({ planId: 'plan-003', name: 'Enterprise Plus', tier: 'Enterprise', priceInr: 599900, isActive: false }),
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(subscriptionApi, 'getMrrDashboard').mockResolvedValue(mockMrr)
  vi.spyOn(subscriptionApi, 'listPlans').mockResolvedValue(mockPlans)
  vi.spyOn(subscriptionApi, 'createPlan').mockResolvedValue({ planId: 'plan-new', name: 'New Plan', priceInr: 4999 })
  vi.spyOn(subscriptionApi, 'updatePlan').mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionsPage', () => {
  it('renders page title', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeInTheDocument()
    })
  })

  it('renders New Plan button', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('New Plan')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // MRR dashboard
  // ---------------------------------------------------------------------------

  it('renders MRR KPI card with correct value', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('MRR')).toBeInTheDocument()
      // 1250000 → ₹12,50,000 via formatIndianAmount
      expect(screen.getByText(/12,50,000/)).toBeInTheDocument()
    })
  })

  it('renders Active subscribers count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })

  it('renders Past Due count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Past Due')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('renders Cancelled count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Plans tab
  // ---------------------------------------------------------------------------

  it('clicking Plans tab shows plans table', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Plans'))

    fireEvent.click(screen.getByText('Plans'))

    await waitFor(() => {
      expect(screen.getByText('Starter Plan')).toBeInTheDocument()
      expect(screen.getByText('Growth Plan')).toBeInTheDocument()
    })
  })

  it('renders tier badges on plans table', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Plans'))
    fireEvent.click(screen.getByText('Plans'))

    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument()
      expect(screen.getByText('Growth')).toBeInTheDocument()
      expect(screen.getByText('Enterprise')).toBeInTheDocument()
    })
  })

  it('renders price formatted as Indian amounts', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Plans'))
    fireEvent.click(screen.getByText('Plans'))

    await waitFor(() => {
      // 99900 → ₹99,900/mo — may appear multiple times (rows + header)
      const priceEls = screen.getAllByText(/99,900\/mo/)
      expect(priceEls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('inactive plan shows Archived status', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Plans'))
    fireEvent.click(screen.getByText('Plans'))

    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Create plan dialog
  // ---------------------------------------------------------------------------

  it('clicking New Plan button opens create dialog', async () => {
    renderPage()
    await waitFor(() => screen.getByText('New Plan'))

    fireEvent.click(screen.getByText('New Plan'))

    await waitFor(() => {
      // Dialog title + footer button both say "Create Plan" — check at least one exists
      expect(screen.getAllByText('Create Plan').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('create dialog shows Plan Name and Price fields', async () => {
    renderPage()
    await waitFor(() => screen.getByText('New Plan'))
    fireEvent.click(screen.getByText('New Plan'))

    await waitFor(() => {
      expect(screen.getByText('Plan Name *')).toBeInTheDocument()
      expect(screen.getByText(/Price.*\/month/)).toBeInTheDocument()
    })
  })

  it('create dialog Submit is disabled when fields are empty', async () => {
    renderPage()
    await waitFor(() => screen.getByText('New Plan'))
    fireEvent.click(screen.getByText('New Plan'))

    await waitFor(() => screen.getAllByText('Create Plan').length > 0)
    // The footer Create Plan button is the last occurrence
    const createBtns = screen.getAllByText('Create Plan')
    const submitBtn = createBtns[createBtns.length - 1]
    expect(submitBtn).toBeDisabled()
  })

  it('filling name + price enables create button and calls createPlan', async () => {
    renderPage()
    await waitFor(() => screen.getByText('New Plan'))
    fireEvent.click(screen.getByText('New Plan'))

    await waitFor(() => screen.getByText('Plan Name *'))

    // Find and fill inputs
    const nameInput = screen.getByPlaceholderText('e.g. Starter Plan')
    const priceInput = screen.getByPlaceholderText('999')

    fireEvent.change(nameInput, { target: { value: 'My Plan' } })
    fireEvent.change(priceInput, { target: { value: '4999' } })

    // Submit button should now be enabled
    const createBtns = screen.getAllByText('Create Plan')
    const submitBtn = createBtns[createBtns.length - 1]
    expect(submitBtn).not.toBeDisabled()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(subscriptionApi.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Plan', priceInr: 4999 })
      )
    })
  })

  it('Cancel button closes create dialog', async () => {
    renderPage()
    await waitFor(() => screen.getByText('New Plan'))
    fireEvent.click(screen.getByText('New Plan'))

    await waitFor(() => screen.getByText('Cancel'))
    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('e.g. Starter Plan')).not.toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Edit plan dialog
  // ---------------------------------------------------------------------------

  it('clicking Edit button opens edit dialog with correct title', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Plans'))
    fireEvent.click(screen.getByText('Plans'))

    await waitFor(() => screen.getByText('Starter Plan'))

    const editBtns = screen.getAllByRole('button', { name: 'Edit plan' })
    fireEvent.click(editBtns[0]!)

    await waitFor(() => {
      expect(screen.getByText('Edit Plan')).toBeInTheDocument()
    })
  })

  it('saving edited plan calls updatePlan with plan fields', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Plans'))
    fireEvent.click(screen.getByText('Plans'))

    await waitFor(() => screen.getByText('Starter Plan'))

    const editBtns = screen.getAllByRole('button', { name: 'Edit plan' })
    fireEvent.click(editBtns[0]!)

    await waitFor(() => screen.getByText('Edit Plan'))

    // The name input may or may not be pre-filled — just fill it to enable Save
    const nameInputs = screen.getAllByPlaceholderText('e.g. Starter Plan')
    fireEvent.change(nameInputs[0]!, { target: { value: 'Updated Starter' } })

    // Price may also need to be set — fill the price input
    const priceInputs = screen.getAllByPlaceholderText('999')
    if (priceInputs.length > 0) {
      fireEvent.change(priceInputs[0]!, { target: { value: '99900' } })
    }

    const saveBtn = screen.getByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(subscriptionApi.updatePlan).toHaveBeenCalledWith(
        'plan-001',
        expect.objectContaining({ name: 'Updated Starter' })
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Toggle active/archive
  // ---------------------------------------------------------------------------

  it('clicking Archive button on active plan calls updatePlan with isActive=false', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Plans'))
    fireEvent.click(screen.getByText('Plans'))

    await waitFor(() => screen.getByText('Starter Plan'))

    const archiveBtns = screen.getAllByRole('button', { name: 'Archive plan' })
    fireEvent.click(archiveBtns[0]!)

    await waitFor(() => {
      expect(subscriptionApi.updatePlan).toHaveBeenCalledWith(
        'plan-001',
        expect.objectContaining({ isActive: false })
      )
    })
  })
})
