---
name: task32-ims-inbox
description: GSTN IMS Inbox implementation (GAP-101, Board #32) — 3 routes, API client, 84 i18n keys, 44 tests; 963→1007 total tests
metadata:
  type: project
---

Board #32 (HIGH) — GSTN Invoice Management System Inbox, mandatory from 1 Apr 2026.

**Why:** Regulatory requirement (CGST circular 2025); taxpayers must accept/reject inward invoices before GSTR-2B generation (14th of following month). Deemed acceptance sweeps PENDING/PENDING_KEPT to ACCEPTED automatically.

**Files created:**
- `src/admin/src/lib/gstImsApi.ts` — full API client with Zod schemas + 10 helper functions (period formatting, date formatting, canAccept/canReject/canKeepPending state-machine helpers)
- `src/admin/src/pages/gst/ImsInboxPage.tsx` — main inbox page (list + actions + bulk + modals)
- `src/admin/src/pages/gst/ImsInvoiceDetailPage.tsx` — detail + action log
- `src/admin/src/pages/gst/Gstr1aPage.tsx` — GSTR-1A amendments list + create form
- `src/admin/src/__tests__/ImsInboxPage.test.tsx` — 44 component + schema + helper tests

**Files modified:**
- `src/admin/src/router.tsx` — 3 new routes: /gst/ims, /gst/ims/gstr1a, /gst/ims/:invoiceId (must be before /gst/:id)
- `src/admin/src/components/layout/Sidebar.tsx` — IMS Inbox nav item with `gst.ims.read` server permission gate
- `src/admin/src/i18n/en.json` — +84 keys (gst.ims.* and gst.gstr1a.*), total 1731
- `src/admin/src/i18n/hi.json` — +84 keys (Hindi translations)
- `src/admin/src/i18n/bn.json` — +84 keys (Bengali translations)

**Test results:** 1007 passed / 0 failed, 0 lint warnings, build successful.

**Key implementation decisions:**
- Optimistic accept (flip + reconcile); refetch-based reject (reason carries audit weight)
- Undo restores to PENDING_KEPT (no raw PENDING API transition — PENDING is sync-default only)
- Bulk capped at 100; eligibility filter runs client-side before bulk call
- Reject reason: optional server-side, client-enforced min 3 chars (per spec §0)
- UUID in test fixtures must be v4-compliant (e.g. `a0a0a0a0-0000-4000-8000-000000000001`) — Zod 4 strict UUID validation fails aaaaaaaa-0000... format
- Zod schemas cannot be tested via `vi.mock(importActual)` re-export — build local schema copies in tests for parse-correctness tests
- Banner has role="alert" (open window) and role="status" (past window) — avoid `getByRole('alert')` when both may be present; use text queries instead

**How to apply:** When building future IMS-adjacent features (GSTR-3B lock, deadline push, GSTIN context selector), reference gstImsApi.ts period helpers and the canAccept/canReject/canKeepPending state machine.
