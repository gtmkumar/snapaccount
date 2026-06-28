import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusBadge } from '@/components/ui/Badge'

/**
 * Tests for StatusBadge component.
 * Verifies that document, GST, ITR, and loan workflow statuses are
 * rendered with the correct label and semantic colour variant.
 *
 * Note: the design system switched from Tailwind utility classes (bg-error-50)
 * to CSS custom-property references (bg-[var(--semantic-error-bg)]) in DG-*.
 * Tests assert the CSS-variable form, not the old utility-class form.
 *
 * Ref: project-brief §2.9 document status and §4.5 GST status.
 */
describe('StatusBadge', () => {
  // ──────────────────────────────────────────────────────────────
  // Document statuses
  // ──────────────────────────────────────────────────────────────

  it('UPLOADED status renders with info (blue) colour', () => {
    render(<StatusBadge status="UPLOADED" />)

    const badge = screen.getByText('Uploaded')
    expect(badge).toBeInTheDocument()
    // info variant: design system uses CSS custom property, not Tailwind utility class
    expect(badge.className).toContain('bg-[var(--semantic-info-bg)]')
  })

  it('PROCESSED status renders with success (green) colour', () => {
    render(<StatusBadge status="PROCESSED" />)

    const badge = screen.getByText('Processed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-[var(--semantic-success-bg)]')
  })

  it('REJECTED status renders with error (red) colour', () => {
    render(<StatusBadge status="REJECTED" />)

    const badge = screen.getByText('Rejected')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-[var(--semantic-error-bg)]')
  })

  it('IN_REVIEW status renders with warning (amber) colour', () => {
    render(<StatusBadge status="IN_REVIEW" />)

    const badge = screen.getByText('In Review')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-[var(--semantic-warning-bg)]')
  })

  it('OCR_COMPLETE status renders with brand colour', () => {
    render(<StatusBadge status="OCR_COMPLETE" />)

    const badge = screen.getByText('OCR Complete')
    expect(badge).toBeInTheDocument()
    // brand variant uses badge-brand-bg custom property
    expect(badge.className).toContain('bg-[var(--badge-brand-bg)]')
  })

  // ──────────────────────────────────────────────────────────────
  // GST statuses
  // ──────────────────────────────────────────────────────────────

  it('FILED status renders with success (green) colour', () => {
    render(<StatusBadge status="FILED" />)

    const badge = screen.getByText('Filed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-[var(--semantic-success-bg)]')
  })

  it('DRAFT status renders with neutral colour', () => {
    render(<StatusBadge status="DRAFT" />)

    const badge = screen.getByText('Draft')
    expect(badge).toBeInTheDocument()
    // neutral variant uses badge-neutral-bg custom property
    expect(badge.className).toContain('bg-[var(--badge-neutral-bg)]')
  })

  it('REVISION_NEEDED status renders with error colour', () => {
    render(<StatusBadge status="REVISION_NEEDED" />)

    const badge = screen.getByText('Revision Needed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-[var(--semantic-error-bg)]')
  })

  // ──────────────────────────────────────────────────────────────
  // Loan statuses
  // ──────────────────────────────────────────────────────────────

  it('APPROVED loan status renders with info colour', () => {
    render(<StatusBadge status="APPROVED" />)

    const badge = screen.getByText('Approved')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-[var(--semantic-info-bg)]')
  })

  it('DISBURSED status renders with success colour', () => {
    render(<StatusBadge status="DISBURSED" />)

    const badge = screen.getByText('Disbursed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-[var(--semantic-success-bg)]')
  })

  // ──────────────────────────────────────────────────────────────
  // Dot indicator
  // ──────────────────────────────────────────────────────────────

  it('StatusBadge includes a coloured dot indicator', () => {
    const { container } = render(<StatusBadge status="UPLOADED" />)

    // The dot is a <span aria-hidden="true"> with rounded-full class
    const dot = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(dot).toBeInTheDocument()
  })
})
