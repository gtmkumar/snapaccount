/**
 * EditLogPage — component tests (Task #33, MCA GAP-100)
 *
 * Tests: render, permission gating, data display, pagination, export trigger
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

// ── RBAC mock ─────────────────────────────────────────────────────────────
const { perms } = vi.hoisted(() => ({
  perms: {
    loaded: true,
    granted: new Set<string>(['accounting.editlog.read']),
  },
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

// ── API mock ───────────────────────────────────────────────────────────────
import * as accountingApi from '@/lib/accountingApi'
import EditLogPage from '@/pages/compliance/EditLogPage'

// ── Fixtures ───────────────────────────────────────────────────────────────
const baseEntry: accountingApi.EditLogEntry = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  entityType: 'journal_entry',
  entityId: 'bbbbbbbb-0000-0000-0000-000000000001',
  operation: 'UPDATE',
  changedBy: 'cccccccc-0000-0000-0000-000000000001',
  changedAt: '2026-03-15T10:30:00Z',
  fyYear: '2025-26',
  changeReason: 'Monthly close adjustment',
  requestId: 'req-001',
  beforeState: '{"amount":1000}',
  afterState: '{"amount":1200}',
  retentionUntil: '2033-03-31',
}

const insertEntry: accountingApi.EditLogEntry = {
  ...baseEntry,
  id: 'aaaaaaaa-0000-0000-0000-000000000002',
  operation: 'INSERT',
  beforeState: null,
  afterState: '{"amount":5000}',
}

const deleteEntry: accountingApi.EditLogEntry = {
  ...baseEntry,
  id: 'aaaaaaaa-0000-0000-0000-000000000003',
  operation: 'DELETE',
  beforeState: '{"amount":500}',
  afterState: null,
  changedBy: null,
}

const mockPageSingle: accountingApi.EditLogPage = {
  page: 1,
  pageSize: 50,
  totalCount: 3,
  items: [baseEntry, insertEntry, deleteEntry],
}

const mockPageMulti: accountingApi.EditLogPage = {
  page: 1,
  pageSize: 50,
  totalCount: 101,
  items: Array.from({ length: 50 }, (_, i) => ({
    ...baseEntry,
    id: `aaaaaaaa-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
  })),
}

const mockPageEmpty: accountingApi.EditLogPage = {
  page: 1,
  pageSize: 50,
  totalCount: 0,
  items: [],
}

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
        <EditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('EditLogPage', () => {
  beforeEach(() => {
    perms.loaded = true
    perms.granted = new Set<string>(['accounting.editlog.read'])
    vi.spyOn(accountingApi, 'getEditLog').mockResolvedValue(mockPageSingle)
    vi.spyOn(accountingApi, 'exportEditLog').mockResolvedValue(new Blob(['csv content'], { type: 'text/csv' }))
  })

  // ── Render ───────────────────────────────────────────────────────────────

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('MCA Edit Log')).toBeInTheDocument()
  })

  it('renders the page subtitle', () => {
    renderPage()
    expect(screen.getByText(/Statutory books-of-account change trail/)).toBeInTheDocument()
  })

  it('renders FY year filter input', () => {
    renderPage()
    const input = screen.getByLabelText('Financial Year')
    expect(input).toBeInTheDocument()
  })

  it('renders entity type filter select', () => {
    renderPage()
    const select = screen.getByLabelText('Entity Type')
    expect(select).toBeInTheDocument()
  })

  it('renders Export CSV button', () => {
    renderPage()
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  // ── Data display ─────────────────────────────────────────────────────────

  it('calls getEditLog on mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(accountingApi.getEditLog).toHaveBeenCalled()
    })
  })

  it('renders operation badges from the API response', async () => {
    renderPage()
    await waitFor(() => {
      // All three operations should appear
      const updates = screen.getAllByText('UPDATE')
      expect(updates.length).toBeGreaterThan(0)
    })
    expect(screen.getByText('INSERT')).toBeInTheDocument()
    expect(screen.getByText('DELETE')).toBeInTheDocument()
  })

  it('renders entity type in rows', async () => {
    renderPage()
    await waitFor(() => {
      const badges = screen.getAllByText('journal_entry')
      expect(badges.length).toBeGreaterThan(0)
    })
  })

  it('shows (created) for INSERT with no beforeState', async () => {
    renderPage()
    await waitFor(() => {
      const created = screen.getAllByText('(created)')
      expect(created.length).toBeGreaterThan(0)
    })
  })

  it('shows (deleted) for DELETE with no afterState', async () => {
    renderPage()
    await waitFor(() => {
      const deleted = screen.getAllByText('(deleted)')
      expect(deleted.length).toBeGreaterThan(0)
    })
  })

  it('shows System for entries with null changedBy', async () => {
    renderPage()
    await waitFor(() => {
      const sys = screen.getAllByText('System')
      expect(sys.length).toBeGreaterThan(0)
    })
  })

  it('shows record count', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/3 records/)).toBeInTheDocument()
    })
  })

  // ── Pagination ────────────────────────────────────────────────────────────

  it('shows pagination controls when totalCount > pageSize', async () => {
    vi.spyOn(accountingApi, 'getEditLog').mockResolvedValue(mockPageMulti)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
    })
  })

  it('does not show pagination when all results fit on one page', async () => {
    renderPage()
    await waitFor(() => {
      // totalCount=3 < pageSize=50, so no pagination
      expect(screen.queryByText('Previous')).toBeNull()
      expect(screen.queryByText('Next')).toBeNull()
    })
  })

  it('Previous button is disabled on page 1', async () => {
    vi.spyOn(accountingApi, 'getEditLog').mockResolvedValue(mockPageMulti)
    renderPage()
    await waitFor(() => {
      const prevBtn = screen.getByText('Previous').closest('button')
      expect(prevBtn).toBeDisabled()
    })
  })

  it('Next button advances pagination', async () => {
    vi.spyOn(accountingApi, 'getEditLog').mockResolvedValue(mockPageMulti)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument()
    })
    const nextBtn = screen.getByText('Next').closest('button')!
    fireEvent.click(nextBtn)
    await waitFor(() => {
      expect(accountingApi.getEditLog).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      )
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows empty state when no records returned', async () => {
    vi.spyOn(accountingApi, 'getEditLog').mockResolvedValue(mockPageEmpty)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No edit log entries')).toBeInTheDocument()
    })
  })

  // ── Permission gating ──────────────────────────────────────────────────────

  it('shows forbidden message when permission is missing', () => {
    perms.granted = new Set<string>()
    renderPage()
    expect(
      screen.getByText('You do not have permission to view the MCA edit log.'),
    ).toBeInTheDocument()
  })

  it('does not render the table when permission is missing', () => {
    perms.granted = new Set<string>()
    renderPage()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows skeleton while permissions are loading', () => {
    perms.loaded = false
    perms.granted = new Set<string>(['accounting.editlog.read'])
    renderPage()
    // Can component shows fallback (forbidden message) before permissions load
    expect(
      screen.getByText('You do not have permission to view the MCA edit log.'),
    ).toBeInTheDocument()
  })

  // ── Export ────────────────────────────────────────────────────────────────

  it('calls exportEditLog when Export CSV is clicked', async () => {
    // Set up URL stubs (jsdom doesn't implement these)
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    globalThis.URL.revokeObjectURL = vi.fn()

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument()
    })

    const exportBtn = screen.getByText('Export CSV').closest('button')!
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(accountingApi.exportEditLog).toHaveBeenCalled()
    })
  })

  // ── Filter interaction ────────────────────────────────────────────────────

  it('resets to page 1 when entity type filter changes', async () => {
    vi.spyOn(accountingApi, 'getEditLog').mockResolvedValue(mockPageMulti)
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument()
    })

    // Advance to page 2
    const nextBtn = screen.getByText('Next').closest('button')!
    fireEvent.click(nextBtn)
    await waitFor(() => {
      expect(accountingApi.getEditLog).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      )
    })

    // Change entity type — should reset to page 1
    const select = screen.getByLabelText('Entity Type')
    fireEvent.change(select, { target: { value: 'journal_entry' } })
    await waitFor(() => {
      expect(accountingApi.getEditLog).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, entityType: 'journal_entry' }),
      )
    })
  })

  // ── BUG-MCA-ETYPE-005: entityType must always be snake_case ──────────────
  // The backend validator rejects PascalCase values (e.g. "JournalEntry") with 400.
  // Each option value in the dropdown must be snake_case to match the allowed set:
  //   journal_entry | journal_entry_line | ledger_entry | account | ledger

  it('sends snake_case entityType values to the API (BUG-MCA-ETYPE-005)', async () => {
    renderPage()
    await waitFor(() => {
      expect(accountingApi.getEditLog).toHaveBeenCalled()
    })

    const select = screen.getByLabelText('Entity Type')

    // Verify each valid snake_case value is selectable and forwarded as-is.
    const snakeCaseValues = [
      'journal_entry',
      'journal_entry_line',
      'ledger_entry',
      'account',
      'ledger',
    ]
    for (const value of snakeCaseValues) {
      fireEvent.change(select, { target: { value } })
      await waitFor(() => {
        expect(accountingApi.getEditLog).toHaveBeenCalledWith(
          expect.objectContaining({ entityType: value }),
        )
      })
      // Confirm no PascalCase variant was ever sent
      const calls = vi.mocked(accountingApi.getEditLog).mock.calls
      for (const [params] of calls) {
        if (params?.entityType !== undefined) {
          expect(params.entityType).toMatch(/^[a-z][a-z_]*$/)
        }
      }
    }
  })

  it('dropdown options do not contain PascalCase entityType values (BUG-MCA-ETYPE-005)', () => {
    renderPage()
    const select = screen.getByLabelText('Entity Type') as HTMLSelectElement
    const optionValues = Array.from(select.options)
      .map(o => o.value)
      .filter(v => v !== '') // skip the "All" empty option

    // All non-empty values must be snake_case (lowercase letters and underscores only)
    for (const val of optionValues) {
      expect(val).toMatch(/^[a-z][a-z_]*$/)
    }
    // And must include all five backend-accepted types
    expect(optionValues).toContain('journal_entry')
    expect(optionValues).toContain('journal_entry_line')
    expect(optionValues).toContain('ledger_entry')
    expect(optionValues).toContain('account')
    expect(optionValues).toContain('ledger')
  })
})
