---
name: project-live-sweep-2026-06-11
description: Live admin web sweep findings 2026-06-11: 16 FAIL/46, 3 EF mismatch root cause patterns, RBAC wrong HTTP codes
type: project
---

Live web sweep 2026-06-11 on branch 2026-06-10-s5t4 found 16 endpoint failures out of 46 tested.

Root cause patterns (all backend-agent owned):

1. EF table name mismatches: subscription (plans/invoices table names wrong), report (report_jobs doesn't exist), accounting (journal_batches doesn't exist)

2. EF column name mismatches: gst.notices has org_id but EF maps OrganizationId to organization_id; notification.dlq_items has different column names than entity properties

3. EF column type mismatch: loan.partner_banks.api_config_encrypted is jsonb in DB but EF config declares bytea

Additional findings:
- RBAC: permission denial returns HTTP 400 (for /admin/users) and HTTP 500 (for /admin/staff, /admin/team-members) instead of 403; permission name leaked in 500 body
- ITR assessee_profiles table missing organization_id column; causes all ITR filings queries to 500
- Document review Approve/Reject permanently disabled (TODO B15 — no backend endpoints)
- i18n key common.previous missing from en.json (OrganizationDetailPage)
- GET /auth/me/data-export intentional 404 when no export job exists (by design)
- GET /auth/team/invites returns 200 empty (no pending invites in seed data)
- All 5 dashboard-stats endpoints return 200 — dashboard page will load successfully

**Why:** Sweep commissioned 2026-06-11 as task #20 QA-LIVE-WEB; branch 2026-06-10-s5t4.

**How to apply:** When reviewing backend 500s in these services, check EF config vs actual DB schema first. Known-good services: Auth, Documents, GST (subset), Chat, Notifications (inbox/prefs only), Callbacks, ITR (admin endpoints only).
