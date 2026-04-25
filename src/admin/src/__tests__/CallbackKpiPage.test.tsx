/**
 * CallbackKpiPage — unit tests
 * Phase 6E
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as callbackApi from '@/lib/callbackApi'
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

const mockKpi = {
  open: 42,
  avgTtrSeconds: 8040,
  slaCompliance: 94.3,
  completed: 128,
  deltas: {
    open: 8,
    avgTtrSeconds: -720,
    slaCompliance: 1.2,
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
    const skeletons = document.querySelectorAll('.animate-pulse')
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

  it('renders SLA compliance value', async () => {
    renderPage()
    await screen.findByText('42')
    // SLA compliance 94.3%
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
})
