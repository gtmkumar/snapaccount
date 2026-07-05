/**
 * useFocusTrap — DG-ADMIN-04
 *
 * Cycles Tab / Shift+Tab within a container element (focus trap).
 * Saves the trigger element on open and restores focus to it on close.
 * Apply to modals/dialogs/overlays that carry role="dialog" aria-modal="true".
 *
 * Usage:
 *   const containerRef = useFocusTrap(isOpen)
 *   <div ref={containerRef} ...>…</div>
 */
import { useEffect, useRef, useCallback, type RefObject } from 'react'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'details > summary',
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    el => !el.closest('[hidden]') && el.offsetParent !== null
  )
}

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Save the element that opened the modal so we can restore focus on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null
    } else {
      // Restore focus when the modal closes
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        // Defer to allow the DOM to settle
        const el = triggerRef.current
        requestAnimationFrame(() => el.focus())
      }
      triggerRef.current = null
    }
  }, [isOpen])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || e.key !== 'Tab' || !containerRef.current) return

      const focusable = getFocusableElements(containerRef.current)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        // Shift+Tab: wrap from first → last
        if (active === first || !containerRef.current.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab: wrap from last → first
        if (active === last || !containerRef.current.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [isOpen]
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  return containerRef
}
