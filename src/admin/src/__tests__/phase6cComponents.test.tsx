/**
 * Phase 6C Component Tests
 * Covers: BankAdapterTypeBadge, BankCommStatusBadge, BankHealthBadge,
 *         ConsentAuditCard, PayloadViewer, ProductChipsEditor,
 *         LogoUploader, PdfViewerWebPackagePane (DisclaimerCard)
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BankAdapterTypeBadge } from '@/components/ui/BankAdapterTypeBadge'
import { BankCommStatusBadge } from '@/components/ui/BankCommStatusBadge'
import { BankHealthBadge } from '@/components/ui/BankHealthBadge'
import { ConsentAuditCard } from '@/components/ui/ConsentAuditCard'
import { PayloadViewer } from '@/components/ui/PayloadViewer'
import { ProductChipsEditor, type ProductChip } from '@/components/ui/ProductChipsEditor'
import { LogoUploader } from '@/components/ui/LogoUploader'
import { DisclaimerCard, PdfViewerWebPackagePane } from '@/components/ui/PdfViewerWebPackagePane'

// ---------------------------------------------------------------------------
// BankAdapterTypeBadge
// ---------------------------------------------------------------------------

describe('BankAdapterTypeBadge', () => {
  it('renders EMAIL adapter type', () => {
    render(<BankAdapterTypeBadge adapterType="EMAIL" />)
    expect(screen.getByText(/email/i)).toBeInTheDocument()
  })

  it('renders REST adapter type', () => {
    render(<BankAdapterTypeBadge adapterType="REST" />)
    expect(screen.getByText(/rest/i)).toBeInTheDocument()
  })

  it('renders OAUTH adapter type', () => {
    render(<BankAdapterTypeBadge adapterType="OAUTH" />)
    expect(screen.getByText(/oauth/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// BankCommStatusBadge
// ---------------------------------------------------------------------------

describe('BankCommStatusBadge', () => {
  const statuses = ['QUEUED', 'SENT', 'DELIVERED', 'RESPONDED', 'BOUNCED', 'FAILED'] as const

  statuses.forEach(status => {
    it(`renders ${status} status badge`, () => {
      const { container } = render(<BankCommStatusBadge status={status} />)
      // Badge renders a <span> with label text — container must be non-empty
      expect(container.firstChild).toBeTruthy()
      expect(container.firstChild).not.toBeEmptyDOMElement()
    })
  })

  it('applies size md correctly', () => {
    const { container } = render(<BankCommStatusBadge status="SENT" size="md" />)
    // With size=md it has px-2.5 class
    expect(container.firstChild).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// BankHealthBadge
// ---------------------------------------------------------------------------

describe('BankHealthBadge', () => {
  it('renders healthy status with green styling', () => {
    const { container } = render(<BankHealthBadge status="healthy" />)
    expect(container.firstChild).toBeTruthy()
    expect(container.innerHTML).toContain('success')
  })

  it('renders down status with error styling', () => {
    const { container } = render(<BankHealthBadge status="down" />)
    expect(container.innerHTML).toContain('error')
  })

  it('renders inactive status', () => {
    const { container } = render(<BankHealthBadge status="inactive" />)
    expect(container.firstChild).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// ConsentAuditCard
// ---------------------------------------------------------------------------

describe('ConsentAuditCard', () => {
  const props = {
    consentType: 'CREDIT_BUREAU' as const,
    version: 'v2.1',
    signedAt: '2024-01-15T10:30:00Z',
    signatureHex: 'abcdef1234567890',
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0 Test Browser',
    biometricUsed: false,
    onVerifyHmac: vi.fn(),
    onViewText: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders consent type label', () => {
    render(<ConsentAuditCard {...props} />)
    expect(screen.getByText('Credit Bureau')).toBeInTheDocument()
  })

  it('shows last 4 chars of signature hash', () => {
    render(<ConsentAuditCard {...props} />)
    expect(screen.getByText(/7890/)).toBeInTheDocument()
  })

  it('calls onViewText when View button clicked', () => {
    render(<ConsentAuditCard {...props} />)
    const viewBtn = screen.getByRole('button', { name: /view consent/i })
    fireEvent.click(viewBtn)
    expect(props.onViewText).toHaveBeenCalledTimes(1)
  })

  it('calls onVerifyHmac when Verify HMAC button clicked', () => {
    render(<ConsentAuditCard {...props} />)
    const verifyBtn = screen.getByRole('button', { name: /verify hmac/i })
    fireEvent.click(verifyBtn)
    expect(props.onVerifyHmac).toHaveBeenCalledTimes(1)
  })

  it('shows verification ok result', () => {
    render(<ConsentAuditCard {...props} verifyResult="ok" />)
    expect(screen.getByText(/signature verified/i)).toBeInTheDocument()
  })

  it('shows verification fail result', () => {
    render(<ConsentAuditCard {...props} verifyResult="fail" />)
    expect(screen.getByText(/does not verify/i)).toBeInTheDocument()
  })

  it('disables verify button while verifying', () => {
    render(<ConsentAuditCard {...props} verifying />)
    const btn = screen.getByRole('button', { name: /verifying/i })
    expect(btn).toBeDisabled()
  })

  it('shows IP address when provided', () => {
    render(<ConsentAuditCard {...props} />)
    expect(screen.getByText(/192\.168\.1\.1/)).toBeInTheDocument()
  })

  it('handles DATA_SHARE_WITH_BANK consent type', () => {
    render(<ConsentAuditCard {...props} consentType="DATA_SHARE_WITH_BANK" />)
    expect(screen.getByText(/data share with bank/i)).toBeInTheDocument()
  })

  it('handles DISBURSEMENT_MANDATE consent type', () => {
    render(<ConsentAuditCard {...props} consentType="DISBURSEMENT_MANDATE" />)
    expect(screen.getByText(/disbursement mandate/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// PayloadViewer
// ---------------------------------------------------------------------------

describe('PayloadViewer', () => {
  it('shows empty state for null payload', () => {
    render(<PayloadViewer kind="json" payload={null} />)
    expect(screen.getByText(/no payload/i)).toBeInTheDocument()
  })

  it('renders JSON tree view by default', () => {
    const json = JSON.stringify({ key: 'value', count: 42 })
    render(<PayloadViewer kind="json" payload={json} />)
    expect(screen.getByRole('tree')).toBeInTheDocument()
  })

  it('toggles to raw JSON on button click', () => {
    const json = JSON.stringify({ key: 'value' })
    render(<PayloadViewer kind="json" payload={json} />)
    const rawBtn = screen.getByRole('button', { name: /raw/i })
    fireEvent.click(rawBtn)
    expect(screen.getByText(/"key"/)).toBeInTheDocument()
  })

  it('redacts token fields in JSON', () => {
    const json = JSON.stringify({ apitoken: 'secret123', name: 'test' })
    render(<PayloadViewer kind="json" payload={json} />)
    // The actual value should not be visible; only last 4 chars should show
    expect(screen.queryByText('secret123')).not.toBeInTheDocument()
  })

  it('renders email kind with iframe', () => {
    const html = '<p>Hello World</p>'
    render(<PayloadViewer kind="email" payload={html} />)
    expect(screen.getByTitle(/email body/i)).toBeInTheDocument()
  })

  it('renders email source toggle', () => {
    const html = '<p>Test</p>'
    render(<PayloadViewer kind="email" payload={html} />)
    expect(screen.getByRole('button', { name: /view source/i })).toBeInTheDocument()
  })

  it('renders oauth-token kind with masked message', () => {
    render(<PayloadViewer kind="oauth-token" payload="eyJtoken..." />)
    expect(screen.getByText(/full token not displayed/i)).toBeInTheDocument()
  })

  // SEC-045: OAuth token masking — full token must never appear in DOM
  it('SEC-045: displays Bearer ***{last6} and never renders the full access_token', () => {
    const fullToken = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.ABCDEF123456'
    const payload = JSON.stringify({
      access_token: fullToken,
      refresh_token: 'refresh_secret_xyz789',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'read write',
    })
    render(<PayloadViewer kind="oauth-token" payload={payload} />)

    // Full token must NOT appear anywhere in the DOM
    expect(screen.queryByText(fullToken)).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(fullToken))).not.toBeInTheDocument()

    // Masked format Bearer ***{last6} must be present
    const maskedEl = screen.getByTestId('oauth-masked-token')
    expect(maskedEl.textContent).toBe(`Bearer ***${fullToken.slice(-6)}`)

    // refresh_token must also be absent
    expect(screen.queryByText('refresh_secret_xyz789')).not.toBeInTheDocument()
  })

  it('SEC-045: shows scopes and expires_in from oauth payload, hides secret fields', () => {
    const payload = JSON.stringify({
      access_token: 'tok_' + 'a'.repeat(40),
      token_type: 'Bearer',
      expires_in: 7200,
      scope: 'gst:read loan:write',
      id_token: 'id_secret_value',
      client_secret: 'cs_should_not_show',
    })
    render(<PayloadViewer kind="oauth-token" payload={payload} />)

    // Safe fields visible
    expect(screen.getByText(/7200/)).toBeInTheDocument()
    expect(screen.getByText(/gst:read loan:write/)).toBeInTheDocument()

    // Sensitive fields absent
    expect(screen.queryByText(/id_secret_value/)).not.toBeInTheDocument()
    expect(screen.queryByText(/cs_should_not_show/)).not.toBeInTheDocument()
  })

  it('SEC-045: handles raw (non-JSON) token string by masking last 6 chars', () => {
    const rawToken = 'rawtoken_VISIBLE_LAST6'
    render(<PayloadViewer kind="oauth-token" payload={rawToken} />)

    // Full value absent
    expect(screen.queryByText(rawToken)).not.toBeInTheDocument()

    // Masked format present
    const maskedEl = screen.getByTestId('oauth-masked-token')
    expect(maskedEl.textContent).toBe(`Bearer ***${rawToken.slice(-6)}`)
  })

  it('renders raw text for invalid JSON gracefully', () => {
    render(<PayloadViewer kind="json" payload="not json {{{" />)
    expect(screen.getByText(/not json/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ProductChipsEditor
// ---------------------------------------------------------------------------

describe('ProductChipsEditor', () => {
  const sampleProducts: ProductChip[] = [
    { id: '1', productName: 'Business Loan', minAmount: 100000, maxAmount: 5000000 },
    { id: '2', productName: 'MSME Loan', minAmount: 50000, maxAmount: 2000000 },
  ]

  it('renders product chips', () => {
    render(<ProductChipsEditor products={sampleProducts} onChange={vi.fn()} />)
    expect(screen.getByText('Business Loan')).toBeInTheDocument()
    expect(screen.getByText('MSME Loan')).toBeInTheDocument()
  })

  it('shows add product button when not readOnly', () => {
    render(<ProductChipsEditor products={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
  })

  it('does not show add product button when readOnly', () => {
    render(<ProductChipsEditor products={sampleProducts} onChange={vi.fn()} readOnly />)
    expect(screen.queryByRole('button', { name: /add product/i })).not.toBeInTheDocument()
  })

  it('hides edit/remove buttons when readOnly', () => {
    render(<ProductChipsEditor products={sampleProducts} onChange={vi.fn()} readOnly />)
    expect(screen.queryByRole('button', { name: /edit business loan/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove business loan/i })).not.toBeInTheDocument()
  })

  it('opens modal when add product is clicked', async () => {
    render(<ProductChipsEditor products={[]} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add product/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('opens edit modal when edit button is clicked', async () => {
    render(<ProductChipsEditor products={sampleProducts} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit business loan/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('calls onChange when product is removed', () => {
    const onChange = vi.fn()
    render(<ProductChipsEditor products={sampleProducts} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /remove business loan/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ productName: 'MSME Loan' })])
    )
    expect(onChange.mock.calls[0][0]).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// LogoUploader
// ---------------------------------------------------------------------------

describe('LogoUploader', () => {
  it('renders upload area', () => {
    render(<LogoUploader onChangeFile={vi.fn()} />)
    expect(screen.getByRole('button', { name: /upload bank logo/i })).toBeInTheDocument()
  })

  it('renders alt text input', () => {
    render(<LogoUploader onChangeFile={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: /alt text/i })).toBeInTheDocument()
  })

  it('shows existing logo when value provided', () => {
    render(<LogoUploader value="data:image/png;base64,abc" altText="My Logo" onChangeFile={vi.fn()} />)
    expect(screen.getByAltText('My Logo')).toBeInTheDocument()
  })

  it('shows clear button when logo exists', () => {
    render(<LogoUploader value="data:image/png;base64,abc" altText="Logo" onChangeFile={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: /remove logo/i })).toBeInTheDocument()
  })

  it('calls onClear when remove button clicked', () => {
    const onClear = vi.fn()
    render(<LogoUploader value="data:image/png;base64,abc" altText="Logo" onChangeFile={vi.fn()} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /remove logo/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop set', () => {
    render(<LogoUploader onChangeFile={vi.fn()} disabled />)
    const dropzone = screen.getByRole('button', { name: /upload bank logo/i })
    expect(dropzone).toHaveAttribute('tabIndex', '-1')
  })

  it('shows file type error for invalid type', async () => {
    render(<LogoUploader onChangeFile={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['content'], 'photo.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// DisclaimerCard
// ---------------------------------------------------------------------------

describe('DisclaimerCard', () => {
  it('renders with legal note role', () => {
    render(<DisclaimerCard />)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('contains canonical disclaimer text', () => {
    render(<DisclaimerCard />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/snapaccount/i)
    expect(note).toHaveTextContent(/partner bank/i)
  })

  it('applies compact styles when compact=true', () => {
    const { container } = render(<DisclaimerCard compact />)
    expect(container.firstChild).toHaveClass('px-3')
  })

  it('applies full padding when not compact', () => {
    const { container } = render(<DisclaimerCard />)
    expect(container.firstChild).toHaveClass('px-4')
  })
})

// ---------------------------------------------------------------------------
// PdfViewerWebPackagePane
// ---------------------------------------------------------------------------

describe('PdfViewerWebPackagePane', () => {
  it('renders disclaimer card', () => {
    render(<PdfViewerWebPackagePane pdfUrl={null} />)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('shows no PDF message when pdfUrl is null', () => {
    render(<PdfViewerWebPackagePane pdfUrl={null} />)
    expect(screen.getByText(/no pdf package/i)).toBeInTheDocument()
  })

  it('shows expand preview button when pdfUrl provided', () => {
    render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" />)
    expect(screen.getByRole('button', { name: /expand preview/i })).toBeInTheDocument()
  })

  it('expands iframe when expand button clicked', () => {
    render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: /expand preview/i }))
    expect(screen.getByTitle(/loan package pdf/i)).toBeInTheDocument()
  })

  it('collapses iframe when collapse button clicked', () => {
    render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" />)
    fireEvent.click(screen.getByRole('button', { name: /expand preview/i }))
    fireEvent.click(screen.getByRole('button', { name: /collapse preview/i }))
    expect(screen.queryByTitle(/loan package pdf/i)).not.toBeInTheDocument()
  })

  it('shows page count when provided', () => {
    render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" pageCount={12} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows download link when pdfUrl provided', () => {
    render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" />)
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(1)
    // At least one link should have the download attribute
    const downloadLink = links.find(l => l.hasAttribute('download'))
    expect(downloadLink).toBeTruthy()
  })

  it('shows truncated SHA-256 hash', () => {
    render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" sha256Hash="abcdef1234567890abcdef1234567890" />)
    expect(screen.getByText(/sha-256: abcdef12/i)).toBeInTheDocument()
  })

  it('shows watermark intact badge', () => {
    const { container } = render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" watermarkStatus="intact" />)
    expect(container.innerHTML).toContain('Watermark intact')
  })

  it('shows integrity failed badge', () => {
    const { container } = render(<PdfViewerWebPackagePane pdfUrl="https://example.com/file.pdf" watermarkStatus="failed" />)
    expect(container.innerHTML).toContain('Integrity failed')
  })
})
