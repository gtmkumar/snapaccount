# Mobile — KeyFactsStatementScreen (KFS)

> Phase: 7 (Wave 2) | Owner: ui-ux-agent | Date: 2026-06-10
> Task: U1 (GAP-021) | Backend dependency: B8 (LoanService Key Facts Statement, signed payload) | Implementer: mobile-dev (M3)
> Regulatory basis: RBI Master Direction on Digital Lending (2025) — mandatory standardized Key Facts Statement shown to the borrower **before** consent.

---

## Purpose

Render the RBI-mandated **Key Facts Statement** for a specific loan offer/application as a **server-signed, read-only** document. The borrower must read it (scroll to bottom) and explicitly acknowledge it before they can proceed to `LoanConsentScreen`. The acknowledged **KFS id** is then carried forward into every consent record submitted for that application, creating an auditable "informed-before-consent" chain.

This screen slots into the loan journey **immediately before** the existing `LoanConsentScreen`:

```
LoanApplicationScreen → [Preview package] → LoanPackagePreviewScreen
   → KeyFactsStatementScreen (NEW, this spec)
   → LoanConsentScreen (existing, 3 granular consents)
   → Loan submission → LoanStatusScreen
```

> Rationale for placement: RBI requires the KFS (APR + all fees + cooling-off) to be presented and acknowledged **before** the borrower authorizes data sharing / disbursement mandate. The existing `LoanApplicationScreen` "Preview unlock rule" gate (all docs green + consents signed) is therefore amended — see **Navigation & data contract** below.

## User Goal

"Before I authorize anything, show me — in plain language and in one screen — exactly what this loan costs me: the true annual rate, every rupee of fees, what I actually receive, what I repay, and how I can back out."

---

## Layout

```
┌─ Header  [back]  "Key Facts Statement"  [🔒 verified] ────────────┐
│  KfsTrustBanner (info, sticky top under header)                    │
│   🔒  "Issued & digitally signed by SnapAccount · cannot be edited"│
│       "{bankName} · {productName}"                                  │
│  ──────────────────────────────────────────────────────────────── │
│  (scroll container — entire body scrolls; footer is sticky)        │
│                                                                    │
│  ▌ AprHeroBlock  (largest numeric on screen)                       │
│   ┌────────────────────────────────────────────────────────────┐ │
│   │  ANNUAL PERCENTAGE RATE (APR)                                │ │
│   │            18.42%  p.a.                ← text-4xl, bold      │ │
│   │  Inclusive of interest + all fees. This is the true cost.   │ │
│   │  Nominal interest rate: 14.00% p.a. (reducing balance)      │ │
│   └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ▌ LoanSnapshotGrid  (2-col key facts)                             │
│   Sanctioned amount     ₹15,00,000                                 │
│   Tenure                24 months                                  │
│   Instalment (EMI)      ₹72,449 / month                            │
│   Total interest        ₹2,38,776                                  │
│   Total of all fees     ₹47,200  (see below)                       │
│   Total amount payable  ₹17,85,976                                 │
│                                                                    │
│  ▌ FeeItemizationTable  "All fees & charges"                       │
│   Row: Processing fee            ₹30,000  (2.00% of sanctioned)    │
│   Row: Insurance premium         ₹8,000                            │
│   Row: GST on fees (18%)         ₹6,840                            │
│   Row: Third-party / valuation   ₹2,360   [ⓘ third-party]         │
│   ──────────────────────────────────────────                      │
│   Row: Total fees & charges      ₹47,200   (bold)                  │
│                                                                    │
│  ▌ NetDisbursalBlock  (emphasised callout)                         │
│   "Amount credited to your account"                                │
│            ₹14,52,800             ← text-2xl, finance.positive     │
│   = Sanctioned ₹15,00,000 − fees ₹47,200 (deducted upfront)        │
│                                                                    │
│  ▌ RepaymentScheduleSection  (AccordionSection, collapsed default) │
│   ▸ "Full repayment schedule (24 instalments)"                     │
│     ── expanded ──                                                 │
│     RepaymentScheduleTable  (Month | Due date | EMI | Principal |  │
│                              Interest | Balance)                   │
│     #1  05 Jul 2026  ₹72,449  ₹54,949  ₹17,500  ₹14,45,051         │
│     #2  05 Aug 2026  ₹72,449  ₹55,590  ₹16,859  ₹13,89,461         │
│     … (all rows; virtualized)                                      │
│                                                                    │
│  ▌ CoolingOffNotice  (warning-tinted callout)                      │
│   "Cooling-off / look-up period: 3 days"                           │
│   "You may exit this loan within 3 days of disbursal by repaying   │
│    the principal + proportionate APR for the days used, with NO    │
│    prepayment penalty. Exit before {coolingOffEndDate}."           │
│                                                                    │
│  ▌ GrievanceOfficerBlock  (card)                                   │
│   "Grievance Redressal Officer"                                    │
│   Name:   {officerName}                                            │
│   Phone:  {officerPhone}        [Call]   ← tel: link               │
│   Email:  {officerEmail}        [Email]  ← mailto: link            │
│   Address / hours: {officerAddress} · {hours}                      │
│   "If unresolved in 30 days, escalate to RBI CMS (cms.rbi.org.in)" │
│                                                                    │
│  ▌ KfsMetaFooter                                                   │
│   "KFS id: KFS-2026-0001839 · Issued 10 Jun 2026, 20:42 IST"       │
│   "Signature (SHA-256, last 8): …a39f7c21 · Verified ✓"            │
│  ──────────────────────────────────────────────────────────────── │
│  ScrollHintBanner (floats above footer until scrolled to bottom)   │
│   "Please read to the end to continue"   [↓]                       │
│  ══════════════════════════════════════════════════════════════   │
│  KfsAcknowledgeFooter (sticky bottom)                              │
│   ☐  "I have read and understood the Key Facts Statement."         │
│       [disabled until scrolled-to-bottom]                          │
│   [Download PDF]                       [Continue to consent →]     │
│                                        [disabled until ☑]          │
└────────────────────────────────────────────────────────────────── ┘
```

---

## Components used

| Component | Source | Notes |
|-----------|--------|-------|
| `TopNavBar` | component-library 3.2 | Title "Key Facts Statement"; right slot = `🔒 verified` chip (non-interactive, opens signature explainer on tap). |
| `KfsTrustBanner` | **new** (see component addendum below) | `info` variant; sticky under header; lock icon + "digitally signed, cannot be edited". |
| `AprHeroBlock` | **new** | Wraps `AmountDisplay` (6.1) in a `percent` mode at `fontSize.4xl`; the single largest numeric on screen. |
| `LoanSnapshotGrid` | `SummaryList` (6D primitive) | 2-column key/value rows; values use `AmountDisplay`. |
| `FeeItemizationTable` | `TaxBreakdownTable` (6.6) | Reuse line-item table; last row bold total; third-party rows carry an `ⓘ` info affordance. |
| `NetDisbursalBlock` | `CalloutCard` (brand/finance variant) | Net amount in `finance.positive`; one-line derivation underneath. |
| `RepaymentScheduleSection` | `AccordionSection` (6D primitive) | Collapsed by default; expands the schedule table. |
| `RepaymentScheduleTable` | `TaxBreakdownTable` (6.6) variant | Virtualized rows (`FlatList`) for long tenures; sticky column header. |
| `CoolingOffNotice` | `AlertBanner` (4.2) `warning` | Exact day count + computed exit date + penalty-free exit terms. |
| `GrievanceOfficerBlock` | `Card` (2.1) | Name/phone/email/address; `Call` + `Email` actions. |
| `KfsMetaFooter` | plain text rows | KFS id, issued timestamp, signature last-8, Verified ✓. |
| `ScrollHintBanner` | reused from `loan-consent-screen.md` | Floats until scroll reaches bottom; haptic on reveal. |
| `KfsAcknowledgeFooter` | **new** (mirrors `ConsentSignatureBlock`) | Checkbox + `Download PDF` (secondary) + `Continue to consent` (primary). |

> All new components are appended to `component-library.md` under **Phase 7 Additions** (see end of this file). No existing component is modified.

---

## Server-signed document indicator (read-only, never editable)

The KFS payload is generated and **HMAC-signed server-side by backend B8**. The UI must treat it as a verified, immutable artifact:

- The screen **never** exposes an edit affordance for any field. All values are display-only (`accessibilityRole="text"`, no inputs).
- The `🔒 verified` chip in the header and `KfsTrustBanner` communicate authenticity. Tapping either opens a small explainer sheet: *"This statement was prepared and digitally signed by SnapAccount on {issuedAt}. Its contents cannot be changed. Signature reference: …{last8}."*
- `KfsMetaFooter` surfaces `kfsId`, `issuedAt`, and the **last 8 chars** of the signature (for transparency — never the full HMAC, never the key).
- The client does **not** verify the HMAC itself (no shared key on device). It displays the `verified: true` flag returned by the fetch endpoint; if the backend returns `verified: false` or signature metadata is missing, the screen renders the **Integrity error state** (see States) and blocks the Continue CTA.
- If any monetary field is missing/null in the payload, render the **Malformed-payload error state** rather than partial/zeroed numbers (never fabricate a fee or APR).

---

## Acknowledgement interaction (REQUIRED before Continue enables)

Two independent gates must both be satisfied before `Continue to consent` enables. This is stricter than a single checkbox — it matches the existing `LoanConsentScreen` scroll-to-bottom pattern and RBI's "borrower has actually seen the KFS" intent.

1. **Scroll-to-bottom detection**
   - The acknowledgement checkbox stays disabled (`accessibilityState={{disabled:true}}`) until the scroll container's `contentOffset.y + layoutHeight ≥ contentSize.height − 24pt`.
   - On first reaching the bottom: fire `Haptics.selectionAsync()`, animate the checkbox disabled→enabled (200ms), and fade out `ScrollHintBanner`.
   - **If the `RepaymentScheduleSection` accordion is collapsed**, "bottom" is computed against the collapsed content height — the schedule is optional reading (it is long; RBI requires it be *available*, not force-scrolled). Expanding it does not re-lock the checkbox.
2. **Explicit acknowledgement checkbox**
   - Label: *"I have read and understood the Key Facts Statement."* (full row is the hit target, ≥44pt).
   - Only after the box is **checked** does `Continue to consent` enable.

`Continue to consent` is disabled (greyed, `accessibilityState={{disabled:true}}`) until **scrolled-to-bottom AND checkbox checked**. While disabled it announces the reason: *"Read to the end and tick the acknowledgement to continue."*

On `Continue to consent` press:
- POST the acknowledgement to backend B8 (records that this `kfsId` was acknowledged with timestamp/device) — see data contract.
- On success → navigate to `LoanConsentScreen` passing `{ applicationId, kfsId, kfsVersion }`.
- On failure → toast `kfs.error.ackFailed` ("Could not record your acknowledgement. Please retry."); stay on screen, keep checkbox state.

> No biometric step-up is required on this screen — biometric re-auth happens per-consent on the next screen (`LoanConsentScreen`). KFS acknowledgement is a read-receipt, not an authorization.

---

## Navigation & data contract (KFS-id handoff)

### Inbound (entering KFS)
- **From:** `LoanPackagePreviewScreen` (or `LoanApplicationScreen` "Continue" once the package is ready).
- **Route params:** `{ applicationId: string }` (and optionally `offerId` / `bankId` if multiple offers — the KFS is per selected offer).
- **On mount:** fetch the signed KFS for this application/offer (endpoint owned by B8 — see below).

### KFS fetch (B8 — proposed contract; confirm exact path with backend)
```
GET /loans/{applicationId}/kfs            (or /loans/kfs?offerId=…)
→ 200 {
    kfsId: "KFS-2026-0001839",
    kfsVersion: 3,                 // bumped when fee/APR schema or text changes
    bankName, productName,
    currency: "INR",
    apr: 18.42,                    // % p.a., 2 decimals
    nominalInterestRate: 14.00,    // % p.a.
    interestType: "REDUCING_BALANCE",
    sanctionedAmount: 1500000,     // paise or rupees — CONFIRM unit with B8
    tenureMonths: 24,
    emiAmount: 72449,
    totalInterest: 238776,
    fees: [
      { code: "PROCESSING", label, amount: 30000, basis: "2.00% of sanctioned", thirdParty: false },
      { code: "INSURANCE",  label, amount: 8000,  thirdParty: false },
      { code: "GST_ON_FEES",label, amount: 6840,  thirdParty: false, rate: 18 },
      { code: "VALUATION",  label, amount: 2360,  thirdParty: true }
    ],
    totalFees: 47200,
    netDisbursalAmount: 1452800,
    totalAmountPayable: 1785976,
    repaymentSchedule: [
      { instalmentNo: 1, dueDate: "2026-07-05", emi: 72449, principal: 54949, interest: 17500, balance: 1445051 },
      …
    ],
    coolingOffDays: 3,
    coolingOffTerms: "…plain-language exit terms (en/hi/bn)…",
    grievanceOfficer: { name, phone, email, address, hours, escalation: "RBI CMS …" },
    issuedAt: "2026-06-10T20:42:00+05:30",
    signatureAlgo: "HMAC-SHA256",
    signatureLast8: "a39f7c21",
    verified: true
  }
→ 404  if no KFS yet generated for this offer (render "preparing" state, allow retry)
```

### Outbound (leaving KFS → consent)
- **Acknowledgement write (B8 — proposed):**
  ```
  POST /loans/{applicationId}/kfs/{kfsId}/acknowledge
  body: { kfsVersion, acknowledgedAt (client clock, server authoritative), deviceId (masked) }
  → 200 { acknowledgementId }
  ```
- **Forward params to `LoanConsentScreen`:** `{ applicationId, kfsId, kfsVersion, acknowledgementId }`.
- **`LoanConsentScreen` consent submission MUST include `kfsId`** so each consent record is tied to the exact KFS the borrower saw. Amend the existing consent POST from `loan-consent-screen.md`:
  ```
  POST /loans/{applicationId}/consents
  body: { consent_type, consent_text_version, kfsId, kfsVersion }   // kfsId is NEW
  ```
  Backend B8 acceptance states *"consent cannot be submitted without a served+acknowledged KFS id"* — so the consent endpoint rejects submissions whose `kfsId` was not acknowledged. The mobile flow therefore cannot reach consent without passing through this screen.

### Amendment to `LoanApplicationScreen` "Preview unlock rule"
The existing rule (`loan-application-screen.md` → "All checklist rows green + all consents signed") is updated to:
> All checklist rows green → **KFS viewed & acknowledged** → all consents signed.

If a user lands on `LoanConsentScreen` without an acknowledged KFS (e.g., resuming a draft created before Phase 7), route them to `KeyFactsStatementScreen` first. Document this back-reference for mobile-dev.

---

## States

- **Loading** — skeleton: APR hero shimmer block, 6 snapshot rows, fee-table shimmer; footer disabled. Schedule accordion shows a single skeleton row.
- **Loaded (default)** — full document; checkbox disabled; `Continue` disabled; `ScrollHintBanner` visible.
- **Scrolled-to-bottom** — checkbox enabled (haptic + 200ms animate); hint banner faded out; `Continue` still disabled until checked.
- **Acknowledged (checkbox checked)** — `Continue to consent` enabled (brand-600).
- **Schedule expanded** — accordion open; table virtualized; does not affect gates.
- **KFS not yet generated (404)** — friendly "We're preparing your Key Facts Statement" panel with a spinner + `Retry` + auto-retry every 5s up to 3×; `Continue` hidden.
- **Integrity error (`verified:false` or signature metadata missing)** — full-screen blocking `ErrorState` (4.6): "We couldn't verify this statement. For your safety we can't continue. Please contact support." Primary `Retry`, secondary `Contact support` (→ Help). `Continue` never enabled in this state.
- **Malformed payload (missing APR/fee/net fields)** — same blocking `ErrorState` with copy "This statement is incomplete." Logs telemetry `kfs.error.malformed`.
- **Offline** — if fetch fails with no cached KFS: `ErrorState` "You're offline. Connect to view your Key Facts Statement." with `Retry`. If a KFS was already fetched this session, keep showing it (read-only is safe offline) but **disable `Continue`** with subcopy "Reconnect to continue" — the acknowledgement write needs the network.
- **Acknowledgement write failure** — toast `kfs.error.ackFailed`; remain on screen; checkbox stays checked so the user can simply re-tap `Continue`.
- **Download PDF** — `Download PDF` triggers signed-URL fetch of the server-rendered KFS PDF (B8/ReportService); opens share sheet. On failure: toast `kfs.error.download`. (PDF is the canonical RBI artifact; the screen is the in-app rendering of the same signed content.)

---

## i18n keys

```
kfs.title                       ("Key Facts Statement")
kfs.verified.chip               ("Verified")
kfs.trust.banner                ("Issued & digitally signed by SnapAccount · cannot be edited")
kfs.trust.explainer.title / .body
kfs.apr.label                   ("Annual Percentage Rate (APR)")
kfs.apr.suffix                  ("p.a.")
kfs.apr.caption                 ("Inclusive of interest + all fees. This is the true cost.")
kfs.apr.nominal                 ("Nominal interest rate: {rate}% p.a. ({type})")
kfs.snapshot.sanctioned / .tenure / .emi / .totalInterest / .totalFees / .totalPayable
kfs.fees.title                  ("All fees & charges")
kfs.fees.row.processing / .insurance / .gst / .thirdParty / …
kfs.fees.basis                  ("{pct}% of sanctioned")
kfs.fees.thirdParty.tag         ("third-party")
kfs.fees.total                  ("Total fees & charges")
kfs.net.label                   ("Amount credited to your account")
kfs.net.derivation              ("= Sanctioned {sanctioned} − fees {fees} (deducted upfront)")
kfs.schedule.toggle             ("Full repayment schedule ({count} instalments)")
kfs.schedule.col.no / .dueDate / .emi / .principal / .interest / .balance
kfs.coolingOff.title            ("Cooling-off / look-up period: {days} days")
kfs.coolingOff.body             ("You may exit within {days} days of disbursal by repaying principal + proportionate APR, with no prepayment penalty. Exit before {date}.")
kfs.grievance.title             ("Grievance Redressal Officer")
kfs.grievance.name / .phone / .email / .address / .hours
kfs.grievance.escalation        ("If unresolved in 30 days, escalate to RBI CMS (cms.rbi.org.in)")
kfs.grievance.call / .emailCta
kfs.meta.id                     ("KFS id: {id}")
kfs.meta.issued                 ("Issued {dateTime}")
kfs.meta.signature              ("Signature (SHA-256, last 8): {last8} · Verified")
kfs.scrollHint                  ("Please read to the end to continue")
kfs.ack.checkbox                ("I have read and understood the Key Facts Statement.")
kfs.cta.downloadPdf             ("Download PDF")
kfs.cta.continue                ("Continue to consent")
kfs.cta.disabledHint            ("Read to the end and tick the acknowledgement to continue.")
kfs.state.preparing.title / .body
kfs.error.integrity.title / .body
kfs.error.malformed
kfs.error.offline
kfs.error.ackFailed
kfs.error.download
```

> Legal/regulated text fields (`coolingOffTerms`, fee labels, grievance escalation) come from the **server payload per language** (en/hi/bn), not from client bundles — they are versioned with `kfsVersion`. Client `t()` keys cover only chrome/labels.

---

## hi / bn typography considerations

- **Longer strings:** Hindi (Devanagari) and Bengali translations of the APR caption, cooling-off body, and fee bases run **+30–40%** longer than English. All label containers must wrap to 2–3 lines and grow vertically — never truncate a regulatory sentence. The `LoanSnapshotGrid` left column uses `flex` (min 40% / max 60%) so long Hindi labels (e.g., "स्वीकृत राशि", "कुल देय राशि") don't clip the value.
- **Line height:** Devanagari and Bengali have tall ascenders/descenders and stacked conjuncts (matras). Apply a **+2pt line-height bump** for `hi`/`bn` on body and caption text (e.g., `fontSize.sm` 18→20, `fontSize.base` 22→24) so matras and reph aren't clipped. The fee/snapshot **numeric** values stay LTR with `fontWeight.semibold` and are unaffected.
- **APR hero:** the percentage glyph and digits remain in the system numeric face at `fontSize.4xl`; only the surrounding label/caption localize — so the "largest numeric on screen" rule holds across all three languages.
- **Numerals:** use **Western Arabic numerals (0–9)** for all amounts/percentages in all three locales (Indian financial convention), with the **Indian digit grouping** (₹15,00,000) regardless of UI language.
- **Tables:** `FeeItemizationTable` and `RepaymentScheduleTable` keep numeric columns right-aligned and LTR; localized column headers may wrap to 2 lines — reserve header row min-height accordingly.

---

## Accessibility

- All values are `accessibilityRole="text"`; no field is focusable as an input (reinforces "cannot be edited").
- **APR hero** has an explicit `accessibilityLabel`: *"Annual Percentage Rate, {apr} percent per year, inclusive of interest and all fees."* announced as a single unit so screen-reader users get the headline cost first.
- **Reading order:** Trust banner → APR → snapshot → fees → net disbursal → schedule toggle → cooling-off → grievance → meta → acknowledgement. Linear and logical for VoiceOver/TalkBack.
- Acknowledgement checkbox: `accessibilityState={{disabled, checked}}`; while disabled announces *"Disabled. Read to the end of the statement to enable."*
- `Continue to consent` (disabled) announces the `kfs.cta.disabledHint` reason.
- **Touch targets ≥ 44×44pt:** acknowledgement row (full-width, ~56pt tall), `Continue`, `Download PDF`, accordion toggle, `Call`/`Email` buttons, header back & verified chip. `Call`/`Email` icons sit in 44pt hit areas even if the glyph is smaller.
- Color is never the sole signal: cooling-off uses `warning` tint **plus** the word "Cooling-off"; net disbursal uses `finance.positive` **plus** the label "Amount credited"; third-party fees show an `ⓘ` icon **plus** the "third-party" text tag.
- Contrast: APR hero text on its tinted block, fee totals, and cooling-off body all use `neutral.900`/`brand.700`/`warning.900` on light tints to clear WCAG AA 4.5:1 (see tokens; e.g. `warning.900 #78350F` on `warning.50 #FFFBEB`).
- Reduced-motion: skip the checkbox enable animation and the scroll-hint fade — toggle states instantly.

---

## Indian-format

- Amounts: Indian grouping with ₹ (₹15,00,000; ₹14,52,800).
- APR/interest: 2 decimals, "% p.a." suffix.
- Dates: DD MMM YYYY (05 Jul 2026); timestamps "10 Jun 2026, 20:42 IST".
- Cooling-off exit date computed and shown explicitly (no "X days from now" ambiguity).

---

## Telemetry

- `kfs.opened { applicationId, kfsId, kfsVersion }`
- `kfs.scrolledToEnd { kfsId }`
- `kfs.scheduleExpanded { kfsId }`
- `kfs.acknowledged { kfsId, kfsVersion }`  (on checkbox check)
- `kfs.continued { kfsId, acknowledgementId }`  (on successful Continue)
- `kfs.error { kfsId, type: integrity|malformed|offline|ackFailed|download }`
- `kfs.pdfDownloaded { kfsId }`

---

## RBI compliance summary

- **Standardized KFS** presented before consent (Master Direction on Digital Lending 2025): APR prominent, all fees itemized incl. GST and third-party, net disbursal, tenure, full repayment schedule.
- **Server-signed & immutable:** content authored + HMAC-signed by the regulated entity (SnapAccount) — the DLA only renders it; no client edits.
- **Cooling-off / look-up period** stated with exact day count, computed exit date, and penalty-free exit terms.
- **Grievance Redressal Officer** contact shown on the lending surface with RBI CMS escalation path.
- **Informed-before-consent chain:** acknowledged `kfsId` is required on every consent record; consent submission without it is rejected server-side (B8).
- KFS content retrievable for audit (PDF + signed payload) for the statutory retention window.
```
