# Phase 7 Tasks — mobile-dev

> Ownership: `mobile/` only. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.
> Rules: SecureStore for sensitive data, all strings through `t()` (en/hi/bn parity), 44×44pt touch targets, jest tests per screen, visual QA on 375px + 430px.

## HIGH priority

### M1 — Production app hardening (GAP-001 / GAP-006)
- Remove `mobile/ios/SnapAccount/GoogleService-Info.plist` from the repo; inject via EAS secrets/build config (coordinate with devops on rotation — the committed config is considered compromised).
- Stand up EAS dev-client + production build profiles; re-enable `@react-native-firebase/*` plugins in `app.json`; replace the mock `mobile/src/lib/firebase.ts` with real Firebase auth for native builds (keep mock only for Expo Go dev path, clearly gated).
- Replace placeholder SHA-256 hashes in `mobile/src/lib/pinnedHttpClient.ts` with real pins (leaf + backup intermediate; document rotation plan).
- Acceptance: EAS build installs on physical devices; real phone-OTP login works; FCM token registers (with qa-mobile).

### M2 — Token rotation after onboarding (GAP-007 / BUG-5)
- After business wizard completes, consume backend B4's fresh org-scoped tokens (rotate in authStore) so Team invite works without re-login.
- Acceptance: live-smoke BUG-5 repro passes.

### M3 — RBI / DPDP user-facing compliance (GAP-020 / GAP-021)
- Key Facts Statement screen before LoanConsentScreen rendering the server-signed KFS (backend B8): APR, fees, tenure, repayment schedule; acknowledgement required; KFS id passed into consent submission.
- Privacy Center screen group under More: my consents (view + one-tap withdraw, backend B7), request data export, request correction, delete account (existing) — plus published DPO/grievance-officer contact.
- Verify app permission perimeter: only camera/notifications (+ location if used) — no contacts/SMS/call-log/storage-wide permissions in `app.json`/manifests.

## MEDIUM priority

### M4 — Biometric step-up auth (GAP-063)
- Install `expo-local-authentication` (needs M1 EAS build); replace Alert-fallback gates with real biometrics + device-PIN fallback on: GST ApprovalScreen, ITR UserApprovalScreen, LoanConsentScreen (2-stage), account deletion.

### M5 — Remove "Coming Soon" stubs in front of real features (GAP-060)
- `ITRDashboardScreen` quick actions → navigate to the implemented `ItrStack` routes (checklist, regime comparison, refund tracker, notices).
- `GstDashboardScreen`: route GSTR-1/calendar entries to implemented flows or hide them.
- `ProfileScreen`: wire Billing → new Subscription screen (M6), Help → Chat/Callback, Edit Business → wizard edit mode (or hide).
- Delete unwired duplicates `mobile/src/screens/loan/{LoanHubScreen,LoanEligibilityScreen,LoanStatusScreen}.tsx` (keep `EMICalculatorScreen` — it is wired).

### M6 — Subscription & Billing screen (GAP-035)
- New `mobile/src/api/subscription.ts` + screen: current plan, usage, upgrade via Razorpay checkout (backend B9), invoice list. Spec from ui-ux U3.

### M7 — i18n extraction (GAP-061)
- Tab labels in `AppNavigator`, `MoreScreen` items, `ITRDashboardScreen` headers, `Alert.alert` literals → i18n keys (maintain en/hi/bn parity); add lint rule for JSX string literals.

### M8 — Org switcher verification (GAP-045)
- Verify/implement multi-organization switching in More/Profile with per-org token context (depends M2 mechanics).

### M9 — Device integrity attestation (GAP-064)
- Play Integrity (Android) / App Attest (iOS) token on login and high-risk calls; soft-fail telemetry first (backend B-side verification to follow).

## LOW priority

### M10 — A11y + QA fixlist (GAP-062)
- P6-QA-MOBILE-04/05 (GST notice tabs ≥44pt + accessibilityLabel), -08/-09 (loan sort chips ≥44pt, back buttons 44×44), -10 (CelebrationOverlay server fire-guard via `POST /notifications/celebrations/{kind}/fire`), -11 (fix `??` double-callback), LoanPackagePreview jest matcher fixes, "NaN documents" count bug, confirm DevicesScreen supersedes BUG-MOB-006.

### M11 — Invite deep-link resume (GAP-065)
- Persist pending invite token through auth and auto-resume acceptance post-login.

### M12 — Misc deferred
- Inline PDF viewing via `react-native-pdf` (PdfViewerMobile TODO); ChatList swipe gestures; full NetworkSheet (NetworkQualityChip); full dark-mode pass on pre-6F screens via `useTheme()`; clean up pre-existing TS errors in auth screens (Firebase types) once M1 lands real Firebase types.
