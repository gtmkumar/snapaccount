---
name: Phase 6C Loan Hub Completion
description: Phase 6C admin frontend complete — Loan Hub pages + 8 UI primitives + API clients + 92 new tests; key i18n and t() signature lessons
type: project
---

Phase 6C (Loan Hub) admin panel implementation complete. 411/411 tests passing (was 319 before phase).

**What was built:**
- `src/lib/loanApi.ts` — full Loan Service API client with 15+ Zod schemas (PartnerBankSchema, LoanApplicationSummarySchema, ConsentRecordSchema, StatusLogEntrySchema, BankCommMessageSchema, LoanKpiSchema, BankCommKpiSchema, LoanDocumentSchema, etc.)
- `src/lib/reportApi.ts` — ReportService API client with signed-URL handling
- `src/pages/loans/LoansListPage.tsx` — KpiStrip, filterable DataTable, bulk-assign modal, CSV export
- `src/pages/loans/LoanDetailPage.tsx` — 6-tab ARIA tablist (Application/Documents/Consents/Timeline/BankComms/Disbursement)
- `src/pages/loans/BankCommunicationsPage.tsx` — SplitView audit log with PayloadViewer
- `src/pages/loans/PartnerBanksSettingsPage.tsx` — CRUD with write-only secrets pattern
- 8 UI components: BankAdapterTypeBadge, BankCommStatusBadge, BankHealthBadge, ConsentAuditCard, PayloadViewer, ProductChipsEditor, LogoUploader, PdfViewerWebPackagePane (+ DisclaimerCard export)

**Why:** Phase 6C Loan Hub scope per orchestrator; backend 306/306 tests complete with 13+ endpoints.

**How to apply:**

Key lessons for future phases:

1. **Custom i18n — t(key, vars?) NOT t(key, fallbackString)**: The project uses `src/i18n/index.ts` exporting `t(key: string, vars?: Record<string, string|number>): string`. The second arg is ONLY for interpolation vars object. Never pass a string fallback as 2nd arg — TypeScript will error. Pattern: `t('admin.foo.bar', { name: value })` for interpolation, just `t('admin.foo.bar')` otherwise.

2. **Zod schema field names must match actual schema**: Always read the schema source before writing tests. Common mismatches found: `BANK_STATEMENT` vs `BANK_STMT`, `version` vs `consentVersion`, `logId` vs `id`, `changedAt` vs `timestamp`, `ip` vs `ipAddress`.

3. **BankComm channel values are lowercase**: `'email' | 'rest' | 'oauth'` (lowercase), not `'EMAIL'|'REST'|'OAUTH'`.

4. **Write-only security pattern**: `PartnerBankSchema` deliberately strips `api_config_encrypted`, `apiKey`, `clientSecret` from GET response. Confirmed Zod strips unknown fields — `api_config_encrypted` in parse input is correctly absent from output.

5. **MessageCircleCheck does not exist in lucide-react** — use `MessageCircle` instead.

6. **Pre-existing test TS errors** in `HsnSacTypeahead.test.tsx`, `ItrFilingDetailPage.test.tsx`, `NoticeDetailPage.test.tsx`, `CaTaxComputationPanelPage.test.tsx` — pre-date Phase 6C, do not block phase completion.

7. **Test files are excluded by `--skipLibCheck` pattern** — production TS check `npx tsc --noEmit --skipLibCheck | grep -v __tests__` shows zero errors while test files have pre-existing mock type mismatches.

8. **Route ordering**: `/loans/bank-communications` and `/loans/partner-banks` must appear BEFORE `/loans/:applicationId` in router.tsx to avoid React Router v7 matching the static paths as dynamic IDs.
