---
name: project_gap_wave2
description: Admin gap-wave-2 (task #21) completion + the backend endpoints still missing that block full closure of several admin screens
metadata:
  type: project
---

Task #21 (branch `2026-07-05-full-verification`, 2026-07-05) closed the delegable parts of CG-9/12/13/15 + P-33/34/36/37/39. 1128 vitest / 0 lint / build clean, i18n parity 2726. Not committed. Full per-item detail in `.claude/orchestrator/bug-log.md` ("Admin gap wave 2" section).

**Why:** these items each had a real-contract deliverable plus one or more sub-parts with NO backend endpoint. I shipped the deliverable and flagged the rest rather than fabricating.

**How to apply — backend endpoints still MISSING (don't re-attempt client-side; route to backend):**
- P-37: notice-scoped org-list endpoint reachable by CA/GST-reviewer roles (or GSTIN→org resolution). `GET /auth/admin/organizations` is `platform.orgs.read` only; `/gst/notices` is `menu.gst_notices.view`. Also `POST /gst/notices` has no attachment field.
- P-34: loan-document verify/reject/download endpoints; disbursement date/proof fields (`POST .../disbursement` only takes `{disbursedAmount, bankReferenceNo}`).
- P-39: mark-filed ITR-V object-key + filed-on-date (`POST /itr/filings/{id}/mark-filed` only takes `{acknowledgementNumber}`).
- CG-13: chat-attachment upload endpoint; thread archive. CG-12: thread archive. (chat only has resolve/escalate/reopen.)
- CG-9: return-invoice PUT/DELETE (`POST /gst/returns/{id}/invoices` exists for add only).
- P-33: create-loan-application-on-behalf-of-org (`POST /loans/applications` has no orgId param).
- CG-15: per-org role-catalog endpoint for a platform admin viewing another org (`GET /auth/org/roles` is caller-org-scoped).

See [[reference_admin_infra_facts]] for the reusable client-side facts discovered here.
