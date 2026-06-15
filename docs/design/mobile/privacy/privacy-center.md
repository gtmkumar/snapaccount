# Mobile — Privacy Center (screen group)

> Phase: 7 (Wave 2) | Owner: ui-ux-agent | Date: 2026-06-10
> Task: U2 (GAP-020) | Backend dependency: B7 (AuthService DPDP consent & privacy APIs) | Implementer: mobile-dev (M3)
> Regulatory basis: DPDP Act 2023 + DPDP Rules 2025 (notified 2025-11-14). User-facing surface for the data-principal rights: access, correction, withdrawal of consent, and a published India-based DPO/grievance contact.

---

## Purpose

A single self-service hub where the user (data principal) can exercise their DPDP rights:

1. **My Consents** — see every processing purpose they've consented to, with status/version/date, and withdraw any one of them.
2. **Data Export (Right to Access)** — request a complete copy of their data as an async job and download it when ready.
3. **Correction Request (Right to Correction)** — request a fix to a specific data field and track the request.
4. **Account Deletion (Right to Erasure)** — entry point that links to the **existing** deletion flow (not respec'd here).
5. **DPO / Grievance Officer contact** — published, India-based contact with response SLA (mandated by DPDP Rules 2025).

This is a screen **group** rooted at `PrivacyCenterScreen`, reached from the **More tab → Privacy & Data** (new row). It sits alongside the existing Profile "Legal" and "Danger Zone" sections and consolidates the data-rights affordances that today are scattered across `AboutScreen` (data export / deletion rows, screen 55) and `ProfileScreen` (Danger Zone, screen 49).

```
More tab
  └─ Privacy & Data  →  PrivacyCenterScreen (hub)
        ├─ MyConsentsScreen          (list + withdraw)
        ├─ DataExportScreen          (request + job status + download)
        ├─ CorrectionRequestScreen   (form) + MyCorrectionsScreen (list)
        ├─ → AccountDeletionFlow     (EXISTING — referenced, not respec'd)
        └─ DpoContactScreen / inline DPO block
```

## User Goal

"Show me what I've agreed to, let me take back any permission, get a copy of my data, fix what's wrong, and tell me exactly who to contact about my privacy — all in one place, in plain language."

---

## Screen 1 — PrivacyCenterScreen (hub)

### Layout
```
┌─ Header  [back]  "Privacy & Data" ───────────────────────────────┐
│  IntroBlock                                                       │
│   "Your data, your control."                                      │
│   "Manage consents, export or correct your data, and reach our    │
│    Data Protection Officer. Protected under the DPDP Act 2023."   │
│  ──────────────────────────────────────────────────────────────  │
│  PrivacyNavCard  ▸ My consents          "{n} active · {m} withdrawn"│
│  PrivacyNavCard  ▸ Download my data      "{statusChip}"           │
│  PrivacyNavCard  ▸ Request a correction  "{p} pending"            │
│  PrivacyNavCard  ▸ Delete my account     [error-tinted, chevron]  │
│  ──────────────────────────────────────────────────────────────  │
│  DpoContactBlock  (card)                                          │
│   "Data Protection Officer"                                       │
│   {dpoName} · {dpoEmail} [Email]                                  │
│   "We respond to privacy requests within {slaDays} days."         │
│   [View full contact →]                                           │
│  ──────────────────────────────────────────────────────────────  │
│  FooterLinks: Privacy Policy · DPDP Rights (WebView)              │
└────────────────────────────────────────────────────────────────  ┘
```

### Components
- `TopNavBar` (3.2), `Card` (2.1), `Badge`/`StatusBadge` (2.3/2.5) for the status chips, `PrivacyNavCard` (**new** — a `Card` with leading icon, title, right-aligned status chip + chevron; ≥64pt tall), `DpoContactBlock` (**new**, see addendum).
- Counts on the nav cards are fetched in one summary call on mount; if the call fails, cards render without chips (never block navigation).

### Navigation
- **Arrives:** More tab → "Privacy & Data".
- **Exits to:** the four sub-screens; "Delete my account" deep-links into the **existing** account-deletion flow (see Account Deletion section); "View full contact" → `DpoContactScreen`.

---

## Screen 2 — MyConsentsScreen (list + withdraw)

Backed by **B7 `GET /auth/me/consents`** and **B7 `POST /auth/me/consents/{purpose}/withdraw`**.

### Layout
```
┌─ Header  [back]  "My consents" ──────────────────────────────────┐
│  FilterTabs  [ Active ] [ Withdrawn ] [ All ]                     │
│  ──────────────────────────────────────────────────────────────  │
│  ConsentPurposeCard                                               │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  Credit bureau check            [StatusBadge: Granted]     │  │
│   │  "Allows us to pull your CIBIL/Experian/Equifax report     │  │
│   │   to assess loan eligibility."                             │  │
│   │  Granted 12 Apr 2026 · Version 1.4                         │  │
│   │  ───────────────────────────────                          │  │
│   │                                  [ Withdraw consent ]      │  │
│   └──────────────────────────────────────────────────────────┘  │
│  ConsentPurposeCard  (DATA_SHARE_WITH_BANK) …                     │
│  ConsentPurposeCard  (DISBURSEMENT_MANDATE) …                     │
│  ConsentPurposeCard  (MARKETING)  [StatusBadge: Withdrawn]        │
│     "Withdrawn 02 May 2026"   [ Re-grant ]  (if re-grantable)     │
│  ──────────────────────────────────────────────────────────────  │
│  (empty)  EmptyState "No consents on record yet."                 │
└────────────────────────────────────────────────────────────────  ┘
```

### Per-purpose card fields (each maps to a B7 consent record)
| UI field | Source field (proposed B7 shape) |
|----------|----------------------------------|
| Purpose name | `purposeLabel` (localized) keyed by `purposeCode` (e.g. `CREDIT_BUREAU`, `DATA_SHARE_WITH_BANK`, `DISBURSEMENT_MANDATE`, `MARKETING`, `ANALYTICS`) |
| Plain-language description | `description` (localized, versioned) |
| Status | `status: GRANTED | WITHDRAWN` → `StatusBadge` (success / neutral) |
| Granted date | `grantedAt` (DD MMM YYYY) |
| Version | `consentTextVersion` |
| Withdrawn date (if withdrawn) | `withdrawnAt` |

### Withdraw interaction (one-tap → confirm)
- `Withdraw consent` opens a **confirmation dialog** that explains consequences before the call:
  ```
  Title:  "Withdraw consent for {purpose}?"
  Body:   "{consequenceText}"   — purpose-specific, from B7 payload, e.g.:
          • CREDIT_BUREAU: "We won't be able to fetch your credit report.
            Any in-progress loan application may be paused."
          • DATA_SHARE_WITH_BANK: "We'll stop sharing your data with partner
            banks. Applications already submitted cannot be recalled."
          • MARKETING: "You'll stop receiving product tips and offers."
  Note:   "Withdrawal takes effect immediately and is recorded for audit.
           This does not delete data already lawfully processed."
  Buttons: [Cancel]   [Withdraw]  (Withdraw = error-tinted)
  ```
- On confirm → `POST /auth/me/consents/{purposeCode}/withdraw`.
  - **Optimistic UI:** flip the card to `Withdrawn` with a subtle spinner badge; on 200 settle the state + `withdrawnAt`; on failure **roll back** to `Granted` and toast `privacy.consents.error.withdraw`.
  - Success toast: `privacy.consents.toast.withdrawn` ("Consent withdrawn.").
- **Loan-linked consents caveat:** for `CREDIT_BUREAU` / `DATA_SHARE_WITH_BANK` / `DISBURSEMENT_MANDATE`, the consequence text and the loan-consent history surface (RBI revocation history, GAP-021) must stay consistent. This screen is the DPDP master surface; the loan-consent screen's "revocation history" reads the same records. (Confirm with backend whether withdrawal here cascades to active loan applications — see open questions.)
- **Re-grant:** a withdrawn, re-grantable purpose shows `Re-grant` which routes to the appropriate consent capture (e.g. `LoanConsentScreen` for loan purposes, or an inline re-consent sheet for marketing). Non-re-grantable purposes show no action.

### States
- **Loading** — 3 skeleton cards.
- **Loaded** — cards per filter.
- **Withdrawing** — that card disabled with inline spinner on the badge.
- **Empty** (filter has no rows) — `EmptyState` with filter-aware copy.
- **Error** — `ErrorState` (4.6) with `Retry`.
- **Offline** — show last-fetched list (cached) read-only; disable `Withdraw` with subcopy "Reconnect to change consents".

---

## Screen 3 — DataExportScreen (Right to Access)

Backed by **B7 `GET /auth/me/data-export`** (async job: request → status → download).

### Layout
```
┌─ Header  [back]  "Download my data" ─────────────────────────────┐
│  ExplainerBlock                                                   │
│   "Get a copy of your SnapAccount data."                          │
│   "Your export is a JSON bundle including:                        │
│      • Profile & business details                                 │
│      • Documents metadata & OCR results                           │
│      • GST filings, ITR records, ledgers                          │
│      • Loan applications & consents                               │
│      • Chat history & notifications                               │
│    Large files are delivered as a secure, time-limited download." │
│  ──────────────────────────────────────────────────────────────  │
│  ExportJobCard  (state-driven — see below)                        │
│  ──────────────────────────────────────────────────────────────  │
│  PastExportsList (optional)                                       │
│   "Requested 01 Jun 2026 · Expired"                               │
└────────────────────────────────────────────────────────────────  ┘
```

### Job lifecycle (`status`: `requested → processing → ready → expired/failed`)
| Status | ExportJobCard rendering |
|--------|-------------------------|
| *none* | `[ Request my data export ]` primary button + "Usually ready within {n} hours." |
| `requested` / `processing` | Spinner + "Preparing your export… We'll notify you when it's ready." + `ProgressBar` (indeterminate). Polls `GET /auth/me/data-export` every 10s (and on screen focus). Push notification on completion. |
| `ready` | Success tint + "Your data export is ready." + `[ Download ]` (signed URL, opens share sheet) + "Available until {expiresAt}." |
| `expired` | Neutral + "This export has expired." + `[ Request again ]`. |
| `failed` | `error` tint + "Export failed. Please try again." + `[ Retry ]` + support link. |

### Interaction notes
- Only one active export job at a time; while `requested/processing`, the request button is replaced by status.
- Download uses a **signed, expiring URL** (consistent with the platform's GCS signed-URL pattern); the JSON bundle is generated server-side by B7.
- Explain (DPDP transparency): "This is a copy for your records. It does not change or delete anything."

### States
Loading (card skeleton) · each job status above · Offline (disable request/download, "Reconnect to request your export") · Error (Retry).

---

## Screen 4 — CorrectionRequestScreen (Right to Correction) + MyCorrectionsScreen

Backed by a **B7 data-correction request workflow** (exact endpoints to confirm — see open questions; proposed below).

### CorrectionRequestScreen — form
```
┌─ Header  [back]  "Request a correction" ─────────────────────────┐
│  ExplainerBlock                                                   │
│   "Tell us what's wrong and we'll review it."                     │
│  ──────────────────────────────────────────────────────────────  │
│  Select   "Which information?"  (field)                           │
│            ▾ Name / Business name / GSTIN / PAN display / Phone / │
│              Email / Address / Other                              │
│  ReadOnly  "Current value"      {prefilled from profile}          │
│  TextInput "Correct value"      (requestedValue)                  │
│  Textarea  "Reason (optional)"  max 280 chars                     │
│  FileUpload "Supporting document (optional)"  (e.g. proof)        │
│  ──────────────────────────────────────────────────────────────  │
│  InfoBanner "Some fields (PAN, GSTIN) may need re-verification    │
│             after correction."                                    │
│  StickyFooter   [Cancel]            [Submit request]              │
└────────────────────────────────────────────────────────────────  ┘
```
- `field` is a controlled `Select`; choosing it prefills the read-only **Current value** from the profile/AuthService.
- `Correct value` is required; `Submit` disabled until `field` + `requestedValue` present and `requestedValue ≠ currentValue`.
- On submit → `POST /auth/me/corrections` (proposed) body `{ field, currentValue, requestedValue, reason, attachmentRef? }` → returns `requestId`. Success → toast + navigate to `MyCorrectionsScreen`.

### MyCorrectionsScreen — list
```
┌─ Header  [back]  "My correction requests"  [+ New] ──────────────┐
│  CorrectionRequestRow                                             │
│   "GSTIN"   [StatusBadge: Under review]   Submitted 09 Jun 2026   │
│   "→ {requestedValue}"                                            │
│  CorrectionRequestRow  "Email"  [Approved]  ·  Applied 06 Jun     │
│  CorrectionRequestRow  "Address" [Rejected] · "Reason: …"  [info] │
│  (empty) EmptyState "No correction requests yet."                 │
└────────────────────────────────────────────────────────────────  ┘
```
- Status: `SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED` → `StatusBadge` (info / warning / success / error). Rejected rows show the reviewer reason.
- Backed by `GET /auth/me/corrections` (proposed).

### States
Loading (skeletons) · validation errors inline on the form · submit failure toast + retain input · empty list · offline (queue disabled, "Reconnect to submit").

---

## Account Deletion (Right to Erasure) — reference only

- The "Delete my account" `PrivacyNavCard` is **error-tinted** and routes into the **EXISTING** account-deletion flow (Profile → Danger Zone "Delete Account (Right to Erasure)", screen 49; reason-selection confirmation per `AboutScreen` screen 55). **This spec does not redesign that flow.**
- Add one sentence of context on the hub card: "Permanently erase your account and personal data, subject to legal retention (e.g. 7-year financial records)." — this sets DPDP expectations without respec'ing the flow.
- **Backend note for mobile/QA:** the deletion flow's robustness fix is tracked under GAP-003 / backend **B1** (Firebase-revoke must be best-effort so erasure always succeeds). No UI change needed here, but the deletion entry point should surface the existing flow's success/queued-retry messaging.

---

## DPO / Grievance Officer contact (DPDP Rules 2025)

DPDP Rules 2025 require a **published, India-based** contact for the data principal. Shown inline on the hub (`DpoContactBlock`) and in full on `DpoContactScreen`.

```
┌─ Header  [back]  "Data Protection Officer" ──────────────────────┐
│  Card                                                             │
│   "Data Protection Officer (DPO)"                                 │
│   Name:     {dpoName}                                             │
│   Email:    {dpoEmail}            [Email]   ← mailto:             │
│   Phone:    {dpoPhone}            [Call]    ← tel:  (if provided) │
│   Address:  {indiaAddress}        (India-based, required)         │
│   Hours:    {businessHours}                                       │
│   ──────────────────────────────                                 │
│   "We acknowledge privacy requests within {ackDays} business days │
│    and resolve within {slaDays} days."                            │
│  GrievanceEscalationNote                                          │
│   "Unsatisfied? You may complain to the Data Protection Board of  │
│    India." [Learn more →]                                         │
└────────────────────────────────────────────────────────────────  ┘
```
- Sourced from B7 config (proposed `GET /auth/config/privacy-contact` or embedded in `GET /auth/me/consents` envelope — confirm). Never hardcode the contact on device — it must be admin-configurable so it can be updated without an app release.
- `Email`/`Call` open native intents; both sit in ≥44pt hit areas.

---

## i18n keys

```
privacy.center.title                ("Privacy & Data")
privacy.center.intro.title / .body
privacy.center.nav.consents / .export / .correction / .deletion
privacy.center.nav.consents.count   ("{active} active · {withdrawn} withdrawn")
privacy.center.footer.policy / .rights

privacy.consents.title              ("My consents")
privacy.consents.filter.active / .withdrawn / .all
privacy.consents.status.granted / .withdrawn
privacy.consents.grantedOn          ("Granted {date} · Version {version}")
privacy.consents.withdrawnOn        ("Withdrawn {date}")
privacy.consents.cta.withdraw / .regrant
privacy.consents.confirm.title      ("Withdraw consent for {purpose}?")
privacy.consents.confirm.note       ("Withdrawal takes effect immediately and is recorded for audit. This does not delete data already lawfully processed.")
privacy.consents.confirm.cancel / .confirm
privacy.consents.toast.withdrawn
privacy.consents.error.withdraw / .load
privacy.consents.empty

privacy.export.title                ("Download my data")
privacy.export.explainer.title / .body
privacy.export.cta.request / .download / .requestAgain / .retry
privacy.export.status.processing / .ready / .expired / .failed
privacy.export.availableUntil       ("Available until {date}")
privacy.export.error.offline / .generic

privacy.correction.title            ("Request a correction")
privacy.correction.field.label / .current / .requested / .reason / .attachment
privacy.correction.field.options.*  (name, businessName, gstin, panDisplay, phone, email, address, other)
privacy.correction.info.reverify
privacy.correction.cta.submit / .cancel
privacy.correction.toast.submitted
privacy.correction.list.title       ("My correction requests")
privacy.correction.status.submitted / .underReview / .approved / .rejected
privacy.correction.rejectedReason   ("Reason: {reason}")
privacy.correction.empty
privacy.correction.error.submit / .load

privacy.deletion.nav                ("Delete my account")
privacy.deletion.context            ("Permanently erase your account and personal data, subject to legal retention (e.g. 7-year financial records).")

privacy.dpo.title                   ("Data Protection Officer")
privacy.dpo.name / .email / .phone / .address / .hours
privacy.dpo.sla                     ("We acknowledge requests within {ackDays} business days and resolve within {slaDays} days.")
privacy.dpo.escalation              ("Unsatisfied? You may complain to the Data Protection Board of India.")
privacy.dpo.cta.call / .email / .learnMore
```

> Plain-language **consent descriptions** and **withdrawal consequence text** are **server-supplied per language** (en/hi/bn), versioned with the consent record — not client bundles. Client `t()` keys cover chrome only.

---

## hi / bn typography considerations

- Consent descriptions and withdrawal consequence text are long legal-adjacent sentences; Hindi/Bengali run **+30–40%** longer. `ConsentPurposeCard` and the confirm dialog must grow vertically and **never truncate** consequence text — the user must understand what withdrawal means in their language.
- Apply the **+2pt line-height bump** for `hi`/`bn` on `fontSize.sm`/`.base` body text (matras/conjuncts clearance), consistent with the KFS spec.
- Status chips (`StatusBadge`) carry localized labels ("स्वीकृत"/"মঞ্জুর") — reserve chip min-width and allow wrap to a second line on narrow (375px) devices rather than clipping.
- Dates use Western numerals + DD MMM YYYY in all locales; month abbreviations localize.

---

## Accessibility

- Every `PrivacyNavCard`, `ConsentPurposeCard` action, export button, correction row, and contact action is `accessibilityRole="button"` with a full label (e.g. *"Withdraw consent for Credit bureau check, currently granted"*).
- The withdraw confirmation dialog is a focus-trapped modal; the destructive `Withdraw` button is **not** the default-focused element (default focus on `Cancel`) to prevent accidental destructive activation.
- Status is never color-only: `StatusBadge` pairs a tint with text ("Granted"/"Withdrawn"/"Under review"/"Rejected").
- **Touch targets ≥ 44×44pt:** nav cards (≥64pt), withdraw/re-grant buttons, filter-tab segments, form controls, submit/cancel, `Call`/`Email`/`Download` actions, and the `+ New` header button.
- Contrast: error-tinted deletion card and destructive buttons use `error.700`/`error.900` text on light error tints to clear AA; success/withdrawn badges use `success.700`/`neutral.600` accordingly (see tokens).
- Async export status changes announce via `accessibilityLiveRegion="polite"` so screen-reader users hear "Your data export is ready."
- Reduced-motion: replace indeterminate progress animation with a static "Preparing…" label + periodic polite announcements.

---

## Indian-format & DPDP notes

- Dates DD MMM YYYY; phone +91 format in DPO block; PAN shown masked where displayed (XXXXX9999X) and is correction-requestable but not free-edited here.
- DPO contact is **India-based and published** (DPDP Rules 2025) and admin-configurable (no hardcode).
- Withdrawal and correction actions are **immutable-audit-logged server-side** (B7 acceptance: timestamp/IP/device) — the UI need not display audit metadata but must communicate that actions are recorded.
- "Right to access" (export) and "right to correction" framed in plain language; legal jargon avoided per project i18n + DPDP transparency principle.

---

## Telemetry

- `privacy.center.opened`
- `privacy.consents.viewed { filter }`, `privacy.consents.withdrawRequested { purpose }`, `privacy.consents.withdrawn { purpose }`, `privacy.consents.regrantTapped { purpose }`
- `privacy.export.requested`, `privacy.export.ready`, `privacy.export.downloaded`, `privacy.export.failed`
- `privacy.correction.opened`, `privacy.correction.submitted { field }`, `privacy.correction.statusViewed`
- `privacy.deletion.entered`  (hands off to existing flow)
- `privacy.dpo.contactTapped { channel: email|call }`

---

## Backend API mapping summary (B7 — for mobile-dev)

| UI action | Endpoint | Confirmed in B7 scope? |
|-----------|----------|------------------------|
| List consents | `GET /auth/me/consents` | ✅ named in B7 |
| Withdraw consent | `POST /auth/me/consents/{purpose}/withdraw` | ✅ named in B7 |
| Request/poll data export | `GET /auth/me/data-export` (async job) | ✅ named in B7 (job semantics to confirm) |
| Correction submit/list | `POST /auth/me/corrections` · `GET /auth/me/corrections` | ⚠️ workflow named, exact endpoints **proposed** — confirm |
| DPO/grievance contact | `GET /auth/config/privacy-contact` (or embedded in consents envelope) | ⚠️ **proposed** — confirm source |
| Account deletion | existing deletion flow (GAP-003/B1) | ✅ existing |

---

## Component additions (append to `component-library.md` → Phase 7 Additions)

> Shared with the KFS spec where noted. No existing component is modified.

- **`PrivacyNavCard`** — `Card` (2.1) with leading 24pt icon, title, optional `StatusBadge`/count chip (right), trailing chevron. ≥64pt tall. Variants: `default`, `destructive` (error tint for deletion). `accessibilityRole="button"`.
- **`ConsentPurposeCard`** — `Card` with title + `StatusBadge`, body description, meta line (granted date · version), and a footer action (`Withdraw` / `Re-grant`). Withdraw uses `error` text on a ghost/secondary button.
- **`ExportJobCard`** — state machine card (`none | requested/processing | ready | expired | failed`) wrapping `ProgressBar` (4.3), `PrimaryButton`/`SecondaryButton`, and tinted status.
- **`DpoContactBlock`** — `Card` with labeled rows + `Email`/`Call` actions (44pt hit areas) + SLA line.
- **`KfsTrustBanner`, `AprHeroBlock`, `KfsAcknowledgeFooter`** — defined in `key-facts-statement-screen.md`.

(`FilterTabs` (mobile, used on Notification Center) and `AccordionSection` (6D) already exist; `StatusBadge`, `Card`, `EmptyState`, `ErrorState`, `Toast`, `FileUpload`, `Select`, `TextInput`, `ProgressBar`, `PrimaryButton`, `SecondaryButton`, `GhostButton` are reused unchanged.)
```
