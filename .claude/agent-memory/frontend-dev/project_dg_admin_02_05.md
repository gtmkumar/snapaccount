---
name: project_dg_admin_02_05
description: DG-ADMIN-02/03/04/05 a11y + keyboard shortcut gaps — list shortcuts, cmd+/ cmd+s, focus traps, skip link
type: project
---

Implemented 2026-06-28 on branch `feature/repository-refactor`.

## What was built

**DG-ADMIN-02** — List-context keyboard shortcuts (j/k/x/a/r/f)
- New hook: `src/admin/src/hooks/useListKeyboard.ts`
- Wires j/k (next/prev row with roving tabindex), Enter (open), x (toggle select), a (select all), r (refresh), f (filter)
- Scoped to container focus — does not fire when text inputs have focus
- Integrated into `DataTable.tsx`: adds `containerProps` spread, `rowRefs`, `activeIndex` ring highlight, roving `tabIndex`, scroll-into-view on j/k
- `DataTableProps` gains optional `onRefresh` and `onFilter` callbacks

**DG-ADMIN-03** — Universal cmd+/ and cmd+s shortcuts
- `KeyboardShortcutsContext.tsx` gains a `registerShortcutHandlers()` registry pattern
- `ShortcutRegistry` type: `{ onSave?, searchInputRef? }`
- cmd+/ focuses `searchInputRef` or falls back to `[data-search-input]` attribute
- cmd+s calls `onSave()` and prevents the browser Save dialog
- Export `registerShortcutHandlers` in context value (also exported from the hook)
- Also fixed DG-ADMIN-09 bonus: hardcoded English unknown-chord toast → now uses `t('shortcuts.unknown.toast', { key })`

**DG-ADMIN-04** — Focus trap in CommandPalette, KeyboardShortcutsOverlay, and Dialog
- New hook: `src/admin/src/hooks/useFocusTrap.ts`
- Cycles Tab/Shift+Tab among focusable descendants; stores trigger element on open, restores focus on close
- Applied via `panelRef` in `CommandPalette.tsx` and `KeyboardShortcutsOverlay.tsx`
- `Dialog.tsx` migrated from hand-rolled Tab trap to `useFocusTrap` + focus restoration

**DG-ADMIN-05** — Skip-to-content link in AppShell
- Added as first focusable element in `AppShell.tsx`
- Visually hidden via `sr-only`, visible on focus with branded styling
- `href="#main-content"` + `onClick` focuses the existing `<main id="main-content">` element
- Label via `t('a11y.skipToContent')`

## i18n keys added (en/hi/bn parity)
- `a11y.skipToContent`
- `shortcuts.unknown.toast` (was a hardcoded English string in KeyboardShortcutsContext)

## Build status
- `npm run build` — clean, zero TypeScript errors
- Tests: 23 pre-existing failures (StatusBadge + DocumentQueuePage — CSS variable vs old class name) NOT caused by these changes; 34/34 CommandPalette + KeyboardShortcutsOverlay tests pass; i18n parity 5/5 pass

**Why:** keyboard accessibility + WCAG 2.4.3 compliance requirement from gap audit 2026-06-28.
**How to apply:** `useListKeyboard` is standalone; add to any page with a filterable/refreshable list. `useFocusTrap` is standalone; apply to any future modal. `registerShortcutHandlers` lets page-level forms opt-in to cmd+s.
