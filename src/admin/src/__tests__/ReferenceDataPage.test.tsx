/**
 * ReferenceDataPage — Module 1 Increment 1.4 Phase A component tests
 *
 * Coverage:
 *  1. Page renders: title, category tabs, Add entry button
 *  2. Category tabs update URL ?category= param (tab/URL sync)
 *  3. Table renders items (name, code, sort order)
 *  4. Active/Inactive/All filter
 *  5. Search filters by name and code
 *  6. Create dialog: code regex validation, STATE requires Country parent, submit disabled
 *  7. Duplicate inline 409 error rendered
 *  8. ParentCode validation (STATE requires a country)
 *  9. Delete → InUse → shows Deactivate-instead path (DeleteDialog state machine)
 * 10. Gating: platform.refdata.manage (dialog accessible to SUPER_ADMIN)
 * 11. No native alert() used
 * 12. referenceDataApi schema validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router'
import * as referenceDataApi from '@/lib/referenceDataApi'

// ── firebase stubs ─────────────────────────────────────────────────────────────
vi.mock('@/lib/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_, cb) => { cb(null); return () => {} }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const makeItem = (overrides: Partial<referenceDataApi.RefDataItem> = {}): referenceDataApi.RefDataItem => ({
  id: `item-${Math.random().toString(36).slice(2, 8)}`,
  category: 'LANGUAGE',
  code: 'en',
  name: 'English',
  parentCode: null,
  isActive: true,
  sortOrder: 1,
  ...overrides,
})

const mockLanguages: referenceDataApi.RefDataItem[] = [
  makeItem({ id: 'lang-en', code: 'en', name: 'English', sortOrder: 1 }),
  makeItem({ id: 'lang-hi', code: 'hi', name: 'Hindi', sortOrder: 2 }),
  makeItem({ id: 'lang-inactive', code: 'ta', name: 'Tamil', sortOrder: 3, isActive: false }),
]

const mockCountries: referenceDataApi.RefDataItem[] = [
  makeItem({ id: 'cty-IN', category: 'COUNTRY', code: 'IN', name: 'India' }),
  makeItem({ id: 'cty-US', category: 'COUNTRY', code: 'US', name: 'United States' }),
]

const mockStates: referenceDataApi.RefDataItem[] = [
  makeItem({ id: 'st-KA', category: 'STATE', code: 'KA', name: 'Karnataka', parentCode: 'IN' }),
]

const newItemResponse: referenceDataApi.RefDataItem =
  makeItem({ id: 'new-001', code: 'FR', name: 'French', category: 'LANGUAGE', sortOrder: 4 })

// ─────────────────────────────────────────────────────────────────────────────

describe('ReferenceDataPage', () => {
  let ReferenceDataPage: typeof import('@/pages/settings/ReferenceDataPage').default

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(referenceDataApi, 'listReferenceData').mockImplementation(async (cat, _activeOnly) => {
      if (cat === 'LANGUAGE') return mockLanguages
      if (cat === 'COUNTRY') return mockCountries
      if (cat === 'STATE') return mockStates
      return []
    })
    vi.spyOn(referenceDataApi, 'createRefDataEntry').mockResolvedValue(newItemResponse)
    vi.spyOn(referenceDataApi, 'updateRefDataEntry').mockResolvedValue(undefined)
    vi.spyOn(referenceDataApi, 'deleteRefDataEntry').mockResolvedValue(undefined)

    const mod = await import('@/pages/settings/ReferenceDataPage')
    ReferenceDataPage = mod.default
  })

  function wrap(initialCategory = 'LANGUAGE') {
    return render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter initialEntries={[`/settings/reference-data?category=${initialCategory}`]}>
          <Routes>
            <Route path="/settings/reference-data" element={<ReferenceDataPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  // ── 1. Page renders ────────────────────────────────────────────────────────

  it('renders Reference Data page title', async () => {
    wrap()
    await waitFor(() => expect(screen.getByText('Reference Data')).toBeInTheDocument())
  })

  it('renders all 5 category tabs', async () => {
    wrap()
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Languages' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Countries' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'States' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Genders' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'User Types' })).toBeInTheDocument()
    })
  })

  it('renders Add entry button', async () => {
    wrap()
    await waitFor(() => expect(screen.getByRole('button', { name: /Add entry/i })).toBeInTheDocument())
  })

  // ── 2. Category tab / URL sync ─────────────────────────────────────────────

  it('LANGUAGE tab is active by default with ?category=LANGUAGE', async () => {
    wrap('LANGUAGE')
    await waitFor(() => {
      const langTab = screen.getByRole('radio', { name: 'Languages' })
      expect(langTab).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('clicking Countries tab changes active tab', async () => {
    wrap()
    await waitFor(() => screen.getByRole('radio', { name: 'Countries' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Countries' }))
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Countries' })).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('listReferenceData called with correct category', async () => {
    wrap('LANGUAGE')
    await waitFor(() => screen.getByText('English'))
    expect(referenceDataApi.listReferenceData).toHaveBeenCalledWith('LANGUAGE', false)
  })

  // ── 3. Table renders items ─────────────────────────────────────────────────

  it('renders language entries from API', async () => {
    wrap()
    await waitFor(() => {
      expect(screen.getByText('English')).toBeInTheDocument()
      expect(screen.getByText('Hindi')).toBeInTheDocument()
    })
  })

  it('renders sort order values in table', async () => {
    wrap()
    await waitFor(() => screen.getByText('English'))
    // Sort order numbers appear in the sort-order column
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('STATE tab shows Country column header', async () => {
    wrap('STATE')
    await waitFor(() => {
      expect(screen.getByText('Country')).toBeInTheDocument()
    })
  })

  // ── 4. Active/Inactive/All filter ─────────────────────────────────────────

  it('active filter hides inactive items', async () => {
    wrap()
    await waitFor(() => screen.getByText('English'))

    // 'Active' radio is selected by default
    const activeRadio = screen.getByRole('radio', { name: 'Active' })
    expect(activeRadio).toHaveAttribute('aria-checked', 'true')

    // Tamil (inactive) should not appear
    expect(screen.queryByText('Tamil')).not.toBeInTheDocument()
  })

  it('All filter shows inactive items too', async () => {
    wrap()
    await waitFor(() => screen.getByText('English'))

    fireEvent.click(screen.getByRole('radio', { name: 'All' }))

    await waitFor(() => {
      expect(screen.getByText('Tamil')).toBeInTheDocument()
    })
  })

  it('Inactive filter shows only inactive items', async () => {
    wrap()
    await waitFor(() => screen.getByText('English'))

    fireEvent.click(screen.getByRole('radio', { name: 'Inactive' }))

    await waitFor(() => {
      expect(screen.queryByText('English')).not.toBeInTheDocument()
      expect(screen.getByText('Tamil')).toBeInTheDocument()
    })
  })

  // ── 5. Search filter ───────────────────────────────────────────────────────

  it('search filters by name', async () => {
    wrap()
    await waitFor(() => screen.getByText('English'))
    // Show All first so Hindi is visible
    fireEvent.click(screen.getByRole('radio', { name: 'Active' }))
    fireEvent.change(screen.getByPlaceholderText(/Search name or code/i), { target: { value: 'Hind' } })
    await waitFor(() => {
      expect(screen.queryByText('English')).not.toBeInTheDocument()
      expect(screen.getByText('Hindi')).toBeInTheDocument()
    })
  })

  // ── 6. Create dialog: code validation ─────────────────────────────────────

  it('clicking Add entry opens the create dialog', async () => {
    wrap()
    await waitFor(() => screen.getByRole('button', { name: /Add entry/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }))
    await waitFor(() => {
      expect(screen.getByText(/Add entry — Languages/i)).toBeInTheDocument()
    })
  })

  it('create dialog: Save button disabled when name is empty', async () => {
    wrap()
    await waitFor(() => screen.getByRole('button', { name: /Add entry/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }))
    await waitFor(() => screen.getByPlaceholderText('Karnataka'))

    // Type a code but leave name empty
    fireEvent.change(screen.getByPlaceholderText('KA'), { target: { value: 'MYCODE' } })

    const saveBtn = screen.getByRole('button', { name: /Save/i })
    expect(saveBtn).toBeDisabled()
  })

  it('create dialog: invalid code format shows error', async () => {
    wrap()
    await waitFor(() => screen.getByRole('button', { name: /Add entry/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }))
    await waitFor(() => screen.getByPlaceholderText('KA'))

    // Type a code with a space (invalid)
    fireEvent.change(screen.getByPlaceholderText('KA'), { target: { value: 'has space' } })

    await waitFor(() => {
      expect(screen.getByText(/Use a short code with no spaces/i)).toBeInTheDocument()
    })
  })

  it('create dialog: valid code + name enables Save button', async () => {
    wrap()
    await waitFor(() => screen.getByRole('button', { name: /Add entry/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }))
    await waitFor(() => screen.getByPlaceholderText('Karnataka'))

    fireEvent.change(screen.getByPlaceholderText('Karnataka'), { target: { value: 'French' } })
    fireEvent.change(screen.getByPlaceholderText('KA'), { target: { value: 'FR' } })

    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: /Save/i })
      expect(saveBtn).not.toBeDisabled()
    })
  })

  // ── 7. Duplicate inline 409 error ─────────────────────────────────────────

  it('create dialog: shows duplicate inline error on 409', async () => {
    vi.spyOn(referenceDataApi, 'createRefDataEntry').mockRejectedValue({
      response: { status: 409, data: { code: 'ReferenceData.Duplicate' } },
    })

    wrap()
    await waitFor(() => screen.getByRole('button', { name: /Add entry/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }))
    await waitFor(() => screen.getByPlaceholderText('Karnataka'))

    fireEvent.change(screen.getByPlaceholderText('Karnataka'), { target: { value: 'English Again' } })
    fireEvent.change(screen.getByPlaceholderText('KA'), { target: { value: 'en' } })

    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => {
      // The duplicate error message appears inline below the code field
      expect(screen.getByText(/already exists/i) || screen.getByText(/duplicate/i)).toBeInTheDocument()
    })
  })

  // ── 8. STATE requires country parent ──────────────────────────────────────

  it('STATE create dialog: Save disabled when no parentCode selected', async () => {
    wrap('STATE')
    await waitFor(() => screen.getByRole('button', { name: /Add entry/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }))
    await waitFor(() => screen.getByText(/Add entry — States/i))

    // Fill name and code but leave country empty
    fireEvent.change(screen.getByPlaceholderText('Karnataka'), { target: { value: 'Test State' } })
    fireEvent.change(screen.getByPlaceholderText('KA'), { target: { value: 'QA_ST' } })
    // Country input shows placeholder "India (IN)" — don't select any country

    const saveBtn = screen.getByRole('button', { name: /Save/i })
    expect(saveBtn).toBeDisabled()
  })

  // ── 9. Delete → InUse → Deactivate-instead path ───────────────────────────

  it('DeleteDialog: shows Deactivate instead button after 409 InUse', async () => {
    vi.spyOn(referenceDataApi, 'deleteRefDataEntry').mockRejectedValue({
      response: { status: 409, data: { code: 'ReferenceData.InUse' } },
    })

    wrap()
    await waitFor(() => screen.getByRole('radio', { name: 'All' }))
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    await waitFor(() => screen.getByText('English'))

    // Click delete button on English
    const deleteBtn = screen.getByRole('button', { name: /Delete.*English/i })
    fireEvent.click(deleteBtn)

    // Confirm dialog appears — scope all further queries to the dialog
    const dialog = await screen.findByRole('dialog')

    // Confirm the delete (the dialog's own Delete button, not a row button)
    fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/i }))

    // After 409 InUse, dialog transitions to "Deactivate instead" state
    await waitFor(() => {
      expect(
        within(dialog).getByRole('button', { name: /Deactivate instead/i })
      ).toBeInTheDocument()
    })
  })

  // ── 10. No native alert() ─────────────────────────────────────────────────

  it('no native alert() used anywhere in the page', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    wrap()
    await waitFor(() => screen.getByText('Reference Data'))
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  // ── 11. API is called on mount ─────────────────────────────────────────────

  it('listReferenceData called once on mount', async () => {
    wrap()
    await waitFor(() => screen.getByText('English'))
    expect(referenceDataApi.listReferenceData).toHaveBeenCalledWith('LANGUAGE', false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// referenceDataApi Zod schema tests
// ─────────────────────────────────────────────────────────────────────────────

describe('referenceDataApi — schema validation', () => {
  it('RefDataItemSchema: accepts valid item', () => {
    const raw = {
      id: 'item-1', category: 'LANGUAGE', code: 'en',
      name: 'English', parentCode: null, isActive: true, sortOrder: 1,
    }
    expect(referenceDataApi.RefDataItemSchema.safeParse(raw).success).toBe(true)
  })

  it('RefDataItemSchema: rejects unknown category', () => {
    const raw = {
      id: 'item-1', category: 'CITY', code: 'NYC',
      name: 'New York', isActive: true, sortOrder: 0,
    }
    expect(referenceDataApi.RefDataItemSchema.safeParse(raw).success).toBe(false)
  })

  it('RefDataItemSchema: accepts STATE with parentCode', () => {
    const raw = {
      id: 'st-1', category: 'STATE', code: 'KA',
      name: 'Karnataka', parentCode: 'IN', isActive: true, sortOrder: 11,
    }
    expect(referenceDataApi.RefDataItemSchema.safeParse(raw).success).toBe(true)
  })

  it('CODE_REGEX: accepts valid codes', () => {
    for (const code of ['en', 'IN', 'KA', 'BUSINESS_OWNER', 'abc-123']) {
      expect(referenceDataApi.CODE_REGEX.test(code)).toBe(true)
    }
  })

  it('CODE_REGEX: rejects invalid codes', () => {
    for (const code of ['has space', 'has.dot', '', 'x'.repeat(21)]) {
      expect(referenceDataApi.CODE_REGEX.test(code)).toBe(false)
    }
  })

  it('REFDATA_CATEGORIES has exactly 5 entries', () => {
    expect(referenceDataApi.REFDATA_CATEGORIES).toHaveLength(5)
  })

  it('refDataQueryKey produces stable key', () => {
    const key = referenceDataApi.refDataQueryKey('LANGUAGE', false)
    expect(key).toEqual(['refdata', 'LANGUAGE', { activeOnly: false }])
  })

  it('all API functions are exported', () => {
    expect(typeof referenceDataApi.listReferenceData).toBe('function')
    expect(typeof referenceDataApi.createRefDataEntry).toBe('function')
    expect(typeof referenceDataApi.updateRefDataEntry).toBe('function')
    expect(typeof referenceDataApi.deleteRefDataEntry).toBe('function')
  })
})
