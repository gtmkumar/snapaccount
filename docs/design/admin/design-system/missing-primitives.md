# Missing Primitives — Gap-Fill Spec (Phase 6F)

> Phase 6F · Track F1 · Owner: ui-ux-agent → frontend-dev.
> Many primitives already exist from Phase 6A–E. This file ONLY documents gaps, dense variants, and clarifications. Reference the existing `component-library.md` for shipped specs.

## 1. Skeleton — gaps

Existing: row, card, list shimmer.

Add:
- `<Skeleton variant="shell">` — full app-shell skeleton (sidebar 240px gray block + topbar 56px + content 3-column grid placeholder). Used by RoleGuard while user resolves.
- `<Skeleton variant="dataTableDense">` — for compact DataTable; row height 32px instead of 48px.
- `<Skeleton variant="chart">` — bar/line placeholder with 5 randomized heights and animated shimmer.
- `<Skeleton variant="pdf">` — single page placeholder, A4 aspect ratio, with 8 line shimmers.

All variants respect `prefers-reduced-motion` (static gray, no shimmer) and use light/dark tokens (`slate.100 ↔ slate.50` light; `slate.800 ↔ slate.700` dark).

## 2. EmptyState — gaps

Existing: generic empty.

Add per-context illustrations + copy bundles (illustrations as inline SVG, currentColor):
- `empty.callbacks` — clipboard-with-check, "No callbacks waiting"
- `empty.chat.thread` — chat-bubbles-with-spark, "Start the conversation"
- `empty.chat.inbox` — inbox-with-checkmark, "Inbox zero"
- `empty.reports` — chart-bar, "Generate your first report"
- `empty.subscriptions` — credit-card-stack, "No active subscriptions"
- `empty.team` — people-circle, "Invite your first teammate"
- `empty.search.noResults` — magnifier-with-question, "No matches"
- `empty.notice.inbox` — envelope-check, "No notices yet"
- `empty.loans.applications` — handshake, "No loan applications"

Each: optional primary CTA ("New …", "Generate", "Invite").

Props extension:
```ts
interface EmptyStateProps {
  variant: 'generic' | keyof typeof contextMap;
  title?: string;        // override default
  description?: string;
  primaryCta?: { label: string; onPress: () => void };
  secondaryCta?: { label: string; onPress: () => void };
  size?: 'sm' | 'md' | 'lg';   // sm for in-card empties, lg for full-page
}
```

A11y: heading focused on render; illustration `aria-hidden`; message read by SR; CTA in tab order.

## 3. Dialog — gaps

Existing: confirm modal, basic dialog.

Add:
- `Dialog.Confirm.Destructive` variant — red primary CTA, requires typing entity name to confirm (used for delete plan, delete user, cancel subscription, decline ITR with reason).
- `Dialog.Wide` size — 720px (vs default 480px) for forms with two-column layouts (Add user, Create plan).
- `Dialog.scrollableBody` mode — header + footer pinned, body scrolls; required for long T&Cs.

Standard footer button order (mirror): Cancel (ghost) on left for desktop, primary on right; reverse on mobile.

Focus management:
- On open: first focusable element OR title if no controls.
- On close: return to trigger; if trigger removed, focus body.
- Escape closes UNLESS `mandatoryConfirm` (used for legal acceptance).

## 4. Drawer — gaps

Existing: right-side drawer for filter & detail panes.

Add:
- `Drawer.placement="bottom"` — used for mobile-web filter bottom-sheet.
- `Drawer.size="lg"` — 720px wide vs default 480px (for "Compose message" full editor).
- Snap-points (mobile only): 30%, 70%, 100%, with drag handle.

## 5. Tabs — gaps

Existing: horizontal tabs with underline.

Add:
- `Tabs.variant="pills"` — rounded pills for filter-style tab groups (Inbox > All / Unread / Mentions).
- `Tabs.variant="vertical"` — left-aligned vertical tabs for Settings page sections.
- `Tabs.scrollable` — when tabs exceed width, horizontal scroll with shadow fades on edges; left/right chevron buttons appear.
- `Tabs.badgeSlot` — counter chip aligned right of label (e.g., "Unread (12)"). Live-region update on count change.

## 6. Stepper — gaps

Existing: horizontal Stepper (linear).

Add:
- `Stepper.variant="numbered"` — numbered dots vs check-icon dots; used in onboarding wizards.
- `Stepper.orientation="vertical"` — already present (Phase 6D); document the dense web variant: 24pt nodes vs 32pt.
- `Stepper.branching` — for state machines like Callback (CONTACTED → COMPLETED OR FOLLOW_UP_NEEDED OR ESCALATED). Branch nodes shown below happy-path with dashed connectors. Already partially in Phase 6E StatusTimeline.

## 7. ErrorBoundary — gaps

Existing: app-level boundary with reload CTA.

Add:
- Per-pane `<ErrorBoundary scope="pane">` — used to isolate widgets (e.g., MRR chart can fail without breaking SubscriptionsPage). Renders inline fallback card with retry + "Report issue" link.
- `<ErrorBoundary scope="route">` — current default; full-page fallback.
- Crashlytics-equivalent integration: log error to backend `/clientErrors` endpoint with redacted stack.

Fallback UI tokens: surface-raised + warning border + warning icon.

## 8. DataTable — compact / dense variant

Existing: roomy variant (row 56px, header 48px).

Add `density="compact"`:
- Row height 32px; header 36px; cell padding 8px.
- Font 13px; tabular-nums for numeric columns.
- Used by: BankComms log, AuditTrail, Subscriptions list (long rows ok), Team list.
- Toggle on toolbar `Density: roomy | compact` (icon button: rows-three vs rows-six). Persisted per table id in localStorage.

A11y: row tabindex, arrow-key navigation, screen-reader still reads full cell context regardless of density.

## 9. DateRangePicker — gaps

Existing: single-date picker.

New primitive:
- Two-month calendar; click-and-drag or click start then end; min/max constraints.
- Presets (left rail): Today, Yesterday, Last 7d, Last 30d, This month, Last month, FY 25-26, FY 26-27, Custom.
- Indian financial year alignment: April 1 to March 31. Default preset for Reports = "Current FY".
- Apply / Cancel footer; chip in trigger shows "{start} – {end}" in DD/MM/YYYY.

Props:
```ts
{
  value: { start: Date | null; end: Date | null };
  onChange(v): void;
  presets?: Preset[];
  minDate?: Date; maxDate?: Date;
  fyAware?: boolean;     // default true
  align?: 'start' | 'end';
}
```

A11y: WAI-ARIA grid pattern; arrows navigate days; PageUp/Down month; Shift+PageUp/Down year; Enter selects.

## 10. Combobox — gaps

Existing: HsnSacTypeahead (Phase 6B).

Generic primitive:
- Generic typeahead with: async loader, max-results, recent items section, keyboard nav, multi-select option.
- Renders chips for multi-select.
- Empty state inside listbox: "No results — try a different keyword".

Variants used in 6F: User picker (Team page invite + assign), Plan picker (Subscription assign), Bank picker (Loan filter), Category picker (Chat).

A11y: full WAI-ARIA combobox pattern; `aria-activedescendant`, `aria-expanded`, `role="listbox"`/`option`.

## 11. DropdownMenu — gaps

Existing: header user menu.

Generic `<DropdownMenu>`:
- Trigger any element (button, icon, row).
- Sections separated by `<DropdownMenu.Separator>`.
- Items: `default`, `destructive`, `disabled`. Keyboard: arrow nav, Enter to activate, type-ahead first letter.
- Submenu support (one level deep).
- `<DropdownMenu.CheckboxItem>` for filter toggles.

Used in 6F by: row-action "⋯" on every list page, density toggle, theme toggle long-press menu.

## 12. Component-library cross-reference

All gaps above will be appended to `component-library.md` Phase 6F section with full prop tables, ARIA, and dark-mode tokens (already documented globally). This file is the design intent; the library is the implementation contract.

## 13. Open ambiguities (flagged for orchestrator)

1. **DataTable virtualization** — at >500 rows, dense variant should virtualize. Decision: react-virtual vs tanstack-virtual to be made by frontend-dev; design-side OK with either.
2. **Combobox async vs sync** — generic primitive accepts both; specific instances will pick. Backend search endpoint contracts owned by backend-agent.
3. **Drawer snap-points on mobile-web** — gesture system overlap with browser pull-to-refresh. Recommend disabling pull-to-refresh while drawer open.
