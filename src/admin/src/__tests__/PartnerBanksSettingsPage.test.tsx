/**
 * PartnerBanksSettingsPage — Phase 6C smoke + interaction tests
 * Covers: CRUD drawer, write-only secret fields, LogoUploader, ProductChipsEditor,
 *         test-connection flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import * as loanApi from '@/lib/loanApi'
import PartnerBanksSettingsPage from '@/pages/loans/PartnerBanksSettingsPage'

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
      <MemoryRouter initialEntries={['/settings/partner-banks']}>
        <PartnerBanksSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockBankEmail: loanApi.PartnerBank = {
  bankId: 'bank-001',
  name: 'HDFC Bank',
  adapterType: 'EMAIL',
  isActive: true,
  contactEmail: 'ops@hdfc.com',
  logoUrl: null,
  healthStatus: 'healthy',
}

const mockBankRest: loanApi.PartnerBank = {
  bankId: 'bank-002',
  name: 'ICICI Bank',
  adapterType: 'REST',
  isActive: true,
  contactEmail: 'api@icici.com',
  logoUrl: null,
  healthStatus: 'degraded',
}

const mockListResponse = {
  items: [mockBankEmail, mockBankRest],
  totalCount: 2,
}

beforeEach(() => {
  vi.spyOn(loanApi, 'listPartnerBanks').mockResolvedValue(mockListResponse)
  vi.spyOn(loanApi, 'registerPartnerBank').mockResolvedValue({ bankId: 'bank-new' })
  vi.spyOn(loanApi, 'updatePartnerBank').mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('PartnerBanksSettingsPage — page structure', () => {
  it('renders page heading', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    })
  })

  it('renders Add New Bank button', async () => {
    renderPage()
    await waitFor(() => {
      const addBtn = screen.getAllByRole('button').find(b =>
        b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
      )
      expect(addBtn).toBeTruthy()
    })
  })

  it('renders bank cards after data loads', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('HDFC Bank')).toBeInTheDocument()
      expect(screen.getByText('ICICI Bank')).toBeInTheDocument()
    })
  })

  it('renders BankHealthBadge for each bank', async () => {
    renderPage()
    await waitFor(() => {
      const html = document.body.innerHTML
      expect(html).toContain('success')
    })
  })

  it('renders BankAdapterTypeBadge on each card', async () => {
    renderPage()
    await waitFor(() => {
      const html = document.body.innerHTML.toLowerCase()
      expect(html).toContain('email')
      expect(html).toContain('rest')
    })
  })
})

// ---------------------------------------------------------------------------
// CRUD drawer — Add new bank
// ---------------------------------------------------------------------------

describe('PartnerBanksSettingsPage — CRUD drawer (Add)', () => {
  it('opens drawer when Add button clicked', async () => {
    renderPage()
    const addBtn = await screen.findAllByRole('button').then(btns =>
      btns.find(b => b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new'))
    )
    expect(addBtn).toBeTruthy()
    fireEvent.click(addBtn!)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('drawer contains bank name input', async () => {
    renderPage()
    const addBtns = await screen.findAllByRole('button')
    const addBtn = addBtns.find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // Drawer has at least one text input (name field is a textbox)
    const textInputs = screen.getAllByRole('textbox')
    expect(textInputs.length).toBeGreaterThan(0)
  })

  it('drawer shows adapter type radio group', async () => {
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
  })

  it('drawer contains ProductChipsEditor with Add product button', async () => {
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const addProductBtn = screen.queryByRole('button', { name: /add product/i })
    expect(addProductBtn).toBeInTheDocument()
  })

  it('drawer has LogoUploader component', async () => {
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const uploadBtn = screen.queryByRole('button', { name: /upload bank logo/i })
    expect(uploadBtn).toBeInTheDocument()
  })

  it('closes drawer when cancel button clicked', async () => {
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// CRUD drawer — Edit bank
// ---------------------------------------------------------------------------

describe('PartnerBanksSettingsPage — CRUD drawer (Edit)', () => {
  it('opens drawer when Edit button clicked on a bank card', async () => {
    renderPage()
    await waitFor(() => screen.getByText('HDFC Bank'))
    const editBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.toLowerCase().includes('edit')
    )
    expect(editBtns.length).toBeGreaterThan(0)
    fireEvent.click(editBtns[0])
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('edit drawer pre-fills bank name', async () => {
    renderPage()
    await waitFor(() => screen.getByText('HDFC Bank'))
    const editBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.toLowerCase().includes('edit')
    )
    fireEvent.click(editBtns[0])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // The name input should contain 'HDFC Bank'
    const nameInputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    const nameInput = nameInputs.find(i => i.value === 'HDFC Bank')
    expect(nameInput).toBeTruthy()
  })

  it('CG-7: saving an edit calls updatePartnerBank (PATCH), NOT registerPartnerBank (no duplicate)', async () => {
    const updateSpy = vi.spyOn(loanApi, 'updatePartnerBank').mockResolvedValue(undefined)
    const createSpy = vi.spyOn(loanApi, 'registerPartnerBank').mockResolvedValue({ bankId: 'x' })
    renderPage()
    await waitFor(() => screen.getByText('HDFC Bank'))
    const editBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.toLowerCase().includes('edit')
    )
    fireEvent.click(editBtns[0]) // HDFC (EMAIL adapter) — index 0
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // Save without re-entering the (server-held, un-echoed) recipient config.
    const dialog = screen.getByRole('dialog')
    const saveBtn = within(dialog).getAllByRole('button').find(b => {
      const txt = b.textContent?.toLowerCase() ?? ''
      return txt.includes('save') && !txt.includes('cancel')
    })
    expect(saveBtn).toBeTruthy()
    fireEvent.click(saveBtn!)

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1))
    expect(updateSpy).toHaveBeenCalledWith('bank-001', expect.objectContaining({
      name: 'HDFC Bank',
      isActive: true,
    }))
    // Editing must NOT create a new bank, and must NOT overwrite stored config with empties.
    expect(createSpy).not.toHaveBeenCalled()
    const patchBody = updateSpy.mock.calls[0][1]
    expect(patchBody).not.toHaveProperty('apiConfigJson')
  })

  it('CG-7: adding a new bank still calls registerPartnerBank (create), NOT update', async () => {
    const updateSpy = vi.spyOn(loanApi, 'updatePartnerBank').mockResolvedValue(undefined)
    const createSpy = vi.spyOn(loanApi, 'registerPartnerBank').mockResolvedValue({ bankId: 'new' })
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // New EMAIL bank: fill required name + recipient email. Fill every email input
    // so the required recipientEmail is set regardless of field order.
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getAllByRole('textbox').find(i => i.getAttribute('type') !== 'email') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Axis Bank' } })
    const emailInputs = Array.from(dialog.querySelectorAll('input[type="email"]')) as HTMLInputElement[]
    emailInputs.forEach(inp => fireEvent.change(inp, { target: { value: 'ops@axis.com' } }))
    const saveBtn = within(dialog).getAllByRole('button').find(b => {
      const txt = b.textContent?.toLowerCase() ?? ''
      return txt.includes('save') && !txt.includes('cancel')
    })
    fireEvent.click(saveBtn!)
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1))
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Write-only secret fields
// ---------------------------------------------------------------------------

describe('PartnerBanksSettingsPage — write-only secret fields', () => {
  it('API key field for REST adapter shows masked value (not plain text) for existing bank', async () => {
    // Simulate editing a REST bank — the SecretInput should show ••••
    renderPage()
    await waitFor(() => screen.getByText('ICICI Bank'))
    const editBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.toLowerCase().includes('edit')
    )
    // ICICI Bank is index 1 (REST adapter)
    fireEvent.click(editBtns[1])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // Switch to REST tab is already selected for ICICI Bank
    // The SecretInput renders "••••••••" masked display
    const html = document.body.innerHTML
    expect(html).toContain('••••')
    // The actual API key value is NOT rendered as plain text
    // (no input with type="text" containing secret value)
    const textInputs = screen.queryAllByRole('textbox') as HTMLInputElement[]
    // None of the text inputs should contain a secret value
    textInputs.forEach(i => {
      expect(i.value).not.toMatch(/sk-|secret|token/i)
    })
  })

  it('SecretInput shows Replace button for existing bank REST adapter', async () => {
    renderPage()
    await waitFor(() => screen.getByText('ICICI Bank'))
    const editBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.toLowerCase().includes('edit')
    )
    fireEvent.click(editBtns[1])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const replaceBtn = screen.queryByRole('button', { name: /replace/i })
    expect(replaceBtn).toBeInTheDocument()
  })

  it('clicking Replace reveals password input for new secret entry', async () => {
    renderPage()
    await waitFor(() => screen.getByText('ICICI Bank'))
    const editBtns = screen.getAllByRole('button').filter(b =>
      b.textContent?.toLowerCase().includes('edit')
    )
    fireEvent.click(editBtns[1])
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const replaceBtn = screen.queryByRole('button', { name: /replace/i })
    if (replaceBtn) {
      fireEvent.click(replaceBtn)
      await waitFor(() => {
        const passwordInputs = document.querySelectorAll('input[type="password"]')
        expect(passwordInputs.length).toBeGreaterThan(0)
      })
    }
  })
})

// ---------------------------------------------------------------------------
// LogoUploader — 100KB limit
// ---------------------------------------------------------------------------

describe('PartnerBanksSettingsPage — LogoUploader', () => {
  it('shows error for oversized file', async () => {
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    // Create a file > 100KB
    const largeContent = new Array(110 * 1024).fill('a').join('')
    const file = new File([largeContent], 'large_logo.png', { type: 'image/png' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    await waitFor(() => {
      const alert = screen.queryByRole('alert')
      expect(alert).toBeInTheDocument()
    })
  })

  it('alt text input is present in the drawer', async () => {
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: /alt text/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Test connection flow
// ---------------------------------------------------------------------------

describe('PartnerBanksSettingsPage — test connection', () => {
  it('test connection button is present in drawer', async () => {
    renderPage()
    const addBtn = (await screen.findAllByRole('button')).find(b =>
      b.textContent?.toLowerCase().includes('add') || b.textContent?.toLowerCase().includes('new')
    )
    fireEvent.click(addBtn!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const testBtn = screen.getAllByRole('button').find(b =>
      b.textContent?.toLowerCase().includes('test')
    )
    expect(testBtn).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('PartnerBanksSettingsPage — error state', () => {
  it('shows error banner when API fails', async () => {
    vi.spyOn(loanApi, 'listPartnerBanks').mockRejectedValue(new Error('Network error'))
    renderPage()
    await waitFor(() => {
      const alerts = document.querySelectorAll('[role="alert"], [class*="error"], [class*="alert"]')
      expect(alerts.length).toBeGreaterThan(0)
    }, { timeout: 5000 })
  })
})
