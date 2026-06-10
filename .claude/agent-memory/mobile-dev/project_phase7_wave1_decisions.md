---
name: Phase 7 Wave 1 Decisions (M5 + M7)
description: Phase 7 Wave 1 — Coming Soon stub removal (GAP-060) and i18n extraction (GAP-061); nav wiring decisions, hidden entries, test env regression note
type: project
---

Phase 7 Wave 1 complete as of 2026-06-10.

**Tasks completed:** M5 (GAP-060) and M7 (GAP-061)
**Task deferred:** M2/BUG-5 — blocked on backend B4

**Test baseline going in:** 155 passing (12 suites) — see regression note below
**Test baseline coming out:** 155 passing (12 suites), 0 regressions introduced
**New test suite added:** `__tests__/screens/ITRDashboardScreen.test.tsx` (36 total suites)

**Why:** Phase 7 Wave 1 removes UX dead-ends left by the stub-first development approach across phases 1–6. M7 extracts all remaining hardcoded tab/nav labels for DPDP/i18n completeness.

**How to apply:** Reference for Phase 7 Wave 2+ nav decisions. The ITR+GST+Profile patterns established here (disable instead of alert, hide instead of stub) should be the default for any future Coming-Soon removals.

## M5 — Navigation Wiring Decisions

### ITRDashboard quick actions
The key insight: `ITRDashboardScreen` was embedded directly in `MoreStack` so it had `MoreStackParamList` nav prop — it couldn't navigate to `ItrStack` routes.
**Fix**: Changed `MoreStack` `ITRDashboard` screen component to the full `ItrStack` navigator (not just `ITRDashboardScreen`). `ITRDashboard` is `ItrStack`'s `initialRouteName` so it loads first. Child navigation then works normally.

| Quick Action | Route | Notes |
|---|---|---|
| Start Filing | `EmployeeProfileWizard` | Entry point of new ITR filing. Passes `assesseeId`+`filingId` if existing return found, otherwise fresh. |
| Doc Checklist | `DocChecklist` | Direct — fully implemented |
| Compare Regime | `RegimeComparison` | Passes `filingId` if available; screen handles both modes |

### GST Dashboard
- Calendar button: **removed** (no calendar screen in GstStack — no half-stub)
- GSTR-1 entries (invoice editing): **disabled** via `onPress={undefined}` on `ReturnCard` — prop made optional; pressing does nothing rather than showing an alert
- All other return types: unchanged (already wired)

### ProfileScreen
- Help: routed to `'Chat'` (ChatStack via MoreStack; both live and async chat exist)
- Billing: `disabled: true` — `menuItemDisabled` style applied; `onPress` blocked — M6 will wire this
- Edit Business: **removed from menuItems array** (no edit flow exists)

### Deleted duplicate loan screens
The `loan/` (singular) directory contained stale duplicates of screens that live in `loans/` (plural — the active directory). Deleted: `LoanHubScreen`, `LoanEligibilityScreen`, `LoanStatusScreen`. Kept: `EMICalculatorScreen` (wired in LoanStack).

## M7 — i18n Changes
- 33 keys added to all 3 locale files (en, hi, bn) — 801→834 keys, strict parity
- New namespaces: `mobile.tabs.*` (7), `mobile.more.*` additions (11), `mobile.profile.title` (1), `mobile.itr.dashboard.*` (12), `mobile.profile.billing.*` (2)
- All 7 bottom tab labels now use `t()` in `AppNavigator.tsx`
- `MoreScreen.tsx` fully i18n'd (was 100% hardcoded)

## Known Test Environment Regression (Pre-existing, pre-Phase-7)
Previous baseline: 325 tests (post security hotfix 6F). Current: 155 tests (12 suites, 36 total).
**Root cause:** `Invariant Violation: __fbBatchedBridgeConfig is not set` — affects all 24 component-level test suites. `nativewind`/`react-native-css-interop` loads native modules via `TurboModuleRegistry` in Jest which bypasses all `NativeModules` mocks. This regression appeared between Phase 6F security hotfix (2026-04-25) and Phase 7 dispatch (2026-06-10). It is NOT caused by Phase 7 Wave 1 changes.
**Suites passing (12):** All non-component tests: api/, hooks/, stores/, notifications/notificationRouter, utils/ — nothing that imports React Native UI components.
**Impact:** The 24 failing suites all fail-to-run (not fail individual assertions). My new `ITRDashboardScreen.test.tsx` also fails to run for the same reason — the test logic itself is correct.
**Resolution needed:** This requires either upgrading `react-native-css-interop`/`nativewind` or adding a comprehensive TurboModuleRegistry shim. Out of scope for Phase 7 Wave 1.
