---
name: project-gap101-ims
description: GAP-101 GSTN IMS workflow implementation — 3 domain entities, 8 CQRS handlers, 8 API endpoints, 59 new tests; DDL handoff required for 3 tables
metadata:
  type: project
---

## GAP-101: GSTN IMS (Invoice Management System) — delivered 2026-06-11

**Regulatory context:** Mandatory from 1 Apr 2026. Taxpayers must accept/reject/keep-pending each inward invoice before GSTR-2B is generated. GSTR-3B Table 3 is hard-locked post-filing.

**Why:** Compliance failure = GST product unusable for regular filers; GSTR-2B ITC data silently wrong.

**How to apply:** This is the first regulatory mandate in GstService. Follow the same Mock+Production GSTN client split pattern for any future GSTN API additions.

### Entities created

- `gst.ImsInvoice` — inward invoice with state machine: PENDING → ACCEPTED/REJECTED/PENDING_KEPT → (deemed ACCEPTED)
- `gst.ImsActionLog` — append-only audit log (no FK cascade, 7-year retention)
- `gst.Gstr1aAmendment` — DRAFT/SUBMITTED/FILED, links to OriginalImsInvoiceId, stores payload as JSONB

### CQRS handlers

- `FetchImsInvoicesCommand` — upsert sync from GSTN IMS (idempotent by supplier+invoice+period)
- `ActOnImsInvoiceCommand` — single invoice action with idempotency + action log + GSTN submit
- `BulkActOnImsInvoicesCommand` — up to 100 invoices, per-invoice results, IDOR-scoped by org
- `ApplyDeemedAcceptanceCommand` — system Hangfire sweep, no permission required
- `ListImsInvoicesQuery` — paginated with period/status/supplier/search filters
- `GetImsInvoiceQuery` — full detail + action log history
- `GetImsSummaryQuery` — counts + GSTR-2B deadline (14th of following month)
- `CreateGstr1aAmendmentCommand` + `ListGstr1aAmendmentsQuery`

### API endpoints (8 new, all under /gst)

- GET /gst/ims/invoices (gst.ims.read) — 100 req/min
- GET /gst/ims/invoices/{id} (gst.ims.read) — 100 req/min
- POST /gst/ims/invoices/{id}/action (gst.ims.action) — 30 req/min
- POST /gst/ims/actions/bulk (gst.ims.action) — 30 req/min, max 100 invoices
- GET /gst/ims/summary (gst.ims.read) — 100 req/min
- POST /gst/ims/sync (gst.ims.sync) — 30 req/min
- POST /gst/gstr1a (gst.gstr1a.create) — 30 req/min
- GET /gst/gstr1a (gst.gstr1a.read) — 100 req/min

### New permissions (need DB seeding)

- gst.ims.read
- gst.ims.action
- gst.ims.sync
- gst.gstr1a.read
- gst.gstr1a.create

### IMS client pattern

- `IImsGstnClient` (Application/Interfaces) — same interface pattern as IGstnApiClient
- `MockImsGstnClient` — deterministic seeded (hash of gstin+period), 3-8 invoices, valid IGST/CGST split
- `ProductionImsGstnClient` — retry pattern (100ms/1s/5s), auth-token header, TODO creds from Secret Manager (GSTN_CLIENT_ID, GSTN_IMS_SESSION_TOKEN)
- Wired via GST_PRODUCTION_APIS_ENABLED env var in DI

### GSTR-3B Table 3 lock (verified 2026-06-11)

Backend has NO endpoint that mutates GSTR-3B Table 3 post-filing. `UpdateTotals()` on `GstReturn` entity is defined but never called by any command handler. Lock is purely a frontend concern — UI must render Table 3 read-only when status==FILED. NO 409 guard needed server-side.

TODO (GAP-101-3B-VERIFY): Verify "zero-mismatch 3B block" claim against primary GSTN advisory before adding any backend enforcement.

### DDL handoff required

3 new tables in gst schema — see DDL-handoff section of the June 2026-06-11 task report.
EF Smoke tests are SKIPPED with `[Fact(Skip="DDL-HANDOFF-IMS: ...")]` until db-engineer runs DDL.

### Test results

Before: 44 unit tests. After: 103 unit tests (59 new IMS tests).
- ImsInvoiceDomainTests: state machine, idempotency, deemed acceptance (24 tests)
- ImsValidatorTests: all 8 validators including child rules for bulk (28 tests)
- MockImsGstnClientTests: determinism, tax consistency, submit paths (12 tests — actually minus existing tests = from the 59 new)
