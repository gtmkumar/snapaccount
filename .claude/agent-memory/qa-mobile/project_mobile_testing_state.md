---
name: Mobile Testing State
description: Current phase, test baseline, known pre-existing failures, and key patterns discovered
type: project
---

Phase 6F COMPLETE as of 2026-04-25.

**Why:** Phase 6F is the final phase covering tracks F2 (Chat/SignalR) and F4 (Theme/Haptics/NetworkQuality).

**How to apply:** Next phase (7+) starts with 323 total tests, 319 passing. The 4 LoanPackagePreviewScreen failures are pre-existing watermark matcher bugs — not regressions. Do not attempt to fix in QA agent.

## Jest baseline per phase
- Phase 6A/6E: 153 → 204 → 235 passing
- Phase 6B/6D: 235 → ~270 (estimate)
- Phase 6F: 323 total, 319 passing (4 pre-existing LoanPackagePreview failures)

## Known pre-existing failures
- `LoanPackagePreviewScreen.test.tsx` — 4 tests: watermark test calls `.toMatch()` on array (icon + Text children array). Filed as pre-existing. Do not count as regression.

## iOS Simulator
- Direct simulator interaction blocked by Xcode platform missing error.
- All tests run via jest-expo preset only (no simulator required for unit/component tests).
- E2E tests deferred — no Detox/Maestro infra confirmed available.

## Expo Go
- `import '../../src/i18n'` at top of test files loads real translations. `t('mobile.chat.list.empty')` returns actual English string, not key.
- Keys under `mobile.*` namespace resolve correctly. Keys without `mobile.` prefix (e.g. `chat.list.filter.gst`) return the key itself as fallback — useful for `getByLabelText`.
