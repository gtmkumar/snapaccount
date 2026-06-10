---
name: Phase 7 Wave 2 Batch 2 — M3/M4 implementation decisions
description: Key decisions and contract resolutions for KFS screen, Privacy Center, biometric step-up, and permission fixes
type: project
---

KFS (GAP-021): Screen at `src/screens/loans/KeyFactsStatementScreen.tsx` inserted BEFORE `LoanConsentScreen` in `LoanStack`. `RecordConsentRequest.kfsId` is now required — all calls in tests and production code must pass it. Endpoint changed to `/consents` (plural).

**Why:** RBI Digital Lending Guidelines mandate KFS before consent. Backend B8 contract requires kfsId in the consent payload.

**How to apply:** Any test or call site for `recordLoanConsent` must include `kfsId: string`. Endpoint is `/loans/applications/{id}/consents` not `/consent`.

Privacy Center (GAP-020): Screens at `src/screens/profile/{PrivacyCenter,MyConsents,DataExport,CorrectionRequest,MyCorrections,DpoContact}Screen.tsx`. All registered in `MoreStack` and accessible from `MoreScreen` via "Privacy & Data" menu item. DPO contact from `src/config/privacyContact.ts` (static, Wave 3 TODO for API). Data correction path is SINGULAR `/data-correction`.

Permission perimeter (M3c): Removed `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `RECEIVE_SMS`, `READ_SMS` from `app.json` Android permissions. Only `CAMERA` retained.

**Why:** These permissions were not used by the app (Firebase Auth handles OTP server-side) and violated the principle of least privilege.

Biometric step-up (M4): `useBiometricGate` hook at `src/hooks/useBiometricGate.ts` centralises all biometric logic. Integrated into `GstApprovalScreen`, `UserApprovalScreen`, `LoanConsentScreen`, `ProfileScreen` (account deletion). Real-device verification deferred until M1 EAS builds.
