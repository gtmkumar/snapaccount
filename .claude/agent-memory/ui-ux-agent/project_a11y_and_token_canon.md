---
name: a11y standard + canonical token decisions (GAP-103 / UX-PRO)
description: Adopted a11y standard, the recurring a11y root causes, and the canonical token corrections to apply across web+mobile
metadata:
  type: project
---

Two design-system-wide decisions recorded 2026-06-11. Specs:
`docs/design/accessibility-standard.md` and `docs/design/design-elevation-spec.md`.

**Accessibility (GAP-103) — legally mandatory, not polish.**
- Adopted standard: **WCAG 2.1 AA + IS 17802** (India). Conformance statement template + CI gates (axe-core in vitest/jsdom for admin; `eslint-plugin-react-native-a11y` + RTL role/label/state tests for mobile). Regulated surfaces (loan/KFS/consent/KYC/DPDP) = High; rest = Medium.
- **Two real Blockers found:** KFS (`KeyFactsStatementScreen.tsx`) and LoanConsent scroll-gates only flip on a visual `onScroll` event — a screen-reader user navigating element-by-element can never satisfy the legal-acknowledgement gate. Fix: when `AccessibilityInfo.isScreenReaderEnabled`, treat reaching the last accessible element (or an explicit end-of-doc affordance) as satisfying the gate.
- **Recurring root cause #1:** `neutral[400]` (#94A3B8) used as *meaningful* text everywhere (KFS meta, OTP note, consent version, hints) — ~2.6:1 on white, fails 1.4.3. RULE: `neutral[400]` = disabled/decorative ONLY; meaningful secondary text ≥ `neutral[500]` (#64748B ≈4.6:1).
- **Recurring root cause #2:** hardcoded English a11y/status strings (`PanInput.tsx`, "View full contact →") — violates i18n + IS 17802 language parity. All AT-visible strings via `t()` (en/hi/bn).
- **success[600] #059669 ≈3.5:1 on white — NOT a body-text color.** Use success[700] #047857 for text; 500/600 for fills/icons/large only.
- **Accessible KYC alternative** = voice/assisted-callback path reusing CallbackService (`ASSISTED_KYC` reason code); entry affordance must be the most accessible element on every OTP/KYC screen, offered up-front (not after failed OTPs). Equivalent verified outcome + same consent audit records (channel=ASSISTED).

**Canonical token corrections (admin globals.css diverges from tokens.json / mobile):**
- `success`: admin `@theme` is Green (#22C55E) — WRONG. Canonical = Emerald (#10B981/#059669/#047857).
- `accent`: admin is Amber (#F59E0B); tokens.json + mobile are Orange (#F97316). Decision: accent=Orange, warning stays Amber (admin conflates them — separate).
- `radius.sm`: admin=4px, canonical (tokens.json)=6px. Also add `--radius-3xl: 24`.
- `module.loan`: admin `--color-loan` #D97706 (amber) — canonical #EA580C (orange).
- Add semantic `text.*` (primary/secondary/tertiary/disabled/onBrand) + `display.*` (hero/title/section) tokens to stop magic font sizes (KFS hero=38, headings=28) and raw `neutral[400]`.

**Mobile dark mode:** `ThemeContext.tsx` exists (LIGHT/DARK token maps, system-follow + override + backend sync) but only **2 of ~63 screens** consume it (ChatList, ChatDetail). 61 screens import static `Colors` = light-only/broken in dark. Biggest gap: ThemeTokens lacks **tinted-surface tokens** (brand[50]/success[50] cards w/ 700-shade fg are illegible in dark) — must add tint + tint-foreground before migrating screens. Regenerate backlog with `grep -rl "constants/colors" mobile/src/screens`.

**Why:** RBI/SC/SEBI 2025 make a11y legally required for lending platforms; team-lead directed a flagship polish pass. Polish must NEVER regress WCAG 2.1 AA — a11y §4 token rules are the inputs to the elevation canonical token set. See [[project_phase7_compliance_flows]] and [[project_indic_typography]].
