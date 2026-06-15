---
name: Wave 7 feature specs (board #45)
description: Where the Wave 7 feature UI specs live and the load-bearing design decisions for CA booking, notification templates, chat bookmarks/export, old-device approval, GST notice taxonomy
metadata:
  type: project
---

Wave 7 implementation-ready UI specs at `docs/design/wave7-feature-specs.md` (one doc, 5 sections). New components appended to `component-library.md` → "Wave 7 Additions (2026-06-11)". Built from gap defs (gap-analysis-2026-06-10 §GAP-031/037/043/047 + delta §GAP-108) while two backend agents built 7A/7B contracts concurrently — every contract-dependent field is tagged `[confirm 7A]` / `[confirm 7B]` to reconcile against `docs/api/endpoints.md` Wave 7A/7B.

**Why:** board #45; frontend-dev + mobile-dev implement directly. Wave 7A ≈ ChatService/Auth (CA booking, chat bookmarks/export, old-device approval); Wave 7B ≈ Notification + GST (template manager, notice taxonomy).

**Load-bearing decisions (reuse, don't re-derive):**
- **NO new tokens introduced** — all Wave 7 components compose existing primitives + tokens.json v2.1.0. Map-only entries (Appointment StatusBadge, NoticeFormTypeBadge form-code map) are semantic re-uses, same rule as IMS/MCA maps in [[project_ims_inbox_spec]].
- **CA booking (GAP-031):** mobile entry from Chat/CA hub; ≥2h reschedule/cancel cutoff is shown EXPLICITLY (open: "until {{cutoffTime}}"; ≤2h: disabled + warning banner explaining why + "Message CA" — never silently disable). Reminders 30/5min are expectation-only copy. 1–5★ `StarRatingInput` (`accessibilityRole="adjustable"`). All slot times IST with explicit caption. Admin = rule-based `AvailabilityRuleEditor` + calendar/list appts page.
- **Notification templates (GAP-037):** admin-only; `DualPaneEditor` (editor left / live preview right). 26-event catalog as filtered DataTable (event×channel×lang). `TemplateSourceChip` custom/default drives "falls back to code default" banner; `TemplateDiffView` reuses 6D `DiffViewer`. SMS branch carries DLT template-ID + segment counter (TRAI). Test-send uses unsaved draft. Template CONTENT is data (per-lang authored), only chrome via t().
- **Chat bookmarks/export (GAP-043):** mobile only — ADMIN HAS NOTHING (recorded intentionally). Long-press bookmark must ALSO have an accessible custom action (not long-press-only). Export = async ReportService job → OS share sheet; design supports sync OR job.
- **Old-device approval (GAP-047):** OLD device `DeviceApprovalScreen` (focus-trapped, DeviceMetaCard, 10-min `CountdownCard`, Approve/Deny labeled w/ consequence, "Approximate location" labeled as approx). NEW device waiting/denied via `ResultScreen`. **Soft-launch notify-only mode** = info `Alert Banner` only, no gate/countdown — branch on a backend/remote-config flag, both paths ship together. Assisted-callback escape on waiting/denied (lost old device).
- **GST notice taxonomy (GAP-108):** `NoticeFormTypeBadge` (form code VERBATIM: ASMT-10/DRC-01/01A/01B/01C/ADT-01 + plain-meaning tooltip) is DISTINCT from Phase 6B Notice `StatusBadge` (lifecycle) — both render on a row. Reuse `DueDateChip` for statutory deadlines (≤3 err/4–7 warn/>7 neutral/overdue err-filled). `GstatStageChip`+`StatusTimeline` for appeal ladder; backlog-appeal hard flag "file by 30/06/2026". DRC-01B/01C = `accent` (signals pre-filing `SimulatorEntryBanner` on reconciliation page; result reuses ItcMismatchPage). Mobile = read-only parity, NO reply/simulate (route to admin/CA, no Coming-Soon stub).

**How to apply:** any future Wave-7-area UI extends this spec. Keep form codes verbatim, the ≥2h-cutoff-explicit rule, the soft-launch branch, DueDateChip reuse, and the no-new-tokens discipline. a11y rules in [[project_a11y_and_token_canon]] and Indic rules in [[project_indic_typography]] are binding on every screen here.
