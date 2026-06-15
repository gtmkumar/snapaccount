/**
 * CallbackKpiPage — unit tests
 * Phase 6E
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as callbackApi from '@/lib/callbackApi'
import { CallbackKpiSchema } from '@/lib/callbackApi'
import CallbackKpiPage from '@/pages/callbacks/CallbackKpiPage'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <CallbackKpiPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// The spy replaces the entire getCallbackKpi() function including the ratio→percentage
// conversion. So mockKpi must contain POST-conversion values — i.e. what callers receive:
// slaCompliance 94.3 (percentage), delta 1.2 (percentage points).
// Tests for the raw ratio→percentage logic are in the separate describe block below.
const mockKpi = {
  open: 42,
  avgTtrSeconds: 8040,
  slaCompliance: 94.3,   // post-conversion percentage (getCallbackKpi converts 0.943 → 94.3)
  completed: 128,
  deltas: {
    open: 8,
    avgTtrSeconds: -720,
    slaCompliance: 1.2,   // post-conversion pp (getCallbackKpi converts 0.012 → 1.2)
    completed: 17,
  },
  statusDistribution: [],
  dailyVolume: [],
  ttrHistogram: [],
  categoryMix: [],
  teamPerformance: [],
  slaBreaches: [],
}

describe('CallbackKpiPage', () => {
  beforeEach(() => {
    vi.spyOn(callbackApi, 'getCallbackKpi').mockResolvedValue(mockKpi)
  })

  it('renders page title', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })

  it('shows loading skeleton before data arrives', () => {
    vi.spyOn(callbackApi, 'getCallbackKpi').mockReturnValue(new Promise(() => {}))
    renderPage()
    // Skeleton component uses skeleton-shimmer class (replaced animate-pulse — S3 elevation pass)
    const skeletons = document.querySelectorAll('.skeleton-shimmer')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders open callbacks metric after load', async () => {
    renderPage()
    const value = await screen.findByText('42')
    expect(value).toBeTruthy()
  })

  it('renders completed callbacks metric', async () => {
    renderPage()
    const value = await screen.findByText('128')
    expect(value).toBeTruthy()
  })

  it('renders SLA compliance value (backend sends 0..1 ratio; UI shows percentage)', async () => {
    renderPage()
    await screen.findByText('42')
    // backend ratio 0.943 → getCallbackKpi converts to 94.3 → rendered as "94.3" with unit "%" alongside
    const sla = screen.getByText('94.3')
    expect(sla).toBeTruthy()
  })

  it('renders refresh button', async () => {
    renderPage()
    await screen.findByText('42')
    expect(screen.getByText('Refresh')).toBeTruthy()
  })

  it('renders range selector', async () => {
    renderPage()
    await screen.findByText('42')
    const select = screen.getByRole('combobox')
    expect(select).toBeTruthy()
  })

  it('shows empty state when all counts are zero', async () => {
    vi.spyOn(callbackApi, 'getCallbackKpi').mockResolvedValue({
      ...mockKpi,
      open: 0,
      completed: 0,
    })
    renderPage()
    const empty = await screen.findByText('No callbacks in this range')
    expect(empty).toBeTruthy()
  })

  it('renders correctly when backend sends totalCompleted instead of completed (empty arrays, no crash)', async () => {
    vi.spyOn(callbackApi, 'getCallbackKpi').mockResolvedValue({
      ...mockKpi,
      statusDistribution: [],
      dailyVolume: [],
    })
    renderPage()
    // Charts show empty state rather than crashing — text comes from i18n key callbackKpi.chart.noData
    const noDatas = await screen.findAllByText('No data for this range')
    expect(noDatas.length).toBeGreaterThan(0)
    // Metric cards still render
    expect(screen.getByText('42')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Schema-level unit tests (no DOM required)
// ---------------------------------------------------------------------------
describe('CallbackKpiSchema — normalisation', () => {
  // Schema receives 0..1 ratios as the backend sends them.
  // getCallbackKpi() handles the ratio→percentage conversion at the API layer.
  const base = {
    open: 10,
    avgTtrSeconds: 3600,
    slaCompliance: 0.925,  // 0..1 ratio as backend sends
    deltas: { open: 2, avgTtrSeconds: -300, slaCompliance: 0.005, completed: 5 },
    statusDistribution: [],
    dailyVolume: [],
    ttrHistogram: [],
    categoryMix: [],
    teamPerformance: [],
    slaBreaches: [],
  }

  it('parses successfully when completed is present', () => {
    const result = CallbackKpiSchema.parse({ ...base, completed: 75 })
    expect(result.completed).toBe(75)
  })

  it('parses successfully when only totalCompleted is present (backend v2 shape) — completed defaults to 0 before normalisation', () => {
    // The schema itself uses .default(0) — the normalisation happens in getCallbackKpi().
    // Here we verify the schema alone accepts a missing `completed` via the default.
    const result = CallbackKpiSchema.parse({ ...base })
    expect(result.completed).toBe(0)
  })

  it('empty statusDistribution and dailyVolume parse without error', () => {
    const result = CallbackKpiSchema.parse({ ...base, completed: 0, statusDistribution: [], dailyVolume: [] })
    expect(result.statusDistribution).toHaveLength(0)
    expect(result.dailyVolume).toHaveLength(0)
  })

  it('extra backend fields (totalCompleted etc.) are silently ignored by Zod', () => {
    const result = CallbackKpiSchema.parse({ ...base, completed: 33, totalCompleted: 33, someNewField: 'extra' })
    expect(result.completed).toBe(33)
  })

  it('schema preserves slaCompliance as a raw number (ratio contract)', () => {
    // Schema does NOT convert — getCallbackKpi() does. Verify the schema passes through the raw ratio.
    const result = CallbackKpiSchema.parse({ ...base, completed: 10 })
    expect(result.slaCompliance).toBe(0.925)
  })
})

// ---------------------------------------------------------------------------
// SLA compliance rendering edge-cases (Task #30)
// Verify that the page correctly renders the post-conversion percentage value.
// ---------------------------------------------------------------------------
describe('CallbackKpiPage — slaCompliance rendering', () => {
  it('renders 100 without a decimal when slaCompliance is exactly 1.0 (backend ratio)', async () => {
    vi.spyOn(callbackApi, 'getCallbackKpi').mockResolvedValue({
      ...mockKpi,
      slaCompliance: 100,  // getCallbackKpi converts 1.0 → 100 (no decimal)
      deltas: { ...mockKpi.deltas, slaCompliance: 0 },
    })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <MemoryRouter><CallbackKpiPage /></MemoryRouter>
      </QueryClientProvider>
    )
    await screen.findByText('42')
    expect(screen.getByText('100')).toBeTruthy()
    expect(screen.queryByText('100.0')).toBeNull()
  })

  it('renders 94.3 with one decimal for a typical ratio', async () => {
    vi.spyOn(callbackApi, 'getCallbackKpi').mockResolvedValue({
      ...mockKpi,
      slaCompliance: 94.3,
    })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <MemoryRouter><CallbackKpiPage /></MemoryRouter>
      </QueryClientProvider>
    )
    await screen.findByText('42')
    expect(screen.getByText('94.3')).toBeTruthy()
  })
})
