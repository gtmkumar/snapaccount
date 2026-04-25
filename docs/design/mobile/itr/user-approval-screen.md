# Mobile — UserApprovalScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

The legal-quality consent gate before SnapAccount files the user's ITR on their behalf. Enforces three protections per scope risk #4:
1. **Scroll-to-bottom-before-approve** — user must scroll the disclaimer fully before the Approve button enables.
2. **Biometric re-auth** — on Approve tap, system biometrics (FaceID / TouchID / Android Biometric) gate the action.
3. **Clear filing disclaimer** — "you are filing this in your own name; SnapAccount and CA assist only."

## User Goal

"Make me read the legal stuff and confirm with my biometric so this can't happen by mistake."

---

## Layout

```
┌─ Header  [back]  "Approve & file"  ───────────────┐
│  HeroBanner (warning variant)                     │
│   icon + "You're about to file your ITR for       │
│           AY 2026-27"                              │
│  ─────────────────────────────────────────────── │
│  ScrollView (the legal copy)                       │
│    1. What you're authorizing                      │
│    2. Your responsibilities                        │
│    3. SnapAccount's role (technology + assistance)│
│    4. CA's role (advisory; not a substitute for   │
│       your knowledge)                              │
│    5. What happens after filing                    │
│    6. How to revoke / amend                        │
│   (~600–800 words, plain English; same hi/bn)     │
│  ─────────────────────────────────────────────── │
│  ChecklistCard (sticky at bottom of scroll)        │
│   ☐ I have reviewed the filing summary             │
│   ☐ I confirm the information is accurate          │
│   ☐ I understand my legal responsibility           │
│   (3 required checkboxes)                          │
│  ─────────────────────────────────────────────── │
│  StickyFooter                                     │
│   [Cancel]                              [Approve & File] │
│   (Approve button DISABLED until scroll-end + 3 checks) │
└───────────────────────────────────────────────────┘
```

---

## Scroll-to-bottom Gate

Implementation:
- ScrollView `onScroll` listener checks `contentOffset.y + layoutHeight ≥ contentSize.height − 8pt`.
- When reached, set `hasScrolledToEnd = true` (one-way; cannot reset).
- Show small inline cue near checkboxes "You've read the full disclaimer." once true (color.success.700).
- Approve button enabled iff `hasScrolledToEnd && allChecksTrue`.

UX nicety: a non-blocking ghost button bottom-right "Scroll to bottom" that smooth-scrolls; this is allowed (user still passes their eyes over the text by scrolling).

---

## Biometric Re-auth

On Approve tap:
1. Trigger `expo-local-authentication.authenticateAsync({ reason: t('itr.approval.biometricReason') })`.
2. On success → `POST /itr/filings/{id}/approve` with body `{ approvedAt, biometricVerified: true }`.
3. On cancel/fail → toast "Approval cancelled" or "Biometric failed" — Approve button stays enabled for retry.
4. If biometric not enrolled on device → fallback to PIN entry sheet (existing `PINInput` component).

Loading: Approve button enters spinner state; full-screen `LoadingOverlay` "Filing in progress…" appears for ~2–4 s while backend processes.

---

## Success → Filing Confirmation

On 200 OK navigate to a `FilingConfirmationScreen` (lightweight celebration screen):
- Large green check (96pt).
- "Filed successfully · Ack #{ack_number}".
- Two CTAs: `View summary` (returns to FilingSummaryScreen with state=filed) / `Done` (returns to ITR dashboard).
- Confetti animation (already exists in design system as `SuccessLottie`).

(This confirmation screen is documented inline here — not a separate spec — because it's a thin success state.)

---

## States

- **Default** — Approve disabled, scroll progress 0%.
- **Mid-scroll** — Approve disabled.
- **Scroll complete, checkboxes incomplete** — Approve disabled, inline hint "Tick all 3 boxes to enable approval."
- **Ready** — Approve enabled (`color.brand.500`).
- **Submitting** — Approve spinner; rest of screen disabled.
- **Biometric cancelled** — Toast, screen returns to Ready.
- **Submission failed** — Toast in `color.error.600` "We couldn't file your ITR. Please try again or contact support." Approve re-enabled.

---

## Disclaimer copy template (English; full file maintained in i18n)

> **You are filing your own Income Tax Return.** SnapAccount provides technology and CA-assisted review to help you prepare your filing accurately. The information you have entered, reviewed, and approved here will be filed in your name with the Income Tax Department of India. The legal responsibility for the accuracy of this return rests with you, the assessee, under Section 139 of the Income Tax Act, 1961.
>
> Your CA has reviewed the computation and confirmed it is consistent with the documents you provided. The CA's role is advisory; they have not independently audited every transaction.
>
> By approving below, you authorize SnapAccount to submit this return to the Income Tax e-filing system on your behalf. After filing you will receive an acknowledgment (ITR-V). You must e-verify the return within 30 days, otherwise the return is treated as not filed.
>
> If you discover an error after filing, you can revise the return up to 31 December {AY+1}. Contact support@snapaccount.in or your CA via in-app chat.

(Full text ~700 words; lawyer-reviewed before launch.)

---

## i18n keys

```
itr.approval.title
itr.approval.banner.heading
itr.approval.disclaimer.{section1..section6}.heading
itr.approval.disclaimer.{section1..section6}.body
itr.approval.checklist.reviewed / .accurate / .responsibility
itr.approval.scrollHint / .scrollComplete
itr.approval.biometricReason  ("Confirm your identity to file your ITR")
itr.approval.cta.cancel / .approveAndFile
itr.approval.toast.cancelled / .failed
itr.approval.confirmation.heading / .ack ("Acknowledgment {number}")
itr.approval.confirmation.cta.viewSummary / .done
```

---

## Accessibility

- All checkboxes ≥ 44×44pt with `accessibilityState={ checked }`.
- Disabled Approve button has `accessibilityHint="Scroll to the bottom and tick all confirmations to enable"`.
- Biometric prompt reason string localized.
- Disclaimer body uses semantic headings (h2 per section) and runs at `text-base` (16pt) for legibility.
