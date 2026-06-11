# SnapAccount Accessibility Standard & Audit

> **Status:** Adopted standard + first audit pass (regulated surfaces). GAP-103.
> **Owner:** ui-ux-agent (standard + spec) · frontend-dev / mobile-dev (fixes) · qa-web / qa-mobile (CI enforcement).
> **Scope of this revision:** Loan flow (eligibility → KFS → consent → e-sign), KYC (phone OTP, PAN/GSTIN entry), DPDP consent / Privacy Center, on **web** (`src/admin`) and **mobile** (`mobile/src`).
> **Read-only audit:** all findings below were grounded by reading the actual screen code on branch `2026-06-10-s5t4`. No application code was modified by this document.

---

## 0. Why this is mandatory (not polish)

Digital accessibility for SnapAccount is a **legal/regulatory requirement**, not a QA nicety:

- **Supreme Court of India** (2025) held that accessibility of digital platforms is a facet of the fundamental right to life and dignity, and directed that digital KYC / financial onboarding be made accessible to persons with disabilities (PwD).
- **RBI** Master Direction on Digital Lending and follow-on 2025 circulars require regulated/lending platforms (and their LSPs — that is us) to meet recognised accessibility standards, run **certified accessibility audits**, conduct **PwD usability testing**, and provide **accessible KYC alternatives**.
- **SEBI** 2025 circular extends comparable expectations to investor-facing digital interfaces.
- Partner banks will flow these obligations down to SnapAccount in **LSP due-diligence** questionnaires. A non-conforming KYC/loan/consent flow is a commercial blocker, not just a compliance risk.

This reclassifies GAP-062 (previously "a11y as QA polish"): the **regulated surfaces** (loan, KYC, DPDP consent) are **High priority**; the remainder of the app is **Medium**.

---

## 1. Adopted standard

### 1.1 Conformance target

**SnapAccount targets WCAG 2.1 Level AA** across all surfaces, with **IS 17802 (Parts 1 & 2)** — the Bureau of Indian Standards accessibility standard for ICT products and services — as the India-specific overlay. WCAG 2.1 AA is the substantive technical bar; IS 17802 conformance is satisfied by meeting WCAG 2.1 AA plus the India-specific provisions listed in §1.3.

| Layer | Standard | Applies to |
|---|---|---|
| Web (admin) | WCAG 2.1 AA | `src/admin` React app |
| Mobile (RN) | WCAG 2.1 AA (adapted) + platform a11y APIs (iOS Accessibility / Android TalkBack) | `mobile/src` |
| India overlay | IS 17802-1 / IS 17802-2 | Both surfaces — KYC, language, assisted alternative |

We do **not** claim WCAG 2.2 or AAA. Where a 2.2 success criterion is cheap and additive (e.g. 2.5.8 Target Size minimum), we adopt it as a house rule (see §3) but conformance is **stated as 2.1 AA**.

### 1.2 WCAG 2.1 AA ↔ IS 17802 mapping (the criteria we actively enforce)

| WCAG 2.1 SC | Level | IS 17802 clause (equivalent) | SnapAccount enforcement |
|---|---|---|---|
| 1.1.1 Non-text Content | A | 9.1 | Every icon-only control has `accessibilityLabel` (RN) / `aria-label` (web). |
| 1.3.1 Info & Relationships | A | 9.1 | Form fields programmatically labelled; tables use header semantics; key/value rows grouped. |
| 1.3.5 Identify Input Purpose | AA | 9.1 | `autoComplete` / `textContentType` set (OTP `oneTimeCode`, phone `tel`). |
| 1.4.3 Contrast (Minimum) | AA | 9.2 | Text ≥ 4.5:1; large text ≥ 3:1. Token pairs validated in §4. |
| 1.4.4 Resize Text | AA | 9.2 | Respect OS font scaling; no fixed-height text boxes that clip at 200%. |
| 1.4.11 Non-text Contrast | AA | 9.2 | UI components / focus indicators / input borders ≥ 3:1 against adjacent colour. |
| 2.1.1 Keyboard | A | 9.3 | Admin: every action reachable & operable by keyboard. |
| 2.4.3 Focus Order | A | 9.3 | Logical DOM/focus order; modals trap focus; KFS/consent footer reachable after body. |
| 2.4.7 Focus Visible | AA | 9.3 | Visible focus ring on all interactive elements (web). |
| 2.5.5 / 2.5.8 Target Size | AAA(2.1)/AA(2.2) | 9.3 | **House rule:** ≥ 44×44 pt minimum (already a CLAUDE.md mobile rule). |
| 2.2.1 Timing Adjustable | A | 9.4 | OTP timeouts, KFS cooling-off, session expiry must be adjustable/extendable or exempt. **Audited in §2.** |
| 3.3.1 Error Identification | A | 9.5 | Errors announced via `accessibilityLiveRegion` / `role="alert"`; not colour-only. |
| 3.3.2 Labels or Instructions | A | 9.5 | PAN/GSTIN/OTP fields have visible label + format hint. |
| 3.3.3 Error Suggestion | AA | 9.5 | Format errors suggest the correct pattern (e.g. "ABCDE1234F"). |
| 4.1.2 Name, Role, Value | A | 9.6 | Custom controls (checkbox, stepper, accordion) expose role + state. |
| 4.1.3 Status Messages | AA | 9.6 | Async results (consent signed, export ready) announced without focus change. |
| — (India overlay) | — | IS 17802 language | **Indic-language parity** (en/hi/bn) including for screen-reader copy; assisted-mode alternative (§3). |

### 1.3 India-specific provisions (IS 17802 overlay)

1. **Language**: Screen-reader and assistive copy must exist in en/hi/bn (not English-only). Reuse the existing i18n `t()` keys for `accessibilityLabel` — never hardcode English a11y strings. (This pairs with the existing hi/bn typography rule: Indic strings run +30–40% longer and must not clip.)
2. **Accessible KYC alternative**: A non-visual / assisted path to complete KYC is mandatory (see §3 — voice/assisted-callback KYC).
3. **Numerals**: Amounts stay Western numerals with Indian grouping (₹15,00,000); the screen reader must read amounts as currency, not digit-by-digit (use `accessibilityLabel` with a spoken form where the visual is a glyph-heavy figure).

### 1.4 Conformance statement template

Publish per surface (admin, mobile) and refresh each release. Store at `docs/security/accessibility-conformance-statement.md` (security-reviewer owns publication; ui-ux-agent owns content).

```
SnapAccount Accessibility Conformance Report (ACR)
--------------------------------------------------
Product / surface: <SnapAccount Admin Web | SnapAccount Mobile (iOS/Android)>
Version / build:   <git sha + app version>
Date:              <DD/MM/YYYY>
Standard claimed:  WCAG 2.1 Level AA; IS 17802-1 & -2
Evaluation method: Automated (axe-core / RN a11y lint) + manual screen-reader pass
                   (VoiceOver / TalkBack / NVDA) + PwD usability session (date, n=)
Auditor:           <internal QA | external certified auditor>

Conformance summary:
  - Supports:            <list of criteria fully met>
  - Partially supports:  <criterion, gap, remediation owner, target date>
  - Does not support:    <criterion, justification, alternative provided>

Accessible alternative for KYC: <link to assisted/voice-callback KYC path>
Feedback / grievance channel:   accessibility@snapaccount.in (ack ≤ 2 business days)
Next review date:               <DD/MM/YYYY — each minor release>
```

A "certified audit" (RBI expectation) = the above ACR signed off by an external accessibility auditor at least annually, plus the internal automated gate in CI (§5) on every PR.

---

## 2. Prioritized audit — regulated surfaces

Severity scale: **Blocker** (legally non-conformant on a regulated flow; fix before GA) · **High** (clear AA failure) · **Medium** (AA risk / inconsistent) · **Low** (best-practice).

Overall posture: the **mobile loan/consent/KFS screens are in good shape** — they already implement scroll-gates with `accessibilityRole="checkbox"`, `accessibilityState`, `accessibilityHint`, live error regions, and ≥44pt targets. The highest-value gaps are **OTP/session timing (2.2.1)**, **admin keyboard/focus** on custom tab and table controls, **contrast of small grey captions**, and **screen-reader semantics for grouped key/value rows and the verified-signature affordance**.

### 2.1 Loan flow — KFS (`mobile/src/screens/loans/KeyFactsStatementScreen.tsx`)

This is the most regulated screen (RBI KFS, scroll-gate is a legal acknowledgement). Strengths: scroll-gate fires `Haptics.selectionAsync`, checkbox uses `accessibilityRole="checkbox"` + `accessibilityState={{checked, disabled}}`, Continue button exposes `accessibilityState.disabled` + `accessibilityHint`, APR hero has a spoken `accessibilityLabel`.

| # | Violation | WCAG SC | Severity | Fix | Owner |
|---|---|---|---|---|---|
| KFS-1 | **Scroll-gate is unreachable by a screen-reader user who navigates element-by-element rather than scrolling.** `hasScrolledToBottom` only flips on a visual scroll event; VoiceOver/TalkBack focus traversal does not necessarily fire `onScroll` to the bottom, so the acknowledge checkbox can stay permanently disabled. | 2.1.1, 4.1.2 | **Blocker** | When the screen reader is enabled (`AccessibilityInfo.isScreenReaderEnabled`), treat reaching the **last accessible element** (meta footer) as satisfying the scroll-gate, OR add an explicit "I have read the full statement" focusable affordance at the end of the body that sets `hasScrolledToBottom`. Keep the visual scroll-gate for sighted users. | mobile-dev |
| KFS-2 | Snapshot/fee rows use `accessibilityRole="text"` on the **row** but label and value are separate `<Text>` — some readers announce them disjointly ("Sanctioned amount" … then later "₹5,00,000"). | 1.3.1 | High | Compose a single `accessibilityLabel` per row (`"Sanctioned amount, ₹5,00,000"`) and set `accessibilityElementsHidden`/`importantForAccessibility="no"` on the children, so the row reads as one unit. Apply to `SnapshotRow`, `FeeRow`, schedule rows. | mobile-dev |
| KFS-3 | Repayment **schedule table** has no row/column header association; a 6-column numeric grid read cell-by-cell is unintelligible. | 1.3.1 | High | Give each data row a composed `accessibilityLabel` ("EMI 1, due 05 Jul 2026, total ₹X, principal ₹Y, interest ₹Z, balance ₹B"). Header row `accessibilityRole="header"`. | mobile-dev |
| KFS-4 | Net-disbursal derivation uses the minus glyph `−`; read as "minus" inconsistently and the figure is dense. | 1.1.1 | Medium | Add spoken `accessibilityLabel` on `netCard` ("Net disbursal ₹X, equals ₹Y minus ₹Z deducted upfront"). | mobile-dev |
| KFS-5 | Verified chip opens an `Alert` with signature details but the chip's purpose isn't obvious to AT (label is just "verified"). Cooling-off and grievance are well-handled. | 4.1.2 | Low | Expand chip `accessibilityHint`: "Double tap to view signature and issue time." | mobile-dev |
| KFS-6 | `metaText` (KFS id, signature last-8) at `fontSize 11`, `neutral[400]` on white = **~2.6:1** — fails contrast even though it is legally-relevant provenance text. | 1.4.3 | High | Use `neutral[500]` (#64748B ≈ 4.6:1) or darker for any text that conveys meaning; reserve `neutral[400]` for purely decorative. (Recurs across screens — see §4.) | mobile-dev |

### 2.2 Loan flow — Consent / e-sign (`mobile/src/screens/loans/LoanConsentScreen.tsx`, `ConsentSignatureBlock.tsx`)

Strengths: 3-step stepper, scroll-gate, biometric gate via `useBiometricGate` with Alert fallback, decline modal.

| # | Violation | WCAG SC | Severity | Fix | Owner |
|---|---|---|---|---|---|
| CON-1 | Same screen-reader scroll-gate trap as KFS-1 (consent body must be scrolled to enable signing). On a legal consent screen this is a **Blocker**. | 2.1.1 | **Blocker** | Same remedy as KFS-1, applied to `ConsentSignatureBlock`'s `scrolledToBottom` gate. | mobile-dev |
| CON-2 | **Stepper** (`Stepper.tsx`) — verify it announces "Step 2 of 3, Data sharing" and current/complete state, not just renders dots. | 1.3.1, 4.1.2 | High | Add `accessibilityRole="text"` container with composed label + `accessibilityState` on the active step; expose progress to AT. (Confirm in `components/shared/Stepper.tsx`.) | mobile-dev |
| CON-3 | Biometric **Alert fallback** path: when no hardware, the consent is recorded after an `Alert` "OK" — ensure the fallback Alert text is localized and clearly states it is the authorization step (not a generic confirm). | 3.3.2 | Medium | Localized, explicit fallback prompt; announce result via live region. | mobile-dev |
| CON-4 | Decline modal: focus is not explicitly moved into the modal nor trapped; reader may stay on background content. | 2.4.3 | Medium | On modal open, set initial AT focus to the modal title; restore focus to the trigger on close. | mobile-dev |
| CON-5 | Consent version/date caption is `neutral[400]` (contrast fail, as KFS-6). | 1.4.3 | Medium | Darken to `neutral[500]+`. | mobile-dev |

### 2.3 Loan eligibility (`mobile/src/screens/loans/LoanEligibilityScreen.tsx`, web `src/admin/.../loans/LoanDetailPage.tsx`)

| # | Violation | WCAG SC | Severity | Fix | Owner |
|---|---|---|---|---|---|
| ELG-1 | (Web) Loan detail **tab bar** is a custom control — verify tabs use `role="tab"`/`role="tablist"`, `aria-selected`, and arrow-key navigation; otherwise keyboard users can't switch Application/Documents/Consents/Timeline. | 2.1.1, 4.1.2 | High | Implement ARIA tabs pattern (roving tabindex). | frontend-dev |
| ELG-2 | (Web) `DataTable` consent/bank-comms tables — confirm `<th scope>` headers and that sortable headers are buttons with `aria-sort`. | 1.3.1 | Medium | Audit `DataTable.tsx`; add scope + aria-sort. | frontend-dev |
| ELG-3 | (Web) Status badges (`LoanStatusBadge`) convey state by colour + text — text present (good), but ensure badge text colour meets 4.5:1 on its tinted bg (e.g. warning/amber badges). | 1.4.3 | Medium | Validate badge token pairs (§4). | frontend-dev |
| ELG-4 | (Mobile) Eligibility result hint rows / qualification badges — confirm they aren't colour-only (green=eligible / red=not). | 1.4.1 | Medium | Add icon + text label, not colour alone. | mobile-dev |

### 2.4 KYC — Phone OTP (`mobile/src/screens/auth/OTPVerifyScreen.tsx`, `components/forms/OTPInput.tsx`)

Strengths: each digit box has `accessibilityLabel="OTP digit n"`, error row uses `accessibilityLiveRegion="polite"`, back/change-number buttons labelled, `textContentType="oneTimeCode"` for SMS autofill.

| # | Violation | WCAG SC | Severity | Fix | Owner |
|---|---|---|---|---|---|
| OTP-1 | **`OTPResendTimer` countdown is not announced and the resend window is fixed (60s).** A user relying on AT, or who reads slowly, gets no spoken indication of remaining time, and the "OTP valid for 5 minutes" timing can't be extended. This is the WCAG **2.2.1 Timing Adjustable** issue and is regulator-relevant for KYC. | 2.2.1, 4.1.3 | **High** | (a) Don't announce every tick (spammy); instead announce at milestones ("Resend available in 30 seconds", "You can now resend"). (b) Provide a clear, always-available "Didn't get the code? Resend / Call me" path so the OTP timeout is never a dead-end (ties to §3 assisted KYC). (c) Document that the 5-min OTP validity is a security exemption under 2.2.1 (essential), but the **resend** must always be reachable. | mobile-dev |
| OTP-2 | Resend link is a `<Text onPress>` with `accessibilityRole="button"` but the **disabled countdown state** isn't exposed as disabled to AT. | 4.1.2 | Medium | Expose `accessibilityState={{disabled: !canResend}}`; when disabled, label includes remaining time. | mobile-dev |
| OTP-3 | OTP boxes use **dashed grey borders** (`neutral[300]` dashed) at ~`1.4.11` risk on white; filled state border `neutral[400]`. Non-text contrast of the empty box outline ≈ 1.6:1. | 1.4.11 | Medium | Use ≥ `neutral[400]` for the resting box border (≥3:1) so the input affordance is perceivable; keep error = `error[600]`. | mobile-dev |
| OTP-4 | `note` ("OTP valid for 5 minutes") is `neutral[400]` (contrast fail). | 1.4.3 | Low | Darken to `neutral[500]`. | mobile-dev |
| OTP-5 | Error message text colour `error[600]` on white = ok; but the **error icon is the only thing distinguishing the error row** for some — text already present, fine. No action. | — | — | — | — |

### 2.5 KYC — PAN / GSTIN entry (`mobile/src/components/shared/PanInput.tsx`)

Strengths: `accessibilityLabel` (falls back to "PAN Number"), `accessibilityHint`, visible label, format hint, error suggestion ("Invalid PAN format (e.g. ABCDE1234F)"), characters-remaining hint.

| # | Violation | WCAG SC | Severity | Fix | Owner |
|---|---|---|---|---|---|
| PAN-1 | **Error / valid / hint text changes are not announced.** The status `<Text>` swaps silently; AT users get no feedback that the PAN is now valid or malformed. | 3.3.1, 4.1.3 | High | Wrap the status line in `accessibilityLiveRegion="polite"` (RN) and ensure the error text is also surfaced via the field's `accessibilityHint`/state on blur. | mobile-dev |
| PAN-2 | All built-in strings ("PAN must be 10 characters", "Invalid PAN format…", "PAN format valid", "N characters remaining") are **hardcoded English** — violates the i18n rule and the IS 17802 language-parity overlay. | IS 17802 §lang | High | Route through `t()`; provides hi/bn screen-reader copy. | mobile-dev |
| PAN-3 | Resting border `neutral[200]` on white surface = **~1.3:1** non-text contrast — the input boundary is barely perceivable. | 1.4.11 | Medium | Resting border ≥ `neutral[300]`/`neutral[400]` (≥3:1). Valid=success[500], error=error[500] (validate the success-green border contrast too). | mobile-dev |
| PAN-4 | No `accessibilityLabel` distinguishing **GSTIN** vs **PAN** when the same component family is reused for GSTIN entry; ensure GSTIN field announces "GSTIN, 15 characters". | 3.3.2 | Medium | Pass explicit label/hint per use; for GSTIN add the format. | mobile-dev |
| PAN-5 | `letterSpacing: 2` + `fontSize 16` is fine; but verify the field doesn't clip at 200% OS text scaling (fixed `height: 48`). | 1.4.4 | Low | Use min-height instead of fixed height; allow vertical growth. | mobile-dev |

### 2.6 DPDP — Consent / Privacy Center (`mobile/src/screens/profile/PrivacyCenterScreen.tsx`, `MyConsentsScreen.tsx`)

Strengths: nav cards have `accessibilityRole="button"` + labels, destructive card visually + role distinguished, DPO contact actionable, footer links `accessibilityRole="link"`.

| # | Violation | WCAG SC | Severity | Fix | Owner |
|---|---|---|---|---|---|
| DPDP-1 | **Consent count badges** ("3 active · 1 withdrawn", "2 pending") are decorative `<Text>` inside the card but **not part of the card's `accessibilityLabel`** — AT announces "My Consents, button" and drops the status, which is the most useful info. | 1.3.1, 4.1.3 | High | Compose the badge into the card's `accessibilityLabel`/`accessibilityValue` ("My consents, 3 active, 1 withdrawn"). | mobile-dev |
| DPDP-2 | **Consent withdrawal** (in `MyConsentsScreen`) is a one-tap + confirm-dialog action with real legal consequence; confirm the confirmation dialog states the consequence, is focus-managed, and the result ("Consent withdrawn") is announced. | 3.3.4, 4.1.3 | High | Verify/ensure consequence text + live-region result announcement + focus return. (Mirror CON-4 modal handling.) | mobile-dev |
| DPDP-3 | "View full contact →" uses a literal arrow glyph in a hardcoded English string `"View full contact →"` (not `t()`); arrow read aloud as "right arrow". | IS 17802 §lang, 1.1.1 | Medium | Move to `t()`; strip arrow from the spoken label (decorative). | mobile-dev |
| DPDP-4 | DPO email `dpoEmail` rendered as plain text at `brand[600]` — fine for contrast, but it's a `<Text>` not a link role; the explicit email button is the actionable one (good). Ensure `PRIVACY_CONTACT` placeholder ("Contact DPO" dead link until TL-10) degrades gracefully and is announced as unavailable, not as a broken button. | 4.1.2 | Medium | When `dpoEmail` is the placeholder, disable the button + `accessibilityState.disabled` + "DPO contact will be published soon". (Ties to NEW-W2-007.) | mobile-dev |
| DPDP-5 | Intro body / DPO SLA captions at `brand[700]`/`neutral[600]` — validate ≥4.5:1 (brand[700] on brand[50] is borderline; see §4). | 1.4.3 | Medium | Validate token pair; bump to brand[800] on brand[50] if < 4.5:1. | mobile-dev |
| DPDP-6 | (Web equivalent) `ConsentAuditCard.tsx` in admin — audit that consent provenance (version, timestamp, IP) is in a definition list with programmatic label/value, not visual-only columns. | 1.3.1 | Medium | Use `<dl>` semantics; ensure table-like data has headers. | frontend-dev |

### 2.7 Cross-cutting (all regulated surfaces)

| # | Theme | WCAG SC | Severity | Fix | Owner |
|---|---|---|---|---|---|
| X-1 | **`neutral[400]` as meaningful text** recurs (KFS meta, OTP note, consent version, hints). It fails 4.5:1 on white everywhere it carries meaning. | 1.4.3 | High | Establish token rule (§4): `neutral[400]` = decorative/disabled only; meaningful secondary text ≥ `neutral[500]`. Sweep regulated screens. | mobile-dev + frontend-dev |
| X-2 | **Hardcoded English a11y / status strings** (PanInput, "View full contact", some Alerts). | IS 17802 §lang | High | All AT-visible strings via `t()`; add en/hi/bn keys. | mobile-dev |
| X-3 | **OS font-scaling / Dynamic Type** not verified on regulated screens (fixed heights on inputs, dense fee/schedule grids). | 1.4.4 | Medium | Replace fixed `height` with `minHeight`; allow wrap; test at 200%. | mobile-dev + frontend-dev |
| X-4 | (Web) **Focus-visible** ring consistency on custom controls (tabs, badges-as-buttons, icon buttons). | 2.4.7 | Medium | Ensure `:focus-visible` ring (≥3:1, `--border-focus`) on every interactive element; never `outline:none` without replacement. | frontend-dev |
| X-5 | **Screen-reader regression tests don't exist** for the scroll-gate logic (KFS-1/CON-1). NEW-W2-002 already flags untested KFS gate. | — | High | Add a11y-mode tests asserting the gate is satisfiable with the reader on. | qa-mobile |

---

## 3. Accessible KYC alternative — Voice / assisted-callback path

**Requirement:** RBI + IS 17802 require a KYC path usable by people who cannot complete the standard visual OTP/PAN/GSTIN flow (blind/low-vision users, motor-impairment, low digital literacy, or simply a failing OTP loop). SnapAccount's **Technology + Human Service** model and the existing **CallbackService** make this natural: the human-assisted callback *is* the accessible alternative.

### 3.1 Design

```
Standard KYC screen (OTPVerify / PAN entry / KYC start)
        │
        ├─ persistent, always-focusable affordance:
        │     "Need help verifying? Get an assisted call"   ← min 44pt, high contrast,
        │                                                      reachable without scrolling,
        │                                                      announced first in reading order
        │
        ▼
RequestAssistedKyc screen  (reuses RequestCallbackModalScreen pattern + CallbackService)
   - Reason chips: "OTP not arriving", "Can't read the screen",
                   "Need help with PAN/GSTIN", "Prefer to talk to someone"
   - Preferred language: en / hi / bn (drives agent routing)
   - Accessibility preference flag (optional): "I use a screen reader" → routes to
        trained agent + enables verbal-readback protocol
   - Preferred time window
        │
        ▼
CallbackService creates an ASSISTED_KYC callback (new reason code), priority-flagged,
SLA tighter than generic callback (regulated KYC).
        │
        ▼
Agent completes KYC verbally with the customer:
   - identity questions + OTP read back to agent OR agent triggers a fresh OTP the
     customer reads aloud (never the agent entering it silently)
   - PAN/GSTIN captured by agent into the SAME verified KYC pipeline (gov-verification
     adapter), so the audit trail is identical to self-serve
   - consent is captured on a recorded line with explicit verbal acknowledgement of the
     KFS/consent text (agent reads the regulated text; customer says yes/no),
     recorded as consent channel = ASSISTED with the call reference
        │
        ▼
Outcome mirrors self-serve: same KYC status, same consent records, same audit log.
```

### 3.2 Requirements for the assisted path

- **Discoverable & accessible itself**: the "Get an assisted call" entry point must be the *most* accessible element — labelled, ≥44pt, first in reading order on every KYC/OTP screen, never gated behind a failed-OTP count (offer it up-front).
- **Equivalent outcome** (WCAG conforming alternative version): assisted KYC must produce the same verified state and the same legal consent records as self-serve — it is an *alternative*, not a downgrade.
- **Auditability**: assisted consent/KYC records carry `channel=ASSISTED`, agent id, call reference, and the regulated text version read aloud — so RBI/DPDP audit trails are intact.
- **Language parity**: routing honours en/hi/bn preference; agent reads regulated text in the chosen language (server-supplied versioned text, same source as the UI).
- **Backend**: add `ASSISTED_KYC` reason code + priority/SLA to CallbackService; no new service. UI reuses `RequestCallbackModalScreen` + `CallbackStatusScreen` patterns.

### 3.3 New / changed specs (for mobile-dev + backend-agent, separate work)

- `docs/design/mobile/kyc/assisted-kyc-entry.md` — the entry affordance + RequestAssistedKyc screen (ui-ux-agent, follow-up).
- CallbackService: `ASSISTED_KYC` reason code, priority SLA, consent-channel field (backend-agent).
- This is the design-level answer to GAP-103's "accessible KYC alternative"; implementation is a scoped follow-up, not in this doc's edit surface.

---

## 4. Contrast & token guardrails

The audit surfaced one systemic root cause: **`neutral[400]` (#94A3B8) is used as meaningful secondary text**. Its contrast on white is ~2.6:1 — a clear 1.4.3 failure. Reference contrasts on `#FFFFFF`:

| Token | Hex | Contrast on white | Verdict for body text |
|---|---|---|---|
| neutral[400] | #94A3B8 | ~2.6:1 | ❌ decorative/disabled only |
| neutral[500] | #64748B | ~4.6:1 | ✅ AA for normal text |
| neutral[600] | #475569 | ~7.2:1 | ✅ |
| neutral[700] | #334155 | ~10.3:1 | ✅ |
| error[600] | #E11D48 | ~4.5:1 | ✅ borderline — ok for text |
| brand[500] | #6366F1 | ~4.5:1 | ✅ borderline — ok for text/large |
| brand[600] | #4F46E5 | ~6.0:1 | ✅ |
| success[600] | #059669 | ~3.5:1 | ⚠️ large text / non-text only — **not** body text on white |

**Token rules (enforced):**
1. **Meaningful text** (anything a user must read to act or that conveys status/provenance): minimum `neutral[500]` on light surfaces. `neutral[400]` is reserved for **disabled** states and **purely decorative** dividers/placeholders.
2. **Non-text UI borders** (inputs, OTP boxes, cards that rely on the border to be perceivable): minimum 3:1 → `neutral[300]` (#CBD5E1 ≈ 3.1:1) or darker. `neutral[200]` resting borders fail and must be paired with another affordance (fill/shadow) or darkened.
3. **`success[500/600]` is not a body-text colour on white** (≈3:1) — use for fills, large numerals, icons, or pair with `success[700]` (#047857 ≈ 5.2:1) for text.
4. **Tinted-background pairs** (e.g. `brand[700]` text on `brand[50]`, badge text on tints): validate each pair ≥4.5:1; the audit flagged brand[700]/brand[50] and warning-badge pairs as borderline — bump foreground one step darker where < 4.5:1.
5. **Focus indicators** (web): `--border-focus` (#6366F1) ring ≥3:1 against adjacent colours; never remove without an equivalent.

These rules feed directly into the **Task B token canonicalization** (`design-elevation-spec.md` §1) — polish must adopt these as the canonical semantic-text tokens so the elevation pass never reintroduces low-contrast greys.

---

## 5. CI tooling & acceptance criteria

### 5.1 Web (admin) — axe-core in Vitest + jsdom

- Add `@axe-core/react` or `vitest-axe` (`expect(await axe(container)).toHaveNoViolations()`).
- **Gate scope (phase 1 — regulated surfaces):** `LoanDetailPage`, `LoansListPage`, consent/audit components (`ConsentAuditCard`), `DashboardPage`, and the auth/KYC admin views. Render each in jsdom, run axe, fail PR on `serious`/`critical` violations.
- Rules to enforce: `color-contrast`, `label`, `button-name`, `link-name`, `aria-*`, `tabindex`, `region`, `th-has-data-cells`.
- Keyboard/focus tests: assert tab order and that custom tabs (`role="tab"`) respond to arrow keys (testing-library `user-event`).
- **Acceptance (qa-web):** zero serious/critical axe violations on gated pages; focus-visible present on all interactive elements; tables expose headers; CI job `a11y-web` blocks merge.

### 5.2 Mobile (RN) — lint + component a11y assertions

- Enable `eslint-plugin-react-native-a11y` (rules: `has-accessibility-props`, `has-valid-accessibility-role`, `has-accessibility-hint`, `no-nested-touchables`). Wire into `mobile/npm run lint` (zero warnings).
- Component tests (jest + `@testing-library/react-native`): assert `accessibilityRole`, `accessibilityLabel`, `accessibilityState`, and live-region presence on the audited controls (OTP boxes, KFS checkbox/Continue, consent signature block, PAN status line, privacy nav cards).
- **Screen-reader-mode tests** (closes X-5 / NEW-W2-002): mock `AccessibilityInfo.isScreenReaderEnabled = true` and assert the scroll-gate (KFS-1 / CON-1) is satisfiable without a visual scroll event.
- **Acceptance (qa-mobile):** RN a11y lint passes with zero warnings; every regulated control has role+label+state asserted in a test; the scroll-gate-with-reader test passes; no `accessibilityLabel` is hardcoded English (assert it resolves through `t()`).

### 5.3 Manual / certified

- Per release: VoiceOver (iOS) + TalkBack (Android) + NVDA (web) manual pass on the regulated flows; record in the ACR (§1.4).
- Annual external certified audit (RBI expectation) producing a signed ACR.
- At least one **PwD usability session** per major release on the KYC/loan flow (RBI expectation).

---

## 6. Remediation priority (regulated surfaces first)

| Priority | Items |
|---|---|
| **Blocker (fix before next regulated GA)** | KFS-1, CON-1 (screen-reader scroll-gate trap on legal acknowledgement screens) |
| **High** | KFS-2, KFS-3, KFS-6, OTP-1, PAN-1, PAN-2, DPDP-1, DPDP-2, ELG-1, X-1, X-2, X-5 |
| **Medium** | KFS-4, CON-2..5, OTP-2/3, PAN-3..5, DPDP-3..6, ELG-2..4, X-3, X-4 |
| **Low** | KFS-5, OTP-4 |

**Owners:** mobile-dev (mobile screens), frontend-dev (admin/web), qa-mobile + qa-web (CI gates §5), ui-ux-agent (assisted-KYC entry spec §3.3 follow-up), security-reviewer (ACR publication §1.4).

> **Hard constraint shared with Task B:** the design-elevation pass (`design-elevation-spec.md`) must **never regress** any item in this document. The canonical semantic-text tokens in §4 are inputs to the elevation token set, and every elevated screen must keep its `accessibilityRole`/label/state and ≥44pt targets.
