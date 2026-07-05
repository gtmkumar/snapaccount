/**
 * useListKeyboard — DG-ADMIN-02
 *
 * Wires list-context keyboard shortcuts documented in keyboard-shortcuts.md §3.3:
 *   j        → move focus to next row
 *   k        → move focus to previous row
 *   Enter    → open / activate the focused row (calls onOpen)
 *   x        → toggle selection on the focused row (calls onToggleSelect)
 *   a        → select / deselect all visible rows (calls onSelectAll)
 *   r        → refresh (calls onRefresh)
 *   f        → open filter drawer (calls onFilter)
 *
 * The listener is scoped: it only fires when the list container (or a descendant)
 * has focus, so it does not clash with global shortcuts or text inputs.
 *
 * Usage:
 *   const { activeIndex, containerProps } = useListKeyboard({
 *     rowCount: rows.length,
 *     onOpen:        (i) => navigate(`/items/${rows[i].id}`),
 *     onToggleSelect:(i) => toggleRow(i),
 *     onSelectAll:   () => selectAll(),
 *     onRefresh:     () => refetch(),
 *     onFilter:      () => setFilterOpen(true),
 *   })
 *
 *   // Spread containerProps onto the list wrapper div so focus-events work.
 *   <div {...containerProps}>
 *     {rows.map((row, i) => (
 *       <tr
 *         tabIndex={i === activeIndex ? 0 : -1}
 *         aria-selected={i === activeIndex}
 *         ...
 *       />
 *     ))}
 *   </div>
 */
import { useState, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface UseListKeyboardOptions {
  /** Total number of visible rows */
  rowCount: number
  /** Called when Enter is pressed on the active row */
  onOpen?: (index: number) => void
  /** Called when 'x' is pressed on the active row */
  onToggleSelect?: (index: number) => void
  /** Called when 'a' is pressed — select/deselect all */
  onSelectAll?: () => void
  /** Called when 'r' is pressed — refresh */
  onRefresh?: () => void
  /** Called when 'f' is pressed — open filter */
  onFilter?: () => void
}

export interface UseListKeyboardResult {
  /** Index of the currently keyboard-focused row (-1 = none) */
  activeIndex: number
  /** Reset active index (e.g. after data reload) */
  resetActiveIndex: () => void
  /** Props to spread onto the list container element */
  containerProps: {
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
    onFocus: () => void
    onBlur: (e: React.FocusEvent<HTMLElement>) => void
  }
}

function isInputElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    (el as HTMLElement).isContentEditable === true
  )
}

export function useListKeyboard({
  rowCount,
  onOpen,
  onToggleSelect,
  onSelectAll,
  onRefresh,
  onFilter,
}: UseListKeyboardOptions): UseListKeyboardResult {
  const [activeIndex, setActiveIndex] = useState(-1)
  const hasFocusRef = useRef(false)

  const resetActiveIndex = useCallback(() => setActiveIndex(-1), [])

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      // Only handle shortcuts when the container has focus and the
      // actual focused element is NOT a text input/textarea/select.
      if (!hasFocusRef.current || isInputElement(document.activeElement)) return
      if (rowCount === 0) return

      const key = e.key.toLowerCase()

      switch (key) {
        case 'j':
          e.preventDefault()
          setActiveIndex(i => {
            const next = i < 0 ? 0 : Math.min(i + 1, rowCount - 1)
            return next
          })
          break

        case 'k':
          e.preventDefault()
          setActiveIndex(i => {
            const prev = i < 0 ? 0 : Math.max(i - 1, 0)
            return prev
          })
          break

        case 'enter':
          if (activeIndex >= 0) {
            e.preventDefault()
            onOpen?.(activeIndex)
          }
          break

        case 'x':
          if (activeIndex >= 0) {
            e.preventDefault()
            onToggleSelect?.(activeIndex)
          }
          break

        case 'a':
          e.preventDefault()
          onSelectAll?.()
          break

        case 'r':
          e.preventDefault()
          onRefresh?.()
          break

        case 'f':
          e.preventDefault()
          onFilter?.()
          break

        default:
          break
      }
    },
    [activeIndex, rowCount, onOpen, onToggleSelect, onSelectAll, onRefresh, onFilter]
  )

  const handleFocus = useCallback(() => {
    hasFocusRef.current = true
  }, [])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLElement>) => {
    // Only clear hasFocus when focus truly leaves the container
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      hasFocusRef.current = false
    }
  }, [])

  return {
    activeIndex,
    resetActiveIndex,
    containerProps: {
      onKeyDown: handleKeyDown,
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
  }
}
