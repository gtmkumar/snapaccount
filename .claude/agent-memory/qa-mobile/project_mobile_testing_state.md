---
name: Mobile Testing State
description: Current phase, test baseline, known pre-existing failures, and key patterns discovered
type: project
---

Phase 6F COMPLETE as of 2026-04-25. Live smoke re-test run 2026-06-06 (Session 2) — BUG-1/3/4 FIXED and verified. New BUG-5 found (Team invite 409 after fresh onboarding).

**Why:** Phase 6F is the final phase covering tracks F2 (Chat/SignalR) and F4 (Theme/Haptics/NetworkQuality).

**How to apply:** Next phase (7+) starts with 323 total tests, 319 passing. The 4 LoanPackagePreviewScreen failures are pre-existing watermark matcher bugs — not regressions. Do not attempt to fix in QA agent.

## Jest baseline per phase
- Phase 6A/6E: 153 → 204 → 235 passing
- Phase 6B/6D: 235 → ~270 (estimate)
- Phase 6F: 323 total, 319 passing (4 pre-existing LoanPackagePreview failures)

## Known pre-existing failures
- `LoanPackagePreviewScreen.test.tsx` — 4 tests: watermark test calls `.toMatch()` on array (icon + Text children array). Filed as pre-existing. Do not count as regression.

## iOS Simulator (2026-06-06 live test)
- Simulator available and working: iPhone 17 Pro iOS 26.5 (UDID: 17BF04F0-A5F0-4C76-80FA-05FB8204FE4C)
- mcp__ios-simulator__* tools work. Use AX tree coordinates (ui_describe_all) for taps — not screenshot pixel estimates.
- Hardware keyboard suppresses software keyboard; use software keyboard toggle via AppleScript or simulate via keystroke injection.
- App bundle ID: com.snapaccount.app
- Metro on localhost:8081, AuthService on localhost:5101 (LOCAL_AUTH mode), OTPs logged to /tmp/authsvc.log

## Critical Bugs Found (2026-06-06 smoke test) — task IDs
- BUG-1 (Task #12): PUT /auth/profile 500 for all new users — DbUpdateConcurrencyException in UserRepository.UpdateAsync. Blocks ALL onboarding completion. FIXED (verified 2026-06-06 Session 2).
- BUG-2 (Task #13): Team tile never shown — downstream of BUG-1, no BUSINESS_OWNER user can exist. FIXED (verified 2026-06-06 Session 2 — Team tile shown after BUG-1 fix).
- BUG-3 (Task #14): Deep link snapaccount://invite/:token crashes app — React Navigation duplicate pattern conflict. FIXED (verified 2026-06-06 Session 2 — AcceptInvite screen opens without crash).
- BUG-4 (Task #15): ProfileScreen Sign Out button unreachable — ScrollView missing paddingBottom to clear tab bar. FIXED (verified 2026-06-06 Session 2 — Sign Out reachable and functional).
- BUG-5 (NEW, 2026-06-06 Session 2): POST /auth/team/invite returns 409 "Org.InvalidContext" immediately after business onboarding. Session JWT issued at OTP login does not carry OrganizationId (org created during wizard after JWT issued). OrgContextGuard.ValidateAsync rejects POST CreateInvitation. GET /auth/team/invites works because it resolves orgId from DB. Fix: refresh/reissue session JWT after markAuthenticated() in BusinessProfileWizardScreen. Severity: High. Workaround: re-login after onboarding.

## Expo Go
- `import '../../src/i18n'` at top of test files loads real translations. `t('mobile.chat.list.empty')` returns actual English string, not key.
- Keys under `mobile.*` namespace resolve correctly. Keys without `mobile.` prefix (e.g. `chat.list.filter.gst`) return the key itself as fallback — useful for `getByLabelText`.
