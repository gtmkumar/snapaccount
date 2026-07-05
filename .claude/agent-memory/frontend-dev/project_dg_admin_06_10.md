---
name: dg-admin-06-10-keyboard-datatable
description: DG-ADMIN-06 through 10 — 'g a' chord fix, command palette enhancements, DataTable density variant
type: project
---

DG-ADMIN-06/07/08/09/10 all implemented in one batch (2026-06-28). Build clean (zero TS errors).

**DG-ADMIN-06** ('g a' → 404): Remapped `G_CHORD_MAP['a']` from `/accounting` (non-existent) to `/compliance/edit-log` (existing MCA Edit Log page). Updated cheat sheet label to 'Go to Edit Log (Accounting)'.

**DG-ADMIN-07** (palette key actions): In `CommandPalette.tsx` `handleKeyDown`:
- cmd/ctrl+Enter → `window.open(item.url, '_blank')`
- cmd/ctrl+. → `navigator.clipboard.writeText(item.id)` + sonner toast
- Tab/Shift+Tab → cycle `FILTER_OPTIONS` (modulo wrap)
- ArrowUp/Down → modulo wrap instead of Math.min/max clamping
Added `palette.hint.newTab` hint in footer. Import `toast` from sonner.

**DG-ADMIN-08** (live region): Added `aria-live="polite" role="status" className="sr-only"` span inside palette panel; renders `t('palette.results.count', { count: displayItems.length })` only when `!isLoading && query.trim().length >= 2`.

**DG-ADMIN-09** (discovery hints): Added `FIRST_USE_KEY='snap_shortcuts_first_use_shown'` constant; `useEffect` in `KeyboardShortcutsProvider` fires `toast.info(t('shortcuts.tip.firstUse'))` after 2.5s on first mount (guarded by localStorage flag). The `shortcuts.unknown.toast` key was already in en.json (line 2499) with i18n wiring — no change needed.

**DG-ADMIN-10** (DataTable density): Added `DataTableDensity = 'roomy' | 'compact'`, `useDensityPref(tableId, default)` hook, `density?`/`tableId?`/`showDensityToggle?` props to `DataTable`. Toolbar toggle with AlignJustify/LayoutList icons (lucide), persisted per `snap_dt_density_{tableId}`. Compact: `py-1.5 text-[13px] tabular-nums`; roomy: `py-3 text-xs`. Migrated `CallbackListPage` bespoke toggle from `'dense'` → `'compact'` vocab + `snap_dt_density_callbacks` key (legacy `snap_cb_density` migrated and removed). Added `tableId` to BankCommunicationsPage, StaffTab, SubscriptionsPage callers.

**i18n keys added** (en/hi/bn parity):
- `shortcuts.tip.firstUse`
- `palette.hint.newTab`, `palette.hint.copyId`, `palette.copyId.success`
- `palette.results.count` / `_one` / `_other`
- `dataTable.density.label`, `dataTable.density.roomy`, `dataTable.density.compact`

**Why:** dataTable.density.roomy/compact already used `admin.callbacks.density.roomy/dense` keys — now unified under `dataTable.*` shared keys.
