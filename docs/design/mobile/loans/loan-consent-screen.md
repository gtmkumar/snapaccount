# Mobile — LoanConsentScreen

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

DPDP-compliant capture of three explicit consents required before any application is submitted to a partner bank:

1. `CREDIT_BUREAU` — permission to pull CIBIL/Experian/Equifax credit report.
2. `DATA_SHARE_WITH_BANK` — permission to package and transmit GSTR-3B + P&L + BS + bank summary + KYC PDF to the selected partner bank.
3. `DISBURSEMENT_MANDATE` — pre-authorization for the bank to credit the loan amount to the user's registered bank account.

Each consent is its own legal document, must be **scrolled to the bottom** before the user can tick the acceptance box, and is signed via biometric re-authentication.

## User Goal

"Show me exactly what I'm authorizing, in plain language, before any of my data leaves SnapAccount."

---

## Layout — Stepper wrapper

```
┌─ Header  [back]  "Consents" ──────────────────────────────┐
│  Stepper  [✓ Bureau] [● DataShare] [○ Mandate]            │
│  ─────────────────────────────────────────────────────── │
│  ConsentDocumentCard  (scroll container)                   │
│   ┌──────────────────────────────────────────────────┐   │
│   │  ConsentDocumentHeader                            │   │
│   │   "Credit bureau check authorization"             │   │
│   │   Version 1.4 · Updated 12 Apr 2026               │   │
│   │  ─────────────────────────────                    │   │
│   │  <Long legal body, en/hi/bn>                      │   │
│   │  ...                                              │   │
│   │  ...                                              │   │
│   │  Consent flag: I have read & understood          │   │
│   └──────────────────────────────────────────────────┘   │
│  ScrollHintBanner (if not at bottom)                       │
│   "Scroll to the end to enable acceptance"   [↓]          │
│  ─────────────────────────────────────────────────────── │
│  ConsentSignatureBlock (sticky bottom)                     │
│   ☐ I, {full name}, consent to the above on {dateTime}.   │
│      [disabled until scrolled-to-bottom]                  │
│   [Decline]                              [Sign & continue→]│
└────────────────────────────────────────────────────────── ┘
```

---

## Components used

- `Stepper` (Phase 6D primitive) at top, 3 nodes.
- `ConsentDocumentCard` — scrollable card with sticky header inside.
- `ScrollHintBanner` — small floating chip near bottom when scroll position not yet at end. Disappears smoothly once user scrolls to within 24pt of end.
- `ConsentSignatureBlock` (new — see component library addendum) — checkbox + Decline + primary CTA, fixed at bottom.
- Biometric prompt invoked on `Sign & continue` press.

## Scroll-to-bottom-before-enable rule

- The acceptance checkbox is disabled (greyed, `accessibilityState={{disabled:true}}`) until the inner ScrollView's contentOffset.y + visible height ≥ contentSize.height − 24pt.
- The instant the bottom reaches view, fire haptic `Haptics.selectionAsync()` and animate the checkbox from disabled to enabled state (200ms).
- ScrollHintBanner fades out at the same moment.

## Biometric re-authentication

- On `Sign & continue` press:
  1. Call `LocalAuthentication.authenticateAsync({ promptMessage: t('loan.consent.bio.prompt') })`.
  2. On success → POST `/loans/{appId}/consents` with `consent_type`, `consent_text_version`, `signature_hash` placeholder (server computes HMAC).
  3. On fail → keep on same step; toast "Authentication failed. Please retry."
- Devices without biometrics fall back to device passcode prompt.

## Per-consent text overview

1. **Bureau:** explains soft vs hard pull, retention 7 years, data shared only with bureaus listed (CIBIL/Experian/Equifax), revocation channel.
2. **DataShare:** lists categories (GSTR-3B, P&L, BS, KYC, bank summary), specific bank that will receive, transmission method (email or REST), retention by bank (7 years), purposes (credit decision only — not marketing).
3. **Mandate:** account number masked (XXXX-1234) + IFSC, amount cap, validity window, revocation procedure.

## States

- **Step 1 (Bureau)** — fresh; ScrollHintBanner visible.
- **Step 1 acceptance enabled** — checkbox enabled, primary CTA enabled only when checkbox ticked.
- **Step 1 signed** — Stepper checkmark green; auto-advance to Step 2 after 600ms with slide animation.
- **Decline pressed** — confirmation modal "Decline this consent?" with body explaining "You can still complete the application later." If confirmed → return to LoanApplicationScreen with `consents.bureau = declined` flag; submit CTA disabled there.
- **Network error during signing** — toast "Could not record consent. Please retry."; retain step.
- **Re-entry** — user returning to a partially signed flow sees Stepper with prior steps green, current step focused.

## i18n keys

```
loan.consent.title
loan.consent.step.bureau / .dataShare / .mandate
loan.consent.scrollHint
loan.consent.sig.flag.bureau ("I, {name}, consent to a credit-bureau check on {dateTime}.")
loan.consent.sig.flag.dataShare
loan.consent.sig.flag.mandate
loan.consent.cta.decline / .signContinue
loan.consent.bio.prompt
loan.consent.declineModal.title / .body / .confirm / .cancel
loan.consent.error.network
loan.consent.body.bureau / .dataShare / .mandate (full legal text — versioned)
```

Versioning: `consent_text_version` in DB rows — every change to legal body bumps the version. UI surfaces the version + date in the document header.

## Accessibility

- Document body uses semantic headings; screen reader linear order.
- Checkbox has `accessibilityState={{disabled, checked}}` and announces "Disabled. Scroll to the end of the document to enable." while disabled.
- Decline button uses `error` color on press but text is "Decline" (not red icon-only).
- Touch targets 44×44pt; checkbox hit area extended to entire row.
- VoiceOver/TalkBack announce the version + date when the document opens.
- Reduced-motion: disable slide transition between steps.

## Telemetry

- `loan.consent.opened {step}`, `loan.consent.scrolledToEnd {step}`, `loan.consent.signed {step, version}`, `loan.consent.declined {step}`.
- All consent events also write to `loan.application_status_log` server-side.

## DPDP compliance summary

- Each consent is granular (separate signature per type).
- Right to withdraw clearly stated in each body and surfaced in Settings → Privacy → Loan consents (Phase 6F).
- Audit log retained 7 years (matches DPDP minimum).
- Signature = HMAC(user_id + app_id + consent_text_version + timestamp, server_key) computed server-side; UI displays last-4-of-hash for transparency.
