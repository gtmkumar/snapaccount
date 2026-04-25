---
name: Phase 6C Loan Hub Decisions
description: Key decisions, patterns, and contract gaps discovered during Phase 6C (Loan Hub) implementation
type: project
---

Phase 6C (Loan Hub) completed. 6 screens + 10 components + loans API client + 4 test files.

**Why:** Backend LoanService + EligibilityService were complete; Phase 6C wired the mobile side.

**Key architectural decisions:**

1. Alert-based biometric fallback on LoanConsentScreen and LoanPackagePreviewScreen — expo-local-authentication not installed per P6-HANDOFF-24. Will be replaced in Phase 6F.

2. 2-stage biometric on LoanPackagePreviewScreen: view-time gate (useEffect on mount) + submit-time gate (on confirm button press).

3. PdfViewerMobile is a fallback stub (react-native-pdf not installed) — uses Linking.openURL to open system browser. TODO: install react-native-pdf in Phase 6F.

4. PDF signed URLs must never be cached: `staleTime: 0, gcTime: 0` on getLoanPackageDownloadUrl query per P6-HANDOFF-20.

5. CONSENT_VERSION = '1.4' in LoanConsentScreen — bump this when consent text changes.

6. CelebrationOverlay 6s setTimeout causes Jest worker to not exit gracefully — suppress with `--forceExit`, not a real test failure.

7. LoanStatusScreen useEffect for celebration uses `[app?.status]` dep array with eslint-disable comment — intentional to avoid re-running on every app object reference change.

**API contract gap:** `/loans/eligibility` endpoint (POST) not in docs/api/endpoints.md. Implemented as `POST /loans/eligibility` based on LoanService backend code inspection. Report to orchestrator.

**Test baseline before Phase 6C:** 114 tests across 18 suites.
**Test baseline after Phase 6C:** 153 tests across 22 suites (+39 tests).

**Mock pattern required for screens that import named functions from api/loans.ts:**
```
jest.mock('../../src/api/loans', () => ({
  listLoanProducts: jest.fn(() => Promise.resolve(...)),
  ...
}));
```
This is in addition to the standard `jest.mock('../../src/lib/api', ...)` mock.

**FlatList async test pattern:** Content inside FlatList's ListHeaderComponent only renders after TanStack Query resolves — always use `findByText` (async) not `getByText` (sync) for such content.

**How to apply:** Future phases adding loan screens should follow same patterns. Phase 6F will replace Alert bio with expo-local-authentication and PdfViewerMobile stub with react-native-pdf.
