---
name: Mobile Testing State
description: Current phase, test baseline, known pre-existing failures, and key patterns discovered
type: project
---

Phase 7 Wave 1+2 complete on branch `2026-06-10-s5t4`. Live Android sweep (2026-06-11) + iOS sweep (task #22, 2026-06-11) both complete. 438/438 Jest tests passing.

**Why:** Phase 7 Wave 2 includes DPDP privacy stack, RBI KFS, Razorpay, migrations 062-064. BUG-5 (team invite 409) still open. AND-08 startup crash Android-only still open.

**How to apply:** Jest baseline is 438 passing (47 suites). iOS sweep is PASS. Android is CONDITIONAL PASS (AND-08 crash + Metro cache issues).

## Jest baseline per phase
- Phase 6A/6E: 153 → 204 → 235 passing
- Phase 6B/6D: 235 → ~270 (estimate)
- Phase 6F: 323 total, 319 passing (4 pre-existing LoanPackagePreview failures)
- Phase 7 Wave 1+2: 438 total, 438 passing

## Known pre-existing failures
- `LoanPackagePreviewScreen.test.tsx` — 4 tests: watermark test calls `.toMatch()` on array (icon + Text children array). Filed as pre-existing. Resolved in Phase 7 baseline.

## iOS Simulator (2026-06-11 live sweep — task #22)
- Simulator: iPhone 17 Pro iOS 26.5 (UDID: 17BF04F0-A5F0-4C76-80FA-05FB8204FE4C)
- Build: `npx expo run:ios --device 17BF04F0-A5F0-4C76-80FA-05FB8204FE4C` (required for SecureStore)
- Metro: must use `--reset-cache` when i18n en.json changes — Metro caches JSON assets separately from JS modules
- App bundle ID: com.snapaccount.app
- OTP for 9111222333 in Aspire logs: `/var/folders/pd/qb9jqwgs5tlfjsws71dlxycr0000gn/T/aspire.DOQOan/auth-service-sdmrcjqk_out_b85fb3f1-69af-4b73-80ea-92811ce1dbd6`
- iOS does NOT apply FLAG_SECURE — all screen content visible in screenshots (unlike Android)
- Dynamic Island (iPhone 17 Pro): content renders correctly below capsule
- Safe area handling: confirmed working

## iOS Sweep Results (2026-06-11, task #22)
All 10 AND-XX items PASS on iOS:
- AND-02 (icons): PASS
- AND-03 (GST card): PASS  
- AND-04 (filenames): PASS (visually confirmed, no FLAG_SECURE)
- AND-08 (Privacy Center crash): PASS — NO CRASH on iOS; graceful degradation banner shown
- AND-09: NOT TRIGGERED — Privacy Center stable on iOS
- AND-10 (chat filter chips): PASS — after Metro --reset-cache
- AND-11 (Language & Notifications title): PASS — after Metro --reset-cache
- AND-13 (subtitle wrap): PASS
- AND-14 (profile card tappable): PASS
- AND-15 (callback category): PASS — "GST Filing" shown

New iOS bugs found:
- IOS-01 (Medium): Consent summary degradation banner always shows — backend returns `Consents` (PascalCase) but mobile expects `items`. Both platforms affected.
- IOS-02 (Medium): Loan products API error for test account. Both platforms affected.
- IOS-03 (Low): DPO section partially hidden behind tab bar in Privacy Center.

## Critical Bugs Found (2026-06-06 smoke test) — task IDs
- BUG-1 (Task #12): PUT /auth/profile 500 — FIXED
- BUG-2 (Task #13): Team tile never shown — FIXED
- BUG-3 (Task #14): Deep link crash — FIXED
- BUG-4 (Task #15): Sign Out unreachable — FIXED
- BUG-5 (NEW, 2026-06-06): POST /auth/team/invite returns 409 "Org.InvalidContext" — session JWT missing orgId after fresh onboarding. OPEN. Severity: High. Workaround: re-login.
- AND-08 (NEW, 2026-06-11): Startup `TypeError: Cannot read property 'filter' of undefined` on Android only. NOT PrivacyCenterScreen — separate component mounting at app startup (tab-bar level or global hook). ScreenErrorBoundary fix is correct for Privacy Center but startup error must be traced separately. OPEN. Critical/Android-only.

## Metro Cache Pattern (critical knowledge)
Metro Fast Refresh updates JS modules but does NOT serve updated JSON assets. When en.json changes (i18n keys added/changed), must restart Metro with `--reset-cache`. Running `npx expo start --reset-cache --port 8081` serves fresh bundle with all new keys. Without this, i18n key changes are invisible at runtime even though Fast Refresh runs.

## Expo Go
- `import '../../src/i18n'` at top of test files loads real translations.
- Keys under `mobile.*` namespace resolve correctly. Keys without `mobile.` prefix return the key itself as fallback.
