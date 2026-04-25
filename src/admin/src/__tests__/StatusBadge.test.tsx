import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusBadge } from '@/components/ui/Badge'

/**
 * Tests for StatusBadge component.
 * Verifies that document, GST, ITR, and loan workflow statuses are
 * rendered with the correct label and Tailwind colour variant class.
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
    // info variant uses bg-info-50 text-info-700 (design-system uses -50 shade)
    expect(badge.className).toContain('bg-info-50')
  })

  it('PROCESSED status renders with success (green) colour', () => {
    render(<StatusBadge status="PROCESSED" />)

    const badge = screen.getByText('Processed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-success-50')
  })

  it('REJECTED status renders with error (red) colour', () => {
    render(<StatusBadge status="REJECTED" />)

    const badge = screen.getByText('Rejected')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-error-50')
  })

  it('IN_REVIEW status renders with warning (amber) colour', () => {
    render(<StatusBadge status="IN_REVIEW" />)

    const badge = screen.getByText('In Review')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-warning-50')
  })

  it('OCR_COMPLETE status renders with brand colour', () => {
    render(<StatusBadge status="OCR_COMPLETE" />)

    const badge = screen.getByText('OCR Complete')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-brand-50')
  })

  // ──────────────────────────────────────────────────────────────
  // GST statuses
  // ──────────────────────────────────────────────────────────────

  it('FILED status renders with success (green) colour', () => {
    render(<StatusBadge status="FILED" />)

    const badge = screen.getByText('Filed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-success-50')
  })

  it('DRAFT status renders with neutral colour', () => {
    render(<StatusBadge status="DRAFT" />)

    const badge = screen.getByText('Draft')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-neutral-50')
  })

  it('REVISION_NEEDED status renders with error colour', () => {
    render(<StatusBadge status="REVISION_NEEDED" />)

    const badge = screen.getByText('Revision Needed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-error-50')
  })

  // ──────────────────────────────────────────────────────────────
  // Loan statuses
  // ──────────────────────────────────────────────────────────────

  it('APPROVED loan status renders with info colour', () => {
    render(<StatusBadge status="APPROVED" />)

    const badge = screen.getByText('Approved')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-info-50')
  })

  it('DISBURSED status renders with success colour', () => {
    render(<StatusBadge status="DISBURSED" />)

    const badge = screen.getByText('Disbursed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-success-50')
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
