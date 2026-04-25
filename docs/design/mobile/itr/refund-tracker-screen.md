# Mobile — RefundTrackerScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25
> Scope note: refund-status data is mock for MVP (real IT Portal integration deferred). UX assumes status updates flow into `itr.refund_status_log`.

---

## Purpose

After verification, if the filing has a refund due, this screen tracks the refund through 5 lifecycle stages. Surfaces ETA and offers a grievance escalation path if delayed.

## User Goal

"Where's my refund? When will it hit my account?"

---

## Lifecycle stages

`NOT_DETERMINED` → `DETERMINED` → `DISPATCHED` → `CREDITED` (terminal happy)
Branches: `FAILED`, `ADJUSTED` (against outstanding tax demand)

---

## Layout

```
┌─ Header  [back]  "Refund tracker"  ───────────────┐
│  AmountCard                                       │
│   "Refund due ₹6,200"                             │
│   sub: "ITR-2 · AY 2026-27 · Ack #ABC123"         │
│  ─────────────────────────────────────────────── │
│  StatusTimeline (vertical, 4 nodes)               │
│   ● Not determined    25 Apr · ✓                  │
│   ● Determined        02 May · ✓                  │
│   ● Dispatched        ETA: 12 May · in progress   │
│   ○ Credited          Pending                     │
│  ─────────────────────────────────────────────── │
│  StatusCard (current state, expanded)             │
│   "Your refund has been determined."              │
│   "Expected to credit by 12 May 2026."            │
│   small icon + text  "Last update: 02 May 09:14"  │
│  ─────────────────────────────────────────────── │
│  BankAccountCard                                  │
│   "Refund will be credited to"                    │
│   "HDFC Bank · ****1234"                          │
│   linkBtn  [Update bank account]                  │
│  ─────────────────────────────────────────────── │
│  GrievanceFooter (visible only if delayed)        │
│   "Refund taking longer than expected?"           │
│   [Raise grievance →]                             │
└───────────────────────────────────────────────────┘
```

---

## StatusTimeline

- Vertical line on the left, 24pt diameter dots aligned.
- Completed: filled `color.success.500` with white check.
- Current/in-progress: filled `color.brand.500` with pulse animation (1.4s loop).
- Pending: outlined ring `color.neutral.300`.
- Failed: filled `color.error.500` with white "X".
- Right of each dot: stage label (top) + date or status (bottom small text).

---

## StatusCard variants

| Status | Heading | Body |
|--------|---------|------|
| NOT_DETERMINED | "We're waiting for the IT department to assess." | "Refunds are usually determined within 14 days of e-verification." |
| DETERMINED | "Your refund has been determined." | "Expected to credit by {eta}." |
| DISPATCHED | "Refund is on its way to your bank." | "Should reach your account within 2–4 working days." |
| CREDITED | "Refund credited successfully." | "₹{amount} credited to {bank} on {date}." (variant=success card) |
| FAILED | "Refund failed." | "Reason: {reason}. We've notified your CA. They'll reach out shortly." (variant=error) |
| ADJUSTED | "Refund adjusted against tax demand." | "₹{adjusted} of ₹{original} was used to settle outstanding demand." (variant=warning) |

---

## ETA logic

- `NOT_DETERMINED`: ETA = `e_verified_at + 14 d`.
- `DETERMINED`: ETA = backend-provided `eta_credited_on`.
- `DISPATCHED`: ETA = backend-provided `eta_credited_on` (typically dispatch + 4d).
- If `today > eta`, switch eta line to red "Delayed by {n} days" and reveal GrievanceFooter.

---

## GrievanceFooter

- Visible only when refund is delayed > 7 days past ETA OR status is FAILED.
- Tap → opens `RaiseGrievanceModal` (new component pattern; mirrors notice-detail conversation pattern):
  - Pre-filled subject "Refund delay — Ack #{ack}".
  - Free-text body.
  - Submits → `POST /itr/filings/{id}/grievance` (creates a notification/chat thread to CA).

---

## States

- **Loading** — Skeleton timeline + amount card.
- **No refund** (filing payable, not refund) — Replace screen body with empty state: "No refund for this filing. {Tax payable: ₹X} was paid at filing." Provide "View payment receipt" link.
- **Mock data warning (MVP)** — Subtle dev-only banner (gated by `__DEV__`) "Refund data is simulated for MVP."
- **Refresh** — Pull-to-refresh refetches latest log entries.
- **Error** — Replace body with retry state.

---

## i18n keys

```
itr.refund.title
itr.refund.amountCard.heading  ("Refund due {amount}")
itr.refund.amountCard.sub  ("{form} · AY {ay} · Ack #{ack}")
itr.refund.timeline.notDetermined / .determined / .dispatched / .credited / .failed / .adjusted
itr.refund.statusCard.{state}.heading
itr.refund.statusCard.{state}.body
itr.refund.bank.heading / .updateCta
itr.refund.grievance.heading / .cta
itr.refund.grievance.modal.subjectPlaceholder / .bodyPlaceholder / .submit
itr.refund.empty.heading / .body / .viewReceipt
itr.refund.error.heading / .retry
itr.refund.delayed ("Delayed by {n} days")
```

---

## Accessibility

- StatusTimeline announces each stage with status verb ("Determined, completed", "Dispatched, in progress").
- Pulse animation respects `Reduce Motion` accessibility setting.
- Currency announced with INR unit in screen-reader output.
- BankAccountCard `accessibilityLabel="Refund will be credited to HDFC Bank account ending in 1234"`.
