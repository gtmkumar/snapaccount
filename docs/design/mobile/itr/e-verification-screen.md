# Mobile — EVerificationScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25
> Scope note: Manual acknowledgment MVP. Full IT Portal integration (Aadhaar OTP / Net Banking / EVC) deferred to Phase 7.

---

## Purpose

After the ITR is filed, the user has 30 days to e-verify it on the official Income Tax portal. This screen guides them, captures the proof of verification (uploaded ITR-V or self-confirmation of EVC), and counts down the deadline.

## User Goal

"Tell me what to do next, when it's due, and how to mark it done."

---

## Layout

```
┌─ Header  [back]  "E-verify your ITR"  ────────────┐
│  CountdownCard (variant warning if < 7 days left) │
│   icon clock                                      │
│   "Verify by 25 May 2026 · 30 days left"          │
│   thin progress bar  (filled by elapsed time)     │
│  ─────────────────────────────────────────────── │
│  StatusBadge "Filed · Awaiting verification"      │
│  ─────────────────────────────────────────────── │
│  Section "Why this matters"                       │
│   one-paragraph copy: if not verified in 30 days, │
│   the return is treated as never filed.           │
│  ─────────────────────────────────────────────── │
│  Section "Your options"                           │
│   OptionCard 1: Verify on the IT Portal           │
│     subtitle: "Aadhaar OTP, Net Banking, or       │
│                Bank EVC — 2 minutes"              │
│     CTA: [Open IT Portal →]   (opens browser)     │
│   OptionCard 2: I already verified                │
│     subtitle: "Mark this filing as verified"      │
│     CTA: [Confirm verification →]                 │
│   OptionCard 3: Upload signed ITR-V               │
│     subtitle: "If you printed and sent ITR-V to   │
│                CPC Bengaluru"                     │
│     CTA: [Upload ITR-V →]                         │
│  ─────────────────────────────────────────────── │
│  HelpFooter                                       │
│   "Need help? Chat with your CA."                 │
│   [Chat] icon                                     │
└───────────────────────────────────────────────────┘
```

---

## CountdownCard

- Computed from `filed_at + 30 days`.
- Variants by days remaining:
  - `> 14 d` → variant=info, color.info.50 background.
  - `7–14 d` → variant=warning, color.warning.50 background.
  - `< 7 d` → variant=error, color.error.50 background, "Verify urgently" copy.
  - `0 d` (overdue) → variant=error filled, copy "Overdue. File a fresh return or contact your CA."
- Progress bar: 30 segments (one per day); elapsed days shaded `color.warning.500`.

---

## OptionCard 1 — Open IT Portal

- Tap → `Linking.openURL('https://eportal.incometax.gov.in')`.
- Returns to app via deep link or user reopens manually. No state change here; user must come back to OptionCard 2 to confirm.

---

## OptionCard 2 — Confirm Verification

- Bottom sheet asks: "What method did you use?" → radio (Aadhaar OTP / Net Banking / Bank EVC / Demat / DSC / ITR-V post).
- Captures method + EVC reference no (optional).
- `POST /itr/filings/{id}/verify { method, reference, source: 'self_confirmed' }`.
- On success → screen replaces entire body with `VerifiedSuccessState` (large green check + "ITR verified — you're done.").

---

## OptionCard 3 — Upload ITR-V

- Tap → opens file picker (PDF only).
- Upload + status badge "Reviewing your ITR-V…".
- `POST /itr/filings/{id}/itrv` with PDF.
- Backend marks `status=E_VERIFIED` once file is accepted.
- On success → same VerifiedSuccessState.

---

## States

- **Filed, not verified, 30+ days left** — default layout.
- **Filed, < 7 days left** — countdown card error variant.
- **Overdue** — countdown overdue, all 3 OptionCards still visible but with warning banner above: "Your filing is past the deadline. Speak with your CA before re-filing."
- **Verified** — VerifiedSuccessState replaces entire body. CTA to RefundTrackerScreen if applicable.
- **Upload in progress** — OptionCard 3 shows progress bar.
- **Upload error** — error toast + Retry button.

---

## i18n keys

```
itr.everify.title
itr.everify.countdown.label  ("Verify by {date} · {n} days left")
itr.everify.countdown.overdue
itr.everify.statusBadge.filed / .verified / .overdue
itr.everify.section.whyHeading / .whyBody
itr.everify.option1.title / .subtitle / .cta
itr.everify.option2.title / .subtitle / .cta
itr.everify.option2.sheet.heading
itr.everify.option2.method.{aadhaarOtp|netBanking|bankEvc|demat|dsc|itrvPost}
itr.everify.option3.title / .subtitle / .cta
itr.everify.helpFooter / .chatCta
itr.everify.success.heading
itr.everify.error.uploadFailed / .verifyFailed
```

---

## Accessibility

- CountdownCard read by screen reader as "Verify by {date}, {n} days remaining".
- Color-coded urgency paired with icon + text (not color-only).
- OptionCards ≥ 88pt height; tappable anywhere on card.
- Linking out to IT Portal announces "Opens external website".
