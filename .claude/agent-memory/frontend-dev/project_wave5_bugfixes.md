---
name: wave5-bugfixes
description: Wave 5 QA bugfixes — BUG-MCA-ETYPE-005 entityType casing + BUG-DASH-KB-004 ARIA keyboard nav
metadata:
  type: project
---

Wave 5 live-web QA fixed two bugs: BUG-MCA-ETYPE-005 (HIGH) and BUG-DASH-KB-004 (MEDIUM).

**BUG-MCA-ETYPE-005 — EditLogPage entityType snake_case (already correct in code)**

The ENTITY_TYPE_OPTIONS in EditLogPage.tsx already used snake_case values (`journal_entry` etc.) matching the backend validator. The bug was "latent" per the QA report — fixed in a prior session. No code change needed to EditLogPage.tsx itself. Added two explicit regression tests to `EditLogPage.test.tsx`:
- One test iterates all 5 dropdown option values and asserts each call to `getEditLog` receives only snake_case values matching `/^[a-z][a-z_]*$/`
- One test inspects `HTMLSelectElement.options` directly to verify no PascalCase values exist

**BUG-DASH-KB-004 — Tier3TabBar ARIA keyboard navigation**

`Tier3TabBar` in `DashboardPage.tsx` had correct ARIA roles (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`) but lacked:
- `onKeyDown` handler
- Roving `tabIndex` (active=0, inactive=-1)

Fix applied in `Tier3TabBar`:
- Added `tabIndex={active === tab.id ? 0 : -1}` to each tab button
- Added `onKeyDown` handler implementing WAI-ARIA 1.2 Tabs pattern:
  - ArrowRight → next tab (wrap-around)
  - ArrowLeft → prev tab (wrap-around)
  - Home → first tab
  - End → last tab
  - Calls `e.preventDefault()` on navigation keys
  - After `onChange()`, moves DOM focus via `document.getElementById(...).focus()`

**New test file created**: `src/__tests__/DashboardPage.test.tsx` (13 tests)
- Mocks: `@/hooks/usePermission` (grants dashboard.full), all 5 dashboardApi functions, recharts components
- Tests: render smoke, roving tabIndex initial state, ArrowRight/Left/wrap, Home, End, preventDefault, aria-selected state on click

**Test delta**: 1007 → 1022 (+15: 2 EditLog + 13 Dashboard). 53 test files. 0 lint errors.

**Why:** aria-roles without keyboard handling is an accessibility violation (WCAG 2.1 SC 2.1.1). The pattern is WAI-ARIA 1.2 §3.23 Tabs.

**How to apply:** Any future tablist component must implement the same roving tabIndex + ArrowLeft/Right/Home/End pattern. Always write a dedicated keyboard-navigation test when adding tablist components.
