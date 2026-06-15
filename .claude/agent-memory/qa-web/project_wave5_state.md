---
name: wave5-live-test-state
description: Wave 5 live web QA results (2026-06-11): GstService DOWN (Hangfire static API bug), 4 bugs filed, regression 11/12 services green
metadata:
  type: project
---

Wave 5 live web verification run on branch 2026-06-10-s5t4 (commit 18ce9b0), 2026-06-11. Re-verified same day after backend fixes.

**IMS Surface: ALL PASS after backend-agent fixes (2026-06-11)**

**FIXED bugs:**
- BUG-IMS-GSTSTART-001 (CRITICAL): Hangfire static API → fixed by moving RecurringJob.AddOrUpdate to app.Lifetime.ApplicationStarted.Register() in Program.cs
- BUG-IMS-DETAIL-002 + BUG-IMS-ACTION-003 (CRITICAL): GET detail + POST action returned 500 — root cause: W5-IMS-02 EF OnModelCreating order. GstDbContext called ApplyConfigurationsFromAssembly BEFORE base.OnModelCreating so BaseDbContext's GuidStringConverter (uuid provider) overwrote ImsInvoiceConfiguration's HasMaxLength(128) (varchar) setting. Fixed by swapping order: base first, then ApplyConfigurations.
- BUG-MCA-ETYPE-005 (HIGH): CLOSED — false positive. EditLogPage.tsx sends snake_case values; stale Vite HMR bundle showed old PascalCase code. Verify source before filing.

**Still open:**
- BUG-DASH-KB-004 (MEDIUM): Dashboard Tier3 tabs missing arrow-key keyboard navigation

**Re-verification results (IMS, 2026-06-11):**
- GET /gst/ims/summary → 200 (pending=12, deadline=2026-06-14, gstr2bGenerationPast=false)
- GET /gst/ims/invoices → 200 (12 items with status badges, PENDING/ACCEPTED/REJECTED)
- GET /gst/ims/invoices/{id} → 200 (tax breakdown + action log) ← was 500, now FIXED
- POST /gst/ims/invoices/{id}/action ACCEPTED → 200 (changed=true, gstnRef=MOCK) ← was 500, now FIXED
- POST /gst/ims/actions/bulk → 200 (3/3 changed, per-invoice results) ← was 500, now FIXED
- POST /gst/ims/sync → 200 (inserted/skipped)
- POST /gst/gstr1a → 201 (DRAFT amendment created from rejected invoice)
- GET /gst/gstr1a → 200 (amendments list)
- Deemed-acceptance banner: WARNING (3 days to 14-Jun deadline) ✓
- Frontend Vitest: 1022/1022 PASS (53 files; up from 1007) incl. 44 ImsInboxPage tests
- BUG-MCA-ETYPE-005: CLOSED (false positive — all entityType filters return 200)

**Port note:** After fix deployment, GstService auto-started on :5034 (Release build) instead of original :5104 (Debug). Check current port with `lsof -i -P -n | grep GstService`.

**Dev token for IMS endpoints:** Use `dev-superadmin-token` with `?organizationId=11111111-1111-1111-1111-111111111111` query param — IMS endpoints require organizationId in query (not from token claims).

**Accounting edit-log valid entityType values:** journal_entry, journal_entry_line, ledger_entry, account, ledger (all snake_case). Path requires no params for unfiltered list; fyYear format "YYYY-YY" e.g. "2025-26".

**Report:** .claude/qa/live-web-wave5-2026-06-11.md (includes Re-verification section)
