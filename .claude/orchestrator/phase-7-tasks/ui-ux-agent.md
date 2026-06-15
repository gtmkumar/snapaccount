# Phase 7 Tasks — ui-ux-agent

> Ownership: `docs/design/`. Extend the existing design system; do not replace prior artifacts. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.

## HIGH priority

### U1 — Key Facts Statement screen spec (GAP-021, mobile M3 / backend B8)
- `docs/design/mobile/loans/key-facts-statement-screen.md`: regulatory layout (APR prominent, total fees itemized, tenure, repayment schedule, cooling-off notice, grievance officer contact), acknowledgement interaction before consent, hi/bn typography considerations, 44pt targets.

### U2 — Privacy Center spec (GAP-020, mobile M3)
- `docs/design/mobile/privacy/privacy-center.md`: my-consents list (purpose, status, granted date, one-tap withdraw with confirm), data export request + status, correction request, account deletion entry, DPO/grievance contact display.

## MEDIUM priority

### U3 — Mobile Subscription & Billing screen spec (GAP-035, mobile M6)
- Current plan card, usage meters, plan comparison, Razorpay checkout handoff, invoice list, empty/error states.

### U4 — Admin config screens specs (GAP-022/037/038, frontend F7/F8/F9)
- Tax Rate Configuration (versioned, effective-dated, change preview + audit trail), Notification Template Manager (event×channel×language matrix editor, variable insertion, preview/test-send), HSN/SAC Manager (12k-row search/edit patterns).

### U5 — Appointments & video consultation flows (GAP-031, backend B18)
- Mobile: CA slot picker, booking confirmation, reschedule/cancel (≥2h rule), rating (1–5 stars), reminder touchpoints (30min/5min).
- Admin: video-call calendar view, CA availability management.
- Verify existing Document Review split-screen spec still matches the real OCR contract for frontend F1 (confidence color thresholds 80/50, correction capture); publish a delta spec if needed.
