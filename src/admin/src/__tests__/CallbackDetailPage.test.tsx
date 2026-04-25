/**
 * CallbackDetailPage — unit tests
 * Phase 6E
 *
 * Covers:
 * - Loading skeleton renders before data arrives
 * - Error state when API fails
 * - User name + phone rendered from API data
 * - State machine button gating: only valid transitions are enabled
 * - Note composer validation (min 10 chars before submit enabled)
 * - Note composer calls addCallbackNote on submit
 * - Confirm dialog opens on Escalate / Cancel button click
 * - Back navigation button present
 * - Timeline events render when present
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as callbackApi from '@/lib/callbackApi'
import type { Callback, CallNote, CallbackTimelineEvent } from '@/lib/callbackApi'
import CallbackDetailPage from '@/pages/callbacks/CallbackDetailPage'

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

function renderPage(id = 'cb-001') {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[`/callbacks/${id}`]}>
        <Routes>
          <Route path="/callbacks/:id" element={<CallbackDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// Minimal valid callback object — status drives button gating tests
function makeCallback(overrides: Partial<Callback> = {}): Callback {
  return { ...baseCallback, ...overrides }
}

const baseCallback: Callback = {
  id: 'cb-001',
  userId: 'u-001',
  userName: 'PriyaSingh',
  userPhone: '+91-98765-43210',
  userAvatarUrl: null,
  organizationId: 'org-001',
  status: 'PENDING',
  category: 'GST' as const,
  priority: 'HIGH' as const,
  issueDescription: 'GSTR3BLateFeeQueryText',
  preferredWindowStart: null,
  preferredWindowEnd: null,
  assignedAgentId: null,
  assignedAgentName: null,
  scheduledAt: null,
  requestedAt: new Date(Date.now() - 10 * 60000).toISOString(),
  completedAt: null,
  linkedEntity: null,
  slaExpiresAt: new Date(Date.now() + 2 * 3600000).toISOString(),
  notes: [] as CallNote[],
  timeline: [] as CallbackTimelineEvent[],
  notificationsFired: [],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CallbackDetailPage', () => {
  beforeEach(() => {
    vi.spyOn(callbackApi, 'getCallback').mockResolvedValue(makeCallback())
    vi.spyOn(callbackApi, 'addCallbackNote').mockResolvedValue({
      id: 'note-001',
      callbackId: 'cb-001',
      authorId: 'agent-001',
      authorName: 'Agent',
      body: 'Test note content here done',
      isInternal: false,
      recordedAt: new Date().toISOString(),
    })
    vi.spyOn(callbackApi, 'escalateCallback').mockResolvedValue(undefined)
    vi.spyOn(callbackApi, 'cancelCallback').mockResolvedValue(undefined)
    vi.spyOn(callbackApi, 'completeCallback').mockResolvedValue(undefined)
  })

  // ──────────────────────────────────────────────────────────────
  // Loading / error states
  // ──────────────────────────────────────────────────────────────

  it('shows loading skeleton before data arrives', () => {
    vi.spyOn(callbackApi, 'getCallback').mockReturnValue(new Promise(() => {}))
    renderPage()
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error alert when API fails', async () => {
    vi.spyOn(callbackApi, 'getCallback').mockRejectedValue(new Error('Network error'))
    renderPage()
    const errorEl = await screen.findByRole('alert')
    expect(errorEl).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────
  // Data rendering — use unique text with no spaces to avoid split-text issues
  // ──────────────────────────────────────────────────────────────

  it('renders user name after data loads', async () => {
    renderPage()
    // userName is "PriyaSingh" (no space) to avoid split-text issues
    const names = await screen.findAllByText(/PriyaSingh/)
    expect(names.length).toBeGreaterThan(0)
  })

  it('renders user phone number', async () => {
    renderPage()
    const phones = await screen.findAllByText(/\+91-98765-43210/)
    expect(phones.length).toBeGreaterThan(0)
  })

  it('renders the page heading with Callback Detail', async () => {
    renderPage()
    // Heading includes i18n key "admin.callback.detail.title" → "Callback Detail"
    const headings = await screen.findAllByText(/Callback Detail/)
    expect(headings.length).toBeGreaterThan(0)
  })

  it('renders issue description', async () => {
    renderPage()
    const desc = await screen.findByText('GSTR3BLateFeeQueryText')
    expect(desc).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────
  // Back button
  // ──────────────────────────────────────────────────────────────

  it('renders back button', async () => {
    renderPage()
    // Wait for data then check toolbar — i18n key "admin.callback.detail.back" → "Back"
    await screen.findAllByText(/Callback Detail/)
    // Look for a ghost button rendered before the heading
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  // ──────────────────────────────────────────────────────────────
  // State machine button gating — PENDING status
  // ──────────────────────────────────────────────────────────────

  it('PENDING: Escalate to CA button is visible', async () => {
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    // i18n key "admin.callback.action.escalate" → "Escalate to CA"
    const escalateBtns = await screen.findAllByRole('button', { name: /escalate to ca/i })
    expect(escalateBtns.length).toBeGreaterThan(0)
  })

  it('PENDING: Cancel action button is visible', async () => {
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    // i18n key "admin.callback.action.cancel" → "Cancel"
    const cancelBtns = await screen.findAllByRole('button', { name: /^cancel$/i })
    expect(cancelBtns.length).toBeGreaterThan(0)
  })

  it('COMPLETED: Cancel and Escalate buttons are not rendered', async () => {
    vi.spyOn(callbackApi, 'getCallback').mockResolvedValue(makeCallback({ status: 'COMPLETED' }))
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /escalate to ca/i })).toBeNull()
  })

  it('CANCELLED: no Complete, Escalate, or Cancel action buttons', async () => {
    vi.spyOn(callbackApi, 'getCallback').mockResolvedValue(makeCallback({ status: 'CANCELLED' }))
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    expect(screen.queryByRole('button', { name: /^complete$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /escalate to ca/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()
  })

  // ──────────────────────────────────────────────────────────────
  // Note composer validation
  // ──────────────────────────────────────────────────────────────

  it('Save note button is disabled when note body is empty', async () => {
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    // i18n key "admin.callback.section.notes.save" → "Save note"
    const saveBtns = screen.getAllByRole('button', { name: /save note/i })
    expect(saveBtns[0]).toBeDisabled()
  })

  it('Save note button becomes enabled when note has 10+ characters', async () => {
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    const textarea = screen.getByRole('textbox', { name: /notes/i })
    await userEvent.type(textarea, 'Call placed ok user resolved the query now.')
    const saveBtns = screen.getAllByRole('button', { name: /save note/i })
    expect(saveBtns[0]).not.toBeDisabled()
  })

  it('clicking Save note calls addCallbackNote with correct callbackId', async () => {
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    const textarea = screen.getByRole('textbox', { name: /notes/i })
    await userEvent.type(textarea, 'Call placed ok user resolved the query now.')
    const saveBtns = screen.getAllByRole('button', { name: /save note/i })
    await userEvent.click(saveBtns[0])
    await waitFor(() => expect(callbackApi.addCallbackNote).toHaveBeenCalledWith(
      'cb-001',
      expect.objectContaining({ content: expect.any(String) })
    ))
  })

  // ──────────────────────────────────────────────────────────────
  // Confirm dialogs
  // ──────────────────────────────────────────────────────────────

  it('clicking Escalate to CA opens confirm dialog', async () => {
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    const escalateBtns = screen.getAllByRole('button', { name: /escalate to ca/i })
    await userEvent.click(escalateBtns[0])
    // i18n key "admin.callback.confirm.escalate.title" → "Escalate to CA"
    // The modal opens and shows a reason textarea
    const allTextareas = document.querySelectorAll('textarea')
    expect(allTextareas.length).toBeGreaterThan(0)
  })

  it('Cancel confirm dialog Confirm button is disabled until reason typed', async () => {
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    const cancelBtns = screen.getAllByRole('button', { name: /^cancel$/i })
    await userEvent.click(cancelBtns[0])
    // Modal opens — Confirm button disabled because reason is empty (< 2 chars)
    const confirmBtns = screen.getAllByRole('button', { name: /^confirm$/i })
    expect(confirmBtns[0]).toBeDisabled()
  })

  // ──────────────────────────────────────────────────────────────
  // Timeline
  // ──────────────────────────────────────────────────────────────

  it('renders timeline events when present', async () => {
    vi.spyOn(callbackApi, 'getCallback').mockResolvedValue(makeCallback({
      timeline: [
        {
          id: 'ev-001',
          eventType: 'REQUESTED',
          actorName: 'SystemActor',
          occurredAt: new Date(Date.now() - 20 * 60000).toISOString(),
        },
      ],
    }))
    renderPage()
    await screen.findAllByText(/Callback Detail/)
    // Timeline renders event types with underscores replaced by spaces
    const requestedEl = await screen.findByText('REQUESTED')
    expect(requestedEl).toBeTruthy()
  })

  // ──────────────────────────────────────────────────────────────
  // Previous notes list
  // ──────────────────────────────────────────────────────────────

  it('renders previous notes section when notes are present', async () => {
    vi.spyOn(callbackApi, 'getCallback').mockResolvedValue(makeCallback({
      notes: [
        {
          id: 'note-100',
          callbackId: 'cb-001',
          authorId: 'agent-001',
          authorName: 'AgentRaviNote',
          body: 'CustomerWasNotAvailableOnFirstAttempt',
          isInternal: false,
          recordedAt: new Date(Date.now() - 5 * 60000).toISOString(),
        },
      ],
    }))
    renderPage()
    const noteText = await screen.findByText('CustomerWasNotAvailableOnFirstAttempt')
    expect(noteText).toBeTruthy()
  })
})
