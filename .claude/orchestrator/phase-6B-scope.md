# Phase 6B — GST Completion

> **Priority:** P0 (core revenue feature — User Journey K1 steps 8–11)
> **Duration:** 2 weeks
> **Depends on:** Phase 6A (AccountingService ledger exists for invoice-level reconciliation)
> **Can run in parallel with:** Phase 6C, 6D (once 6A done)
> **Source:** `phase-6-gap-analysis.md` §2.2, §5.9, §5.10, §8.2, Plan Module E

---

## Why this is P0

GstService is 50% wired today. Stubs remain on: list returns, list/create invoices, notices, e-invoice (IRN), e-way bill. Plan Module E defines GSTR-1 invoice-level submission, HSN/SAC lookup, deadline reminders, nil-return, ARN capture, notice tracker. Core revenue flow (user journey K1) is unfinished.

---

## Scope

### db-engineer (additive)

- `gst.invoices` + `gst.invoice_line_items` — if not present, add. Columns per GSTR-1 schema (invoice_no, invoice_date, customer_gstin, place_of_supply, HSN/SAC, qty, rate, taxable_value, CGST/SGST/IGST/CESS, total).
- `gst.hsn_sac_codes` — seed with CBIC official list; indexed on `code` + `description_tsvector` for search.
- `gst.notices` — id, org_id, gstin, notice_number, notice_date, notice_type, due_date, body_text, attachments_jsonb, status (RECEIVED/UNDER_REVIEW/RESPONDED/CLOSED), response_text, responded_at, responded_by.
- `gst.e_invoice_irn_log` — IRN number, ack_no, ack_date, QR code, request payload, response payload.
- `gst.e_way_bills` — EWB number, valid_from, valid_to, vehicle_no, transport_mode.
- `gst.nil_return_log` — org_id, return_period, filed_at.
- Indexes + RLS + DPDP cascade consistent with other schemas.

### backend-agent

1. **GstService stub reduction (convert 501 → mediator-wired handlers):**
   - `POST /gst/returns/{id}/invoices` + `GET /gst/returns/{id}/invoices` + `POST /gst/invoices/bulk-import`.
   - `GET /gst/notices` + `POST /gst/notices` + `POST /gst/notices/{id}/respond`.
   - `POST /gst/e-invoices` (IRN generation).
   - `POST /gst/e-way-bills`.
   - `POST /gst/returns/nil` (nil-return filing).
   - `GET /gst/hsn-sac/search?q=`.
2. **GSTN Adapter pattern:**
   - `IGstnApiClient` interface + `MockGstnApiClient` (default) + `ProductionGstnApiClient` (feature-flagged, wired when sandbox creds ready).
   - All GSTN calls async, retry w/ exponential backoff, audit log every request/response.
3. **IRP Adapter** (e-invoicing — turnover > ₹5 Cr threshold):
   - Similar pattern: `IIrpClient` + Mock + Production.
   - Threshold check: if org.annual_turnover_cr <= 5 → short-circuit "not applicable" response.
4. **EWB Adapter** (e-way bill) — same.
5. **Hangfire deadline reminders** (coordinate w/ 6E NotificationService):
   - Per-org per-return recurring job: D-7/D-3/D-1 before due date → `GstDeadlineApproachingEvent` → NotificationService fan-out.
   - Late-filing reminder: D+1 after due → event w/ HIGH priority.
6. **Notice tracker handlers:**
   - Upload notice (PDF) → GCS → notice record with `status=RECEIVED`.
   - Assign to CA → Callback event + Notification event.
7. **Auto-calculation engine confirmation** (plan E2): GSTR-3B summary auto-computed from invoices. Idempotent recompute endpoint.
8. All TODO markers in `backend/Services/FinanceService/Finance.WebApi/Endpoints/Gst/` resolved (target: 0 remaining).
9. Tests: unit ≥80%, integration with real Postgres.

### ui-ux-agent (docs/design/)

1. GST Notice Tracker (admin) — list + detail + response composer.
2. Callback queue integration for notices (link to 6E).
3. E-Invoice/EWB status views.
4. Mobile GST Notice Inbox screen spec.
5. Mobile Nil-Return confirm screen spec.

### frontend-dev (src/admin/)

1. `src/admin/src/pages/gst/NoticeTrackerPage.tsx` — list notices, filter by status/GSTIN/due-date.
2. `src/admin/src/pages/gst/NoticeDetailPage.tsx` — view PDF, compose response, attach documents, trigger callback.
3. `GstReturnReviewPage` (already wired in 6A) — add Invoice Detail tab with invoice-level edit + HSN/SAC search.
4. `GstFilingQueuePage` — add "Notices due this week" widget.
5. Router + nav updates (role-gated stub, full RBAC in 6F).
6. API client `src/admin/src/lib/gstNoticeApi.ts` + extensions to existing `gstApi.ts`.
7. All text `t()` (en/hi/bn).

### mobile-dev (mobile/)

1. `GstNoticeInboxScreen` — list notices for org, badge count on dashboard.
2. `GstNoticeDetailScreen` — view + reply (reply goes to CA, not direct GSTN — human-in-the-loop).
3. `GstNilReturnScreen` — confirm + file (for zero-transaction months).
4. `GstDashboardScreen` additions: deadline countdown chips, "Request Callback" CTA (from 6E).
5. Deep-link from notification to NoticeDetailScreen.
6. Jest coverage.

### devops-engineer

- GSTN sandbox creds in Secret Manager (`gstn-client-id`, `gstn-client-secret`, `gstn-username-{gstin}`).
- IRP + EWB creds similarly.
- Feature flag `gst.production-apis.enabled` default=false (use mock adapter).
- Cloud Scheduler job: `gst-deadline-check` fires daily at 06:00 IST → Pub/Sub → GstService subscriber → evaluates all returns for pending deadlines.

### qa-web + qa-mobile + security-reviewer

- qa-web: invoice CRUD, notice tracker flow, nil-return flow, HSN/SAC search debounce.
- qa-mobile: notice inbox, deep-link, nil-return flow, deadline notification rendering.
- security-reviewer: GSTN creds never in logs; invoice PII scoping by org_id; notice attachment AuthZ (user can only download notices for their orgs).

---

## Exit Criteria

1. GSTR-3B end-to-end: user adds invoices → computed summary → admin reviews → submits → ARN stored.
2. GSTR-1 invoice-level end-to-end: user uploads invoices → validation → admin reviews → submits.
3. GST notice uploaded → CA sees in tracker → response recorded → audit trail visible.
4. Deadline: D-3 reminder fires for test org with test return due in 3 days (push + SMS + email via 6E).
5. Nil-return flow: user confirms → filed → ARN logged.
6. E-invoice (mock IRP): IRN returned + QR code rendered (when turnover > 5Cr).
7. EWB (mock): EWB number returned.
8. HSN/SAC search: typing "cement" returns top 10 matches within 300ms.
9. 0 TODO markers in GstService endpoints.
10. 0 501 responses from GstService.
11. Tests green.
12. Zero new Critical/High security findings.

---

## Dependencies & Risks

- **GSTN sandbox onboarding** (risk #2 in gap analysis) — weeks of lead time. Mock adapter must ship first.
- **Plan E2 auto-calculation correctness** — QA must include edge cases (inter-state IGST, reverse charge, ineligible ITC).
- **DPDP: GSTIN is PII** — log redaction, encrypted at rest already per SEC cluster.

---

## Owner Agents

1. db-engineer → backend-agent.
2. devops-engineer (creds + scheduler) parallel.
3. backend-agent → frontend-dev + mobile-dev.
4. ui-ux-agent parallel from day 1.
5. qa + security final gate.

---

*End of Phase 6B scope.*
