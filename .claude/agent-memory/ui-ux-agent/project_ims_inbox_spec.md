---
name: GSTN IMS inbox spec (GAP-101 / board #32)
description: Where the IMS inbox UI spec lives, its status-vocabulary/state-machine rules, and the reject-reason + undo + DueDateChip decisions
metadata:
  type: project
---

IMS (Invoice Management System) inbox UI spec — admin web + mobile — at `docs/design/ims-inbox-spec.md`. Regulatory-mandatory from 1 Apr 2026 (taxpayers accept/reject/keep-pending each supplier invoice before GSTR-2B on the 14th; pending = deemed accepted).

**Why:** GAP-101 / board #32 HIGH. Backend already shipped (`GstService.Api/Endpoints/GstIms.cs`, 8 endpoints; entity `ImsInvoice.cs`). frontend-dev + mobile-dev build directly from the spec.

**Load-bearing design decisions (reuse, don't re-derive):**
- EXACT status vocab (verbatim, never relabel in code): `PENDING` / `ACCEPTED` / `REJECTED` / `PENDING_KEPT`. GSTR-1A: `DRAFT`/`SUBMITTED`/`FILED`; types `B2B_AMENDMENT`/`B2BA`/`CDNR_AMENDMENT`/`CDNRA`.
- State machine mirrors server: ACCEPTED→REJECTED and REJECTED→ACCEPTED both 409 `ImsInvoice.InvalidTransition` → UI hides the illegal action, shows **"Fix via GSTR-1A"**. All actions idempotent.
- **Reject reason is OPTIONAL server-side** (`string? Reason`) but the spec makes it **client-required** (min 3 chars) — documented as a client rule so backend isn't asked for a 409 guard.
- Optimistic: Accept + Keep-pending; **refetch (no optimistic): Reject + all bulk**. 5s Undo on single actions = re-action to prior status; PENDING has no API transition *to* it, so undo lands on PENDING_KEPT ("Moved back to pending-kept").
- Deemed-acceptance is THE education element: warning banner + info sheet + per-row "Deemed" tag; clarify PENDING_KEPT is NOT a safe parking state (still swept).
- Bulk cap 100/request (GSTN limit); pre-flight eligibility filter to avoid per-item 409s.

**Component mapping:** no new primitives. Reused `DueDateChip` (the existing Phase-6B countdown composite — NOT a new "DeadlineChip") for days-until-deemed with IMS thresholds (≤3 error, 4–7 warning, >7 neutral, past=info "Deemed accepted"). StatusBadge IMS + GSTR-1A maps appended to `component-library.md` under "Phase 7 — GSTN IMS Additions". New compositions only: `ImsInvoiceCard` (mobile), `RejectReasonModal`, `Gstr1aCreateForm`.

**IA:** admin Sidebar→GST→"IMS Inbox" (`/gst/ims`, `/gst/ims/:id`, `/gst/ims/gstr1a`); mobile GST tab → entry card on `GstDashboardScreen` → `ImsInboxScreen`/`ImsInvoiceDetailScreen`/`Gstr1aAmendmentsScreen`. GST module accent = Violet `#7C3AED`. Perms: `gst.ims.read`/`gst.ims.action`/`gst.ims.sync`/`gst.gstr1a.read`/`gst.gstr1a.create`.

**How to apply:** any future GST/IMS UI work extends this spec; keep the status vocab verbatim, the 409→GSTR-1A pattern, and the DueDateChip reuse. a11y rules in `[[project_a11y_and_token_canon]]` are binding (composed SR labels, neutral[500]+ text, success[700] text, 44pt, focus-trapped reject modal).
