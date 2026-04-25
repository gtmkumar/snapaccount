# Phase 6A — OCR → Accounting Pipeline

> **Priority:** P0 (foundation sub-phase — unblocks 6B, 6C, 6D)
> **Duration:** 2 weeks
> **Depends on:** Phase 5 approved (done)
> **Runs in parallel with:** Phase 6E (Notifications + Callbacks)
> **Source:** `phase-6-gap-analysis.md` §8.1, §5.3

---

## Why this is sub-phase 0 of Phase 6

The single most important integration in the product: **"user takes a photo → dashboard updates."** Today, `GoogleDocumentAiService.cs` exists in `DocumentService.Infrastructure`, but the downstream chain (OCR result → structured entities → accounting ledger post → dashboard read) is broken. `AccountingService` is 100% stub (0 handlers, 6 endpoints returning 501). Every downstream feature (Dashboard, Reports, Loan Hub, GST return numbers) reads from Accounting. Without this sub-phase, no other Phase 6 sub-phase can claim "production-ready."

---

## Scope

### db-engineer (additive only — no destructive migrations)

- `accounting.ledger_entries` — double-entry journal (if not present in 003_accounting_schema.sql). Columns: `id uuid PK`, `org_id uuid NOT NULL`, `document_id uuid NULL`, `posted_at timestamptz`, `debit_account_id`, `credit_account_id`, `amount numeric(18,2)`, `currency char(3) default 'INR'`, `narration text`, `fy_year int NOT NULL`, `period_month int`, `source enum (OCR, MANUAL, IMPORT, SYSTEM)`, standard audit cols.
- `accounting.chart_of_accounts` — if not present. Seed with default COA (Indian standard: Assets 1xxx, Liabilities 2xxx, Equity 3xxx, Income 4xxx, Expense 5xxx).
- `accounting.posting_audit` — every auto-post with before/after + confidence + reviewer_id.
- `accounting.fiscal_year_close` — close status per FY.
- `document.ocr_results` extension — if `extracted_entities jsonb` column missing on existing `document.documents`, add it.
- Indexes on `(org_id, fy_year, period_month)`, `(document_id)`, `(posted_at)`.
- RLS on ledger_entries by `org_id`.

**Out of scope:** any drop/rename/destructive migration. Everything additive.

### backend-agent

1. **AccountingService full build** (`backend/Services/AccountingService/`):
   - Domain: `LedgerEntry`, `ChartOfAccounts`, `JournalBatch`, `FiscalYear`, `TrialBalance` VO.
   - Application: Commands (PostJournalBatch, PostFromOcr, ReviewPosting, ReversePosting, CloseFiscalYear) + Queries (GetTrialBalance, GetProfitAndLoss, GetBalanceSheet, GetCashFlow, GetTaxLiability, GetLedgerByAccount).
   - Validators (FluentValidation), Handlers, Pipeline behaviors already inherited from Shared.
   - Invariants: debit_total == credit_total per batch; `Result<T>` failure on mismatch.
   - Infrastructure: `AccountingDbContext`, repositories, `AccountingPostingService` (consumes OCR callback events from Pub/Sub).
   - API endpoints wired to mediator: `POST /accounting/journal-entries`, `GET /accounting/trial-balance`, `GET /accounting/reports/{type}`, `POST /accounting/fiscal-year/close`.
2. **DocumentService OCR-callback handler:**
   - Subscribe to Pub/Sub `ocr-results.completed` topic.
   - Parse Document AI response → `ExtractedInvoiceDto` (vendor, GSTIN, date, line items, tax, total).
   - Publish `accounting.post-requested` event → AccountingService handler auto-posts with `source=OCR` and `status=PENDING_REVIEW`.
   - Clear all `// TODO` markers in `DocumentService.Api/Endpoints/*.cs` related to OCR result handling.
3. **GstService stub reduction:**
   - Convert `list returns`, `list invoices`, `create invoice` from 501 → real handlers reading `gst.invoices` + `accounting.ledger_entries` joined views.
   - Remove 3 of the 6 TODO markers in GST endpoints.
4. **Tests:** xUnit unit tests (>=80% handler coverage) + integration tests hitting real Postgres (per CLAUDE.md: no mocked DB in integration tests).

### ui-ux-agent

- Confirm `GstReturnReviewPage` design already covers ARN capture + audit-trail view; if gaps, produce Stitch design additions under `docs/design/admin/gst-return-review.md`.
- Confirm `CameraScreen` mobile flow covers queue/optimistic state. Produce design-system note on "Processing…" badge + retry affordance.

### frontend-dev (src/admin/)

- Wire `GstReturnReviewPage.tsx` to real GST API (remove mock data). API client function in `src/admin/src/lib/gstApi.ts`. TanStack Query hook. ARN submission flow. Audit-trail panel reads from backend audit endpoint.
- Add global toast primitive `src/admin/src/ui/Toast.tsx` if not already present (prerequisite for mutation feedback). Only the primitive — page-wide adoption is Phase 6F.
- No other page changes this sub-phase.

### mobile-dev (mobile/)

- `CameraScreen`: wire to `POST /documents/upload` + follow-up `POST /documents/{id}/ocr/request`. On capture, enqueue locally (AsyncStorage-backed queue for UI state only — not tokens), show optimistic card in `DocumentListScreen` with status=QUEUED, then UPLOADING → PROCESSING → READY on server events.
- `FinancialReportsListScreen`: wire to new `GET /accounting/reports/*` endpoints. Loading + empty + error states.
- SecureStore for tokens only (never for queue metadata per CLAUDE.md).
- Jest + component tests updated.

### devops-engineer

- Verify Pub/Sub topic `ocr-results.completed` exists in the terraform/gcloud scripts; add if missing.
- Verify AccountingService is registered in `backend/AppHost/Program.cs` Aspire orchestration with DB ref + Pub/Sub ref.
- No CI/CD changes this sub-phase unless AccountingService needs a new Cloud Run service definition.

### qa-web + qa-mobile + security-reviewer (parallel at sub-phase close)

- qa-web: regression on admin; new tests for GstReturnReviewPage wire-up, TrialBalance/P&L views if admin surfaces any, Accounting endpoint contract tests.
- qa-mobile: CameraScreen full flow (iOS + Android), FinancialReportsListScreen, regression.
- security-reviewer: review new AccountingService for AuthN/AuthZ (org_id scoping on every query), DPDP cascade (new tables must respect right-to-erasure), Pub/Sub message AuthN, no PII in logs.

---

## Exit Criteria

1. User takes photo on mobile → `DocumentListScreen` shows QUEUED → UPLOADING → PROCESSING → READY within 30s on good network.
2. Admin reviews document in `DocumentReviewPage`, approves extraction; within 5s AccountingService posts journal entry with `source=OCR`, `status=PENDING_REVIEW`.
3. `GET /accounting/reports/trial-balance?fyYear=2026` returns balanced trial balance (debits == credits).
4. `DashboardPage` admin view reflects the new ledger entry in the "Documents Processed" + Revenue/Expense tiles.
5. `GstReturnReviewPage` shows live GST data (no mock), ARN capture persists, audit trail visible.
6. All AccountingService endpoints return real data — zero 501 responses.
7. GstService TODO count: ≤3 (down from 6).
8. Tests: xUnit ≥80% on AccountingService; frontend vitest green; mobile jest green.
9. Zero new Critical/High security findings.
10. No files edited outside agent ownership boundaries.

---

## Dependencies & Risks

- **GSTN sandbox access** — not needed for 6A (real GSTN comes in 6B). Use mock adapter for any GST calls referenced here.
- **Accounting schema** — confirm `database/migrations/003_accounting_schema.sql` matches what backend-agent needs; coordinate early.
- **Pub/Sub subscriber reliability** — at-least-once delivery; AccountingService handlers MUST be idempotent (dedupe by `document_id + extracted_payload_hash`).
- **Fiscal year edge case** — ledger entry dated 2026-03-31 23:59 vs FY mapping — enforce IST and FY = Apr–Mar per plan L.
- **Do not mock DB in integration tests.** Per CLAUDE.md/orchestrator feedback memory — real Postgres via testcontainers or docker-compose.

---

## Owner Agents (in execution order)

1. db-engineer (migrations) → blocks backend-agent.
2. backend-agent (handlers + OCR callback wiring) → blocks frontend-dev + mobile-dev.
3. ui-ux-agent (design confirmations) → can run parallel to backend-agent.
4. frontend-dev + mobile-dev (parallel).
5. devops-engineer (Pub/Sub + Aspire verification) — can run parallel after backend-agent.
6. qa-web + qa-mobile + security-reviewer (parallel, final gate).
7. orchestrator approval gate → hand off to Phase 6B.

---

*End of Phase 6A scope.*
