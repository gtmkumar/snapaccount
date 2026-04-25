import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AmountDisplay } from '@/components/ui/AmountDisplay'

/**
 * Tests for AmountDisplay component.
 * Verifies correct Indian number formatting (lakh/crore system) using
 * the formatINR utility under the hood.
 * Ref: project-brief §3 — Financial Health Dashboard — Indian formatting.
 */
describe('AmountDisplay', () => {
  // ──────────────────────────────────────────────────────────────
  // Basic rendering
  // ──────────────────────────────────────────────────────────────

  it('renders ₹1,234 with Indian comma formatting', () => {
    render(<AmountDisplay amount={1234} />)

    // Intl.NumberFormat en-IN produces ₹1,234
    const el = screen.getByText(/1,234/)
    expect(el).toBeInTheDocument()
  })

  it('renders zero as ₹0', () => {
    render(<AmountDisplay amount={0} />)

    const el = screen.getByText(/0/)
    expect(el).toBeInTheDocument()
  })

  // ──────────────────────────────────────────────────────────────
  // Indian lakh formatting (₹1,23,456)
  // ──────────────────────────────────────────────────────────────

  it('renders ₹1,23,456 with lakh-place comma', () => {
    render(<AmountDisplay amount={123456} />)

    // en-IN locale inserts comma after lakh place: 1,23,456
    const el = screen.getByText(/1,23,456/)
    expect(el).toBeInTheDocument()
  })

  // ──────────────────────────────────────────────────────────────
  // Crore formatting (₹1,23,45,678)
  // ──────────────────────────────────────────────────────────────

  it('renders ₹1,23,45,678 with crore-place comma', () => {
    render(<AmountDisplay amount={12345678} />)

    // en-IN locale: 1,23,45,678
    const el = screen.getByText(/1,23,45,678/)
    expect(el).toBeInTheDocument()
  })

  // ──────────────────────────────────────────────────────────────
  // Negative amount
  // ──────────────────────────────────────────────────────────────

  it('renders negative amount correctly', () => {
    const { container } = render(<AmountDisplay amount={-5000} />)
    expect(container.firstChild?.textContent).toMatch(/5,000/)
  })

  // ──────────────────────────────────────────────────────────────
  // Compact format
  // ──────────────────────────────────────────────────────────────

  it('renders compact lakh format for amounts >= 1 lakh', () => {
    const { container } = render(<AmountDisplay amount={1500000} format="compact" />)
    // compact mode: ₹15.0L
    expect(container.firstChild?.textContent).toMatch(/L/)
  })

  it('renders compact crore format for amounts >= 1 crore', () => {
    const { container } = render(<AmountDisplay amount={25000000} format="compact" />)
    // compact mode: ₹2.5Cr
    expect(container.firstChild?.textContent).toMatch(/Cr/)
  })

  // ──────────────────────────────────────────────────────────────
  // Paise unit conversion
  // ──────────────────────────────────────────────────────────────

  it('converts paise to rupees before display', () => {
    // 150000 paise = ₹1,500
    const { container } = render(<AmountDisplay amount={150000} unit="paise" />)
    expect(container.firstChild?.textContent).toMatch(/1,500/)
  })

  // ──────────────────────────────────────────────────────────────
  // aria-label
  // ──────────────────────────────────────────────────────────────

  it('has an aria-label for accessibility', () => {
    render(<AmountDisplay amount={1234} />)

    const el = screen.getByLabelText(/1,234/)
    expect(el).toBeInTheDocument()
  })
})
