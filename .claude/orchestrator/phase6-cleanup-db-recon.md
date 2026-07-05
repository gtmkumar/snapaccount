# Phase 6 — DB cleanup recon (verified against live dev DB + code, 2026-07-05)

Verified against running dev Postgres (`snapaccount`) and a code grep of `backend/**/*.cs`.
This file is the authoritative drop-list for migration `110_drop_unused_tables.sql`.

## SAFE TO DROP — 7 orphan schemas (DROP SCHEMA ... CASCADE)
All 43 tables empty (0 rows total), **zero external inbound FKs**, zero code refs.

- `advisory` (4 tables)
- `compliance` (15)
- `fema` (3)
- `payroll` (7)
- `registration` (8)
- `valuation` (2)
- `vcfo` (4)

## Superseded first-draft tables — verify each before drop
| Table | Rows | Code ref? | Verdict |
|-------|------|-----------|---------|
| `gst.gst_invoice` | 0 | none | DROP |
| `gst.e_way_bill` | 0 | none | DROP |
| `chat.conversation` | 0 | none (code uses `messages`/`message_bookmarks`) | DROP |
| `chat.message` | 0 | none (singular; live table is `messages`) | DROP |
| `subscription.payment` | 0 | verify | DROP (pending final grep) |
| `subscription.usage_records` | 0 | verify | DROP (pending final grep) |
| `document.document_archive` | 0 | verify | DROP (pending final grep) |
| `document.document_share` | 0 | verify | DROP (pending final grep) |

## ⚠️ CORRECTION vs plan — DO NOT DROP
- **`document.document_tag`** (2 rows) — plan listed it for drop, but it is a LIVE feature:
  full CRUD (`AddDocumentTag`/`RemoveDocumentTag`/`GetDocumentTags` commands+queries),
  entity `DocumentTag.cs`, `DocumentDbContext`, `IDocumentDbContext`, endpoint `Documents.cs`.
  **KEEP.**

## Explicit KEEPS (confirmed in use even though some are empty)
- `gst.e_invoice_irn_log` (0 rows, code-referenced) — KEEP
- `loan.loan_application` (1 row; DPDP aggregator + KFS FK) — KEEP
- `accounting.journal_entry` (0 rows; JournalBatch maps here) — KEEP
- all plural canonical tables — KEEP

## Careful FK pair — `itr.tax_computation` → `itr.itr_return` + `itr.tax_regime`
- `itr.itr_return` (0 rows), `itr.tax_regime` (2 rows), `itr.tax_computation` (0 rows).
- No `class TaxRegime` / `ToTable("tax_regime")` EF entity found; but
  `TaxComputationConfiguration.cs` references `itr_return`. Before dropping `itr_return`/`tax_regime`,
  drop/redirect the FK constraints declared in `TaxComputationConfiguration.cs` in the SAME migration.
  Re-read that config in Phase 6 to confirm the constraint names.

## shared.* candidates — verify individually in Phase 6 (RLS/infra may touch)
`api_rate_limit`, `consent_record`, `data_deletion_request`, `system_configuration`, `feature_flag`.

## Dead admin frontend files to remove (discovered during CG wave, 2026-07-05)
`rm` was blocked in fix-fe-rbac's sandbox — remove these in the Phase 6 commit once src/admin is free:
- `src/admin/src/pages/settings/sections/PartnerBanksSettings.tsx` — divergent placeholder, now fully unreferenced (CG-7 collapsed the Settings tab to redirect to the real `/loans/partner-banks` page).
- dead `getPartnerBanksLite` export in `src/admin/src/lib/loanApi.ts` — orphaned after CG-7.
Verify still-unreferenced (grep) at cleanup time before deleting.

Orphaned i18n keys to prune (parity intact across en/hi/bn, harmless but dead — from CG-ANALYTICS removing the synthetic revenue sections): `analytics.revenue.momGrowth`, `analytics.revenue.cohort*`, `analytics.revenue.forecast*`, `analytics.revenue.razorpayFees`, `analytics.revenue.gstOnRevenue`, `analytics.revenue.paymentHealth` (+ adjacent synthetic-metric keys). Prune from all three locale files together at cleanup, keeping parity.

## NOTE — migration numbering  ⟶ UPDATED 2026-07-05
`110` = ACM role/permission reconcile. `111` = **CLAIMED** = `111_itr_assessee_profile_columns.sql` (db-engineer, task #25 — additive ITR assessee columns for BUG-ITR-ASSESSEE-MAPPING/AND-LIVE-07; applied + verified on live dev DB). Therefore the Phase-6 drop migration is now **`112_drop_unused_tables.sql`** (NOT 111). Highest existing after 111 lands = 111 → drop = 112.

## Verification gate before finalizing migration 111 (drops)
1. Final grep for each "DROP (pending final grep)" table name across backend + database/.
2. Fresh full migration replay 000→110 on scratch DB.
3. `dotnet test` (unit + integration inc. EfSmoke) green.
4. Live smoke of running stack.
