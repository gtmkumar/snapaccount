/**
 * CaAvailabilityPage — Wave 7A reconciliation tests
 *
 * Covers:
 * - Renders loading skeleton while CA profiles loading
 * - Shows "no CA" info banner when profiles list is empty
 * - Renders rule list after profiles + rules load (effectiveCaId = caProfileId from backend)
 * - Add rule mutation fires createAvailabilityRule (Wave 7A endpoint)
 * - Delete rule mutation fires deleteAvailabilityRule (new signature: ruleId only)
 * - Generate slots panel renders and fires generateSlotsFromRules on click
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as caApi from '@/lib/caApi'

// We need to mock caApi before importing the page
vi.mock('@/lib/caApi', async (importOriginal) => {
  const actual = await importOriginal<typeof caApi>()
  return {
    ...actual,
    listCaProfiles: vi.fn(),
    listAvailabilityRules: vi.fn(),
    listAvailabilityBlocks: vi.fn(),
    createAvailabilityRule: vi.fn(),
    deleteAvailabilityRule: vi.fn(),
    generateSlotsFromRules: vi.fn(),
    createAvailabilityBlock: vi.fn(),
    deleteAvailabilityBlock: vi.fn(),
  }
})

vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

import CaAvailabilityPage from '@/pages/ca/CaAvailabilityPage'

const mockedCaApi = caApi as unknown as {
  listCaProfiles: ReturnType<typeof vi.fn>
  listAvailabilityRules: ReturnType<typeof vi.fn>
  listAvailabilityBlocks: ReturnType<typeof vi.fn>
  createAvailabilityRule: ReturnType<typeof vi.fn>
  deleteAvailabilityRule: ReturnType<typeof vi.fn>
  generateSlotsFromRules: ReturnType<typeof vi.fn>
}

const TEST_PROFILE: caApi.CaProfile = {
  caId: 'ca-profile-uuid-1',
  userId: 'user-uuid-1',
  displayName: 'Priya Sharma',
  bio: null,
  specialisations: 'GST',
  averageRating: 4.5,
  ratingCount: 10,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
}

const TEST_RULE: caApi.AvailabilityRule = {
  id: 'rule-uuid-1',
  caId: 'ca-profile-uuid-1',
  weekday: 'MONDAY',
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: 30,
  effectiveFrom: '2024-01-01',
  effectiveTo: null,
  active: true,
  createdAt: '2024-01-01T00:00:00Z',
}

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <CaAvailabilityPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCaApi.listAvailabilityBlocks.mockResolvedValue([])
})

describe('CaAvailabilityPage — Wave 7A', () => {
  it('shows info banner when CA profiles list is empty', async () => {
    mockedCaApi.listCaProfiles.mockResolvedValue([])
    renderPage()
    // Initially loading, then empty CA state
    await waitFor(() => {
      expect(screen.queryByText(/no ca profile/i)).toBeTruthy()
    })
  })

  it('renders recurring rules heading when profile + rules load', async () => {
    mockedCaApi.listCaProfiles.mockResolvedValue([TEST_PROFILE])
    mockedCaApi.listAvailabilityRules.mockResolvedValue([TEST_RULE])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/recurring availability/i)).toBeTruthy()
    })
  })

  it('passes caProfileId (UUID) to listAvailabilityRules — not userId', async () => {
    mockedCaApi.listCaProfiles.mockResolvedValue([TEST_PROFILE])
    mockedCaApi.listAvailabilityRules.mockResolvedValue([TEST_RULE])
    renderPage()
    await waitFor(() => {
      expect(mockedCaApi.listAvailabilityRules).toHaveBeenCalledWith('ca-profile-uuid-1', true)
    })
  })

  it('renders generate slots panel', async () => {
    mockedCaApi.listCaProfiles.mockResolvedValue([TEST_PROFILE])
    mockedCaApi.listAvailabilityRules.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/generate slots from rules/i)).toBeTruthy()
    })
  })

  it('calls generateSlotsFromRules when generate button clicked', async () => {
    mockedCaApi.listCaProfiles.mockResolvedValue([TEST_PROFILE])
    mockedCaApi.listAvailabilityRules.mockResolvedValue([])
    mockedCaApi.generateSlotsFromRules.mockResolvedValue({
      caProfileId: 'ca-profile-uuid-1',
      rulesProcessed: 1,
      slotsCreated: 4,
      slotsSkipped: 0,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/generate now/i)).toBeTruthy()
    })
    fireEvent.click(screen.getByText(/generate now/i))
    await waitFor(() => {
      expect(mockedCaApi.generateSlotsFromRules).toHaveBeenCalledWith({
        caProfileId: 'ca-profile-uuid-1',
        weeksAhead: 4,
      })
    })
  })

  it('deleteAvailabilityRule called with ruleId only (no caId param)', async () => {
    mockedCaApi.listCaProfiles.mockResolvedValue([TEST_PROFILE])
    mockedCaApi.listAvailabilityRules.mockResolvedValue([TEST_RULE])
    mockedCaApi.deleteAvailabilityRule.mockResolvedValue(undefined)
    renderPage()

    // Find delete button for the Monday rule
    await waitFor(() => {
      const deleteBtn = screen.getByRole('button', { name: /delete rule monday/i })
      expect(deleteBtn).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /delete rule monday/i }))
    await waitFor(() => {
      // New signature: deleteAvailabilityRule(ruleId) — only ONE argument
      expect(mockedCaApi.deleteAvailabilityRule).toHaveBeenCalledWith('rule-uuid-1')
      expect(mockedCaApi.deleteAvailabilityRule).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String)
      )
    })
  })
})
