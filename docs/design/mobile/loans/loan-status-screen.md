# Mobile — LoanStatusScreen

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

Live tracker for an in-flight loan application. Shows the canonical status stepper, bank communication log, document re-request inbox (when bank asks for more), and approval/disbursal celebration moments. This is the deep-link target for FCM push notifications and SMS.

## User Goal

"Where is my loan right now? When can I expect a response? Tell me the moment anything changes."

---

## Layout

```
┌─ Header  [back]  "Loan status"  [more ⋯ ] ────────────────┐
│  HeroCard                                                  │
│   "{Bank} · {Product}"                                    │
│   "₹15,00,000 · 24 months · Working capital"              │
│   StatusBadge  "UNDER_REVIEW"                             │
│   "Submitted 25 Apr 2026 · Bank ref BNK-2026-12345"      │
│  ─────────────────────────────────────────────────────── │
│  StatusStepper (vertical)                                  │
│   ✓ DRAFT             — 24 Apr 2026 14:02 IST             │
│   ✓ SUBMITTED         — 25 Apr 2026 10:18 IST             │
│   ● UNDER_REVIEW      — 25 Apr 2026 11:04 IST   (pulse)   │
│   ○ APPROVED / REJECTED — pending                         │
│   ○ DISBURSED          — pending                          │
│  ─────────────────────────────────────────────────────── │
│  ETACountdownCard                                          │
│   "Typical response 3–7 business days"                    │
│   "Day 2 of 7" + progress bar                             │
│  ─────────────────────────────────────────────────────── │
│  Section "Bank communication"                              │
│   BankCommRow (received, 25 Apr 11:04)                    │
│    "Acknowledged. Under review by credit team."           │
│   BankCommRow (sent,     25 Apr 10:18)                    │
│    "Application package PKG-2026-04-2598 submitted"       │
│  ─────────────────────────────────────────────────────── │
│  Section "Documents requested"  (only if any pending)     │
│   DocRequestRow                                            │
│    "Bank asks: latest 3-month sales tax invoices"         │
│    "Due 30 Apr 2026"     [Upload now →]                   │
│  ─────────────────────────────────────────────────────── │
│  ActionRow                                                 │
│   [View package]  [Download PDF]  [Help / grievance]      │
└────────────────────────────────────────────────────────── ┘
```

---

## Status enum + Badge variant map

| Status | Variant | Icon | Stepper node state |
|---|---|---|---|
| DRAFT | neutral | edit-3 | completed (after submit) |
| SUBMITTED | info | send | completed |
| UNDER_REVIEW | info (pulse) | search | current (pulse anim) |
| DOCS_REQUESTED | warning | alert-circle | current (overlay) |
| APPROVED | success | check-circle | terminal-success |
| REJECTED | error | x-circle | terminal-fail |
| DISBURSED | success | indian-rupee | post-terminal |
| CLOSED | neutral | archive | post-terminal |

`StatusStepper` orientation: vertical, reuses Phase 6D vertical StatusTimeline primitive.

## Real-time updates

- SignalR (or push) listens for `LoanApplicationStatusChanged` events scoped to this app.
- On change: animate the new step into completed state, current step pulses, ETACountdownCard updates, new BankCommRow prepended with subtle highlight (1.5s).
- A11y: announce status change via `liveRegion='polite'`.

## Celebration triggers (feeds Phase 6F pattern)

- On `APPROVED`: full-screen celebration overlay slide-up:
  - Confetti (skipped if `prefersReducedMotion`).
  - Headline: "Loan approved!"
  - Subline: "{Bank} approved ₹{amount} at {rate}% p.a."
  - Primary CTA "View terms"; secondary "Continue to status".
  - Auto-dismiss after 6s if no input.
- On `DISBURSED`: identical pattern, copy:
  - Headline "Disbursed!"
  - Subline "₹{amount} credited to {acctMask} on {date}"
  - Confetti color `color.success.500`.
  - CTA "View payment proof" → opens disbursement PDF/UTR card.

## DOCS_REQUESTED handling

- DocRequestRow surfaces every doc the bank asks for.
- Tapping `Upload now` → CameraScreen with params `{ purpose: 'loan-bank-request', requestId, appId }`.
- After upload + acknowledgement from bank, status reverts to UNDER_REVIEW.
- Push notification copy: "Bank needs more docs from you. Tap to upload."

## REJECTED handling

- Banner card: "Application not approved" — neutral red, no celebration.
- Lists bank's stated reasons (if provided).
- ActionRow swaps to: `[View other banks]` (re-routes to LoanHubScreen filtered to other banks) + `[Help / grievance]`.

## States

- **Initial load** — skeleton stepper + 2 skeleton comm rows.
- **Empty comm log** — "No messages from bank yet." (only between SUBMITTED ack pending).
- **Network unreachable** — top toast "Live updates paused — pull to refresh." Manual pull works.
- **Multiple apps** — this screen always shows ONE application (route param `appId`); list page is only on Admin / Web. Mobile users access multiple apps via "My loans" submenu in main nav.

## Push deep-link contract

- FCM payload includes `data: { type: 'loan_status_change', appId, status }`.
- Tap → opens `LoanStatusScreen` with `appId`.
- If app cold-launched, deep-link queue routes through Phase 6E DeepLinkRouter.

## i18n keys

```
loan.status.title
loan.status.hero.amountTenurePurpose
loan.status.hero.submittedAt / .bankRef
loan.status.badge.{draft|submitted|underReview|docsRequested|approved|rejected|disbursed|closed}
loan.status.stepper.{draft|submitted|underReview|approvedRejected|disbursed}
loan.status.eta.title / .progress ("Day {n} of {total}")
loan.status.comms.title / .empty
loan.status.docs.requested.title / .due / .uploadNow
loan.status.action.viewPackage / .downloadPdf / .helpGrievance / .viewOtherBanks
loan.status.celebrate.approved.title / .body / .cta.viewTerms / .cta.continue
loan.status.celebrate.disbursed.title / .body / .cta.proof
loan.status.rejected.banner.title / .reasons
```

## Accessibility

- StatusStepper: each node `accessibilityRole="text"` w/ state; current node `accessibilityState={{busy:true}}`.
- BankCommRow: list semantics, latest first; date announced as readable date.
- Celebration overlay: focus moves to headline; respects `prefersReducedMotion` (no confetti, simple fade).
- Touch targets 44×44pt for action buttons.
- Color cues paired with icon + text in every variant.
- Live region for status change announcements.

## Telemetry

- `loan.status.viewed {appId, status}`, `loan.status.statusChanged {from, to}`, `loan.status.celebrationShown {kind}`, `loan.status.docRequest.uploadStart {requestId}`, `loan.status.grievance.opened`.
