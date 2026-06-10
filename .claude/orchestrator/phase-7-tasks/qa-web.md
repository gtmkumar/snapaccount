# Phase 7 Tasks — qa-web

> Ownership: `tests/`, `src/admin/src/__tests__/`, `.claude/qa/`. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.
> Integration tests hit real Postgres (Testcontainers), never mocks.

## HIGH priority

### QW1 — DocumentService test coverage from zero (GAP-081)
- New `tests/unit/DocumentService` + `tests/integration/DocumentService`: upload validation (5MB, type allowlist), status state machine (UPLOADED→OCR_COMPLETE→IN_REVIEW→PROCESSED/REJECTED), signed-URL expiry, admin queue filters/pagination, RBAC on admin endpoints.

## MEDIUM priority

### QW2 — Callback KPI IDOR test (GAP-012 / P6-HANDOFF-04 acceptance condition)
- Integration test: org A user querying `/callbacks/kpi` cannot see org B rows (MV org-filter), plus assignments_log written on assignment.

### QW3 — Playwright E2E suite (GAP-080)
- `tests/e2e/` covering: admin login (local-auth) → document queue review → approve; GST return review → ARN capture; invite → accept → role enforcement; RBAC route-guard (403 page); settings 2FA enroll; callback lifecycle. Wire to CI after D2.

### QW4 — Integration re-run post PR #30 (GAP-082 adjacent)
- Re-run full integration matrix against current auth API shapes; fix BUG-RBAC-E2E-001 expectation (zero-UUID org seed) with backend; verify combined-run AuthApiTests pass after backend B24.

### QW5 — Regression sweep after Wave 1
- Re-run all admin suites after F1/F2 land (Document/ITC pages were mock-tested before); add tests for the new pages: Subscriber List, Invoice Mgmt, Tax Rate Config, Notification Templates, HSN/SAC Manager; add an i18n key-parity test (en/hi/bn).
