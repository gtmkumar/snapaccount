# Phase 7 Tasks — qa-mobile

> Ownership: `mobile/__tests__/`, `mobile/e2e/`, `.claude/qa/`. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.

## HIGH priority

### QM1 — BUG-5 regression verification (GAP-007)
- After backend B4 + mobile M2: full re-run of the live-smoke flow (fresh signup → business wizard → Team invite in same session) on iOS Simulator + Android Emulator; update `.claude/qa/mobile-report.md` and close BUG-5.

## MEDIUM priority

### QM2 — Physical-device & release-config pass (GAP-082, depends mobile M1 EAS build)
- FCM token registration + push receipt end-to-end on physical Android + iOS (P6-MOBILE-02); deep-link scheme vs production bundle id (P6-MOBILE-03); Google/Apple social sign-in E2E; SecureStore persistence across app kill; cert-pinning verification (pinned host connects, tampered cert fails).

### QM3 — Mobile E2E suite (GAP-080)
- Create `mobile/e2e/` (Maestro recommended for Expo): onboarding (OTP→persona→wizard), document capture→upload→status, GST approval w/ biometric gate (M4), loan eligibility→KFS→consent (M3), ITR checklist→approval. Wire to CI when EAS + D2 ready.

### QM4 — Re-verify open QA fixlist after mobile M10
- Confirm 44pt targets (P6-QA-MOBILE-04/05/08/09), CelebrationOverlay guard (-10/-11), LoanPackagePreview matchers, "NaN documents", DevicesScreen supersedes BUG-MOB-006; refresh `.claude/qa/mobile-report.md` open-items table.
