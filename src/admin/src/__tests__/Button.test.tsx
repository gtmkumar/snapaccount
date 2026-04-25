import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button } from '@/components/ui/Button'

/**
 * Tests for the Button component.
 * Covers rendering, loading state, disabled state, and click event behaviour.
 */
describe('Button', () => {
  // ──────────────────────────────────────────────────────────────
  // Rendering
  // ──────────────────────────────────────────────────────────────

  it('renders with the given label', () => {
    render(<Button>Submit</Button>)

    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
  })

  it('defaults to type="button" to avoid accidental form submission', () => {
    render(<Button>Click me</Button>)

    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('type', 'button')
  })

  // ──────────────────────────────────────────────────────────────
  // Loading state
  // ──────────────────────────────────────────────────────────────

  it('shows spinner when loading=true', () => {
    render(<Button loading>Sending...</Button>)

    // The spinner SVG has aria-hidden="true"; we check aria-busy on the button
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('disables the button when loading=true', () => {
    render(<Button loading>Sending...</Button>)

    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
  })

  it('does not fire onClick when loading', () => {
    const handleClick = vi.fn()
    render(
      <Button loading onClick={handleClick}>
        Sending...
      </Button>
    )

    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).not.toHaveBeenCalled()
  })

  // ──────────────────────────────────────────────────────────────
  // Disabled state
  // ──────────────────────────────────────────────────────────────

  it('disables the button when disabled=true', () => {
    render(<Button disabled>Cannot click</Button>)

    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('does not fire onClick when disabled', () => {
    const handleClick = vi.fn()
    render(
      <Button disabled onClick={handleClick}>
        Cannot click
      </Button>
    )

    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).not.toHaveBeenCalled()
  })

  // ──────────────────────────────────────────────────────────────
  // Normal click
  // ──────────────────────────────────────────────────────────────

  it('fires onClick when not disabled or loading', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  // ──────────────────────────────────────────────────────────────
  // Variants
  // ──────────────────────────────────────────────────────────────

  it('applies primary variant classes by default', () => {
    render(<Button>Primary</Button>)

    // primary variant uses bg-gradient-to-br from-brand-500 (design system uses gradient, not flat bg-brand-500)
    expect(screen.getByRole('button').className).toContain('from-brand-500')
  })

  it('applies danger variant classes', () => {
    render(<Button variant="danger">Delete</Button>)

    expect(screen.getByRole('button').className).toContain('bg-error-600')
  })

  // ──────────────────────────────────────────────────────────────
  // ariaLabel prop
  // ──────────────────────────────────────────────────────────────

  it('uses ariaLabel for icon-only buttons', () => {
    render(<Button variant="icon" ariaLabel="Close dialog" />)

    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
  })
})
