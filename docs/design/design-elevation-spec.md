# SnapAccount Design Elevation Spec — "Ultra Max Pro" Polish

> **Status:** Specification. Team-lead directive #19 (UX-PRO): take admin + mobile to flagship polish.
> **Owner:** ui-ux-agent (spec) · frontend-dev (admin) · mobile-dev (mobile) · qa-web / qa-mobile (acceptance).
> **Hard constraint:** Polish must **never regress WCAG 2.1 AA** (`accessibility-standard.md`). Every token, contrast, target-size, and a11y decision in that document is binding here. Where this spec and the a11y spec touch the same token, the a11y rule wins.
> **Grounding:** token values, dark-mode adoption, and screen structure below were read from the live codebase on branch `2026-06-10-s5t4` (`src/admin/src/styles/globals.css`, `mobile/src/constants/colors.ts`, `mobile/src/contexts/ThemeContext.tsx`, `docs/design/tokens.json`, screen sources). No application code modified.

---

## 1. Design-token audit & canonical set

### 1.1 What's actually in the codebase today

Three token sources are partially out of sync:

- `docs/design/tokens.json` — the declared design system (audited at v2.0.0; **now v2.1.0** after WP-T3 added semantic `text.*`, `display.*`, and named `elevation.*`).
- `mobile/src/constants/colors.ts` — RN runtime `Colors` object.
- `src/admin/src/styles/globals.css` — Tailwind v4 `@theme` custom properties + `.dark` overrides.

### 1.2 Inconsistencies found (grounded)

| # | Token | tokens.json | mobile colors.ts | admin globals.css `@theme` | Canonical decision |
|---|---|---|---|---|---|
| T-1 | **success scale** | Emerald (`500 #10B981`, `600 #059669`) | Emerald (matches tokens.json) | **Green (`500 #22C55E`, `600 #16A34A`, `700 #15803D`)** — diverges | **Adopt Emerald** (`#10B981/#059669/#047857`) everywhere. Admin `@theme` success-* must be rewritten. *(Caveat: success[600] #059669 ≈3.5:1 on white — per a11y §4, use success[700] #047857 for body text.)* |
| T-2 | **accent scale** | Orange (`500 #F97316`) | Orange (`500 #F97316`) | **Amber (`500 #F59E0B`)** — diverges (comment says "Saffron/Amber") | **Decision required, then canonicalize.** Recommend **Orange `#F97316`** as accent (matches 2/3 sources + `module.loan`), and keep Amber strictly as the **warning** semantic. Admin currently conflates accent≈warning (both amber) — separate them. |
| T-3 | **radius scale** | `sm 6 / md 8 / lg 12 / xl 16 / 2xl 20 / 3xl 24` | (uses raw px in StyleSheets, mostly 8/12/16) | `sm 4 / md 8 / lg 12 / xl 16 / 2xl 20` (no 3xl) | **Adopt tokens.json** (`sm=6`). Admin `--radius-sm` must change 4→6; add `--radius-3xl: 24`. Mobile must stop hardcoding px and map to the scale. |
| T-4 | **success contrast** | n/a | n/a | success-500 used as text in badges | Body/label text on white must use `success-700`; `success-500/600` for fills/icons/large only (a11y §4 rule 3). |
| T-5 | **module.loan** | `#EA580C` (orange-600) | `#EA580C` | `--color-loan: #D97706` (amber-600) | **Adopt `#EA580C`** (orange) — consistent with accent decision T-2. |
| T-6 | **neutral text usage** | scale defined | scale defined | scale defined | Add **semantic text tokens** (below) so screens stop reaching for raw `neutral[400]` as body text (a11y §4 rule 1). |
| T-7 | **fontFamily** | `System` (mobile), `Inter` + Noto Devanagari/Bengali (admin) | System | Inter + Noto | Keep platform-appropriate families; **canonical rule:** both must include Devanagari + Bengali fallbacks (admin does; mobile relies on System which covers it — document it). |
| T-8 | **shadow/elevation** | `xs..xl` with slate tint | RN screens hardcode `shadowColor:'#0F172A'`, ad-hoc opacities | `--shadow-xs..xl` slate-tinted (matches) | **Adopt tokens.json shadow scale**; mobile must map to 5 named elevations, not ad-hoc per-screen shadow objects (found in KFS `section`, privacy `navCard`, etc.). |
| T-9 | **type ramp** | `xs 11 … 4xl 36` with line-heights | screens hardcode `fontSize` (e.g. 28, 38 in KFS hero) off-scale | admin uses Tailwind text-* | **Adopt tokens.json ramp** as the only ladder. Off-scale sizes (heading 28, APR 38) become named display tokens (below) rather than magic numbers. |

### 1.3 Canonical token set (the source of truth after this pass)

**Colors** = `tokens.json` (now **v2.1.0** — WP-T3 landed; semantic `text.*`, `display.*`, named `elevation.*` added additively) **with these corrections applied to admin `globals.css`**: success→Emerald (T-1), accent→Orange + warning stays Amber (T-2), `--radius-sm: 6px` + add `--radius-3xl: 24px` (T-3), `--color-loan: #EA580C` (T-5). *(tokens.json already held the canonical values for T-1/T-2/T-3/T-5 at v2.0.0; only admin `globals.css` diverged.)*

**New semantic text tokens** (add to all three sources; resolves a11y §4 + T-6):

| Semantic token | Light value | Dark value | Use |
|---|---|---|---|
| `text.primary` | neutral-900 `#0F172A` | neutral-50 `#F8FAFC` | headings, primary body |
| `text.secondary` | neutral-600 `#475569` | neutral-400 `#94A3B8` | secondary body, captions that convey meaning (≥4.5:1) |
| `text.tertiary` | neutral-500 `#64748B` | neutral-500 `#64748B` | least-emphasis meaningful text (still ≥4.5:1 on its surface) |
| `text.disabled` | neutral-400 `#94A3B8` | neutral-600 `#475569` | disabled only |
| `text.onBrand` | `#FFFFFF` | `#FFFFFF` | text on brand fills |

> Rule: **`neutral-400` is `text.disabled` only.** No screen may use `neutral-400` for meaningful text (enforced by a11y §4 + the elevation lint, §5).

**New display type tokens** (replace magic font sizes):

| Token | Size / line-height / weight | Replaces |
|---|---|---|
| `display.hero` | 36 / 40 / 800 | one-off 36–38 hero numerals (KFS APR 38 → 36) |
| `display.title` | 28 / 34 / 800 | screen headings hardcoded at 28 |
| `display.section` | 20 / 28 / 700 | section titles |

**Elevation:** five named tokens (`elevation.0..4`) mapped to `tokens.json` `shadow.xs..xl`; mobile exposes them via the theme so dark mode can swap `shadowColor` to `#000000` (already in `DARK_TOKENS.shadowColor`).

### 1.4 Token work package (WP-T)

- **WP-T1 (frontend-dev):** rewrite `globals.css` `@theme` success-* (Emerald), separate accent(Orange)/warning(Amber), `--radius-sm: 6px`, add `--radius-3xl`, fix `--color-loan`, add semantic text tokens + display tokens. Regression-test snapshots.
- **WP-T2 (mobile-dev):** extend `Colors`/theme with semantic `text.*`, display tokens, and named `elevation.*`; codemod hardcoded `fontSize`/`borderRadius`/`shadow*` on regulated + high-traffic screens to tokens.
- **WP-T3 (ui-ux-agent):** ✅ **DONE** — `tokens.json` bumped to v2.1.0 (additive: `color.text.*`, `typography.display.*`, `elevation.*`; `_changelog` records canonical decisions + the IMS/MCA semantic-reuse rationale). This spec remains the decision record.
- **Acceptance:** zero raw hex in screen StyleSheets for colors covered by tokens; admin `@theme` success/accent/radius match tokens.json; a11y contrast gate (§a11y-5) still green.

---

## 2. Mobile dark-mode completion plan

### 2.1 Current state (grounded)

`ThemeContext.tsx` exists with `LIGHT_TOKENS`/`DARK_TOKENS` (canvas, raised, sunken, text*, brand, border, inputBg, skeleton, shadow) and system-follow + manual override + backend sync. **But only 2 of ~63 screens consume it** (`ChatListScreen`, `ChatDetailScreen`). 61 screens import the static `Colors` object and are **light-only** — they render with hardcoded light surfaces in dark mode (white cards on a dark nav = broken, eye-searing).

### 2.2 Enumeration of legacy (non-themed) screens to migrate

By module (all currently importing `constants/colors` directly, no `useTheme`):

- **loans/** — `LoanHubScreen`, `LoanEligibilityScreen`, `LoanApplicationScreen`, `LoanStatusScreen`, `LoanPackagePreviewScreen`, `LoanConsentScreen`, `KeyFactsStatementScreen`; **loan/** `EMICalculatorScreen`
- **gst/** — `GstDashboardScreen`, `Gstr3bScreen`, `GstApprovalScreen`, `GstNilReturnConfirmScreen`, `GstNoticeInboxScreen`, `GstNoticeDetailScreen`
- **itr/** — `ItrDashboard*` / `EVerificationScreen` (and the rest of `itr/`)
- **home/** — `HomeScreen`, `FinancialReportsListScreen`, `ReportDetailScreen`
- **callbacks/** — `CallbackStatusScreen`, `RequestCallbackModalScreen`
- **auth/** — `SplashScreen`, `OTPVerifyScreen`, `PasswordAuthScreen`, `TwoFactorChallengeScreen`, `AcceptInviteScreen`, `BusinessProfileWizardScreen`, `IndividualProfileWizardScreen`, `LanguageSelectionScreen`, `PermissionRequestsScreen`
- **profile/** — `PrivacyCenterScreen`, `MyConsentsScreen`, and the profile/settings set
- **notifications/**, **documents/**, **team/** — remaining screens

> Run `grep -rl "constants/colors" mobile/src/screens` to regenerate the exact list before each slice; it is the definitive backlog (61 files at audit time).

### 2.3 Token mapping (static `Colors.*` → theme token)

| Static usage pattern | Theme token | Notes |
|---|---|---|
| `Colors.bg.base` / screen `backgroundColor` | `tokens.canvas` | light `#F8FAFC` / dark `#0F172A` |
| `Colors.surface.default` (cards, headers, footers) | `tokens.raised` | light `#FFFFFF` / dark `#1E293B` |
| `Colors.neutral[50/100]` sunken rows / `Colors.bg.subtle` | `tokens.sunken` | |
| `Colors.neutral[900]` text | `tokens.textPrimary` | |
| `Colors.neutral[600/700]` body | `tokens.textSecondary` | (≥4.5:1 in both themes) |
| `Colors.neutral[400/500]` meaningful caption | `tokens.textTertiary` | **never** `text.disabled` for meaningful text |
| `Colors.neutral[100/200]` borders/dividers | `tokens.border` | light `#E2E8F0` / dark `#334155` |
| input `backgroundColor` | `tokens.inputBg` | |
| `Colors.brand[500]` | `tokens.brand500` | dark lifts to `#818CF8` for contrast on dark bg |
| `Colors.brand[400]` accents | `tokens.brand400` | |
| skeleton shimmer colors | `tokens.skeleton1/2` | |
| `shadowColor:'#0F172A'` | `tokens.shadowColor` | dark → `#000000` |

**Tints (brand[50], success[50], warning[50], error[50]) need dark variants.** `ThemeContext` currently lacks tinted-surface tokens — extend `ThemeTokens` with: `brandTint`, `successTint`, `warningTint`, `errorTint`, `successFg`, `warningFg`, `errorFg`, `brandFg` (foreground-on-tint). Dark values use the 900/950 shade as the tint bg and a lifted 300/400 shade as foreground, validated ≥4.5:1. This is the single biggest gap — every regulated card (KFS APR hero, net-disbursal card, cooling-off, privacy intro) uses a `*[50]` tint with a `*[700]` foreground that is invisible/illegible in dark mode.

### 2.4 Dark-mode work packages (WP-D), ordered by risk

- **WP-D0 (mobile-dev):** extend `ThemeContext.ThemeTokens` with tint + tint-foreground tokens (§2.3) and named `elevation.*`; add light+dark values; unit-test contrast of every dark pair (gate before any screen migration so screens migrate onto a complete token set).
- **WP-D1 — Regulated first (highest visibility, compliance-adjacent):** KFS, LoanConsent, LoanEligibility, PrivacyCenter, MyConsents, OTPVerify, PAN/KYC. *(These are also a11y-audited — migrate carefully so no `accessibilityRole`/label/state is lost.)*
- **WP-D2 — Money dashboards (the directive's named screens):** `GstDashboardScreen`, `LoanHubScreen`, `ItrDashboard*`, `HomeScreen`, financial reports.
- **WP-D3 — Auth/onboarding:** Splash, OTP, 2FA, wizards, language, invite (pairs with §4 onboarding delight).
- **WP-D4 — Remainder:** callbacks, notifications, documents, team, profile/settings.
- **Acceptance per slice (qa-mobile):** screen renders correctly in light + dark + system; no hardcoded `#FFFFFF`/`#0F172A`/`Colors.*` surfaces remain; tint cards legible in dark (≥4.5:1); snapshot tests in both themes; a11y labels/roles intact (cross-check against `accessibility-standard.md`).

---

## 3. Interaction-polish standards

A single house standard so every screen feels coherent. Defaults below; deviations must be justified.

### 3.1 Skeleton loading
- **Standard:** every data-backed screen shows a skeleton matching the final layout's shape (card/list/table silhouette), not a centered spinner, for loads > 200ms. Shimmer uses `skeleton1`/`skeleton2` theme tokens (admin already has `.skeleton-shimmer`; mobile has skeleton tokens — both must be used consistently).
- **Fix targets:** KFS uses a bare `ActivityIndicator` (replace with a KFS-shaped skeleton); dashboards/lists must skeleton their cards/rows.
- **Reduce-motion:** disable shimmer animation when `prefers-reduced-motion` / `AccessibilityInfo.isReduceMotionEnabled` — show a static placeholder (a11y 2.3.3).

### 3.2 Empty states (every list page)
- **Standard:** every list/table has a designed empty state = illustration/icon + one-line headline + one-line guidance + a primary CTA when an action is possible (e.g. "No loan applications yet → Start an application"). Never a blank screen or raw "No data".
- **Targets:** loans list, GST notice inbox, callbacks, MyConsents, corrections, documents, chat, notifications.
- Distinguish **empty** (no data yet) from **filtered-empty** (no results for filter — offer "clear filters") from **error** (§3.6).

### 3.3 Micro-interactions & haptics map (mobile)
Use `expo-haptics`, consistently (KFS already uses `selectionAsync` on scroll-gate — make it the rule):

| Event | Haptic | Visual |
|---|---|---|
| Scroll-gate satisfied (KFS/consent) | `selectionAsync` | scroll hint fades, checkbox enables |
| Checkbox / toggle | `selectionAsync` | check animates in |
| Primary action success (consent signed, export requested) | `notificationAsync(Success)` | success toast / inline confirm |
| Destructive confirm (withdraw consent, delete) | `notificationAsync(Warning)` | — |
| Error (verify failed, network) | `notificationAsync(Error)` | inline error + live region |
| Pull-to-refresh release | `impactAsync(Light)` | spinner |
| Tab switch / nav | none (avoid haptic spam) | — |

> Respect a system "reduce haptics" / low-power state where detectable; haptics are additive, never the only feedback.

### 3.4 Celebration moments
- **Loan disbursed / approved:** a tasteful one-shot celebration (the existing `CelebrationOverlay` in `components/loans/` — standardize it: confetti/lottie ≤1.5s, `notificationAsync(Success)`, dismissible, **respects reduce-motion** → static success state).
- **Other moments:** first business profile completed, first GST return filed, first document approved. Keep rare — celebration inflation kills delight.

### 3.5 Pull-to-refresh
- **Standard:** every scrollable data screen supports pull-to-refresh (`RefreshControl`) wired to the same query's `refetch`, tinted `brand500` (theme token). Admin equivalent: a visible "Refresh" affordance (dashboard already has one) + `isFetching` state.

### 3.6 Error-state recovery UX
- **Standard:** errors are **recoverable, specific, and announced.** Pattern = icon + plain-language cause + a primary "Try again" (re-runs the query) + a secondary escape (go back / get help). Never a dead-end Alert with only "OK".
- KFS/consent already do this well (offline/integrity/malformed states) — promote that pattern app-wide.
- Network errors offer the **assisted-callback** escape on regulated flows (ties to a11y §3).
- All error copy via `t()` (en/hi/bn); errors announced via live region (a11y 4.1.3).

---

## 4. Information-hierarchy redesign

### 4.1 Admin dashboard (`src/admin/.../dashboard/DashboardPage.tsx`)
Current: a flat row of `MetricCard`s + activity chart + chat-queue/team-workload/audit sections (some still mocked). Redesign for **scannability + progressive disclosure**:

1. **Tier 1 — "Needs attention now" band (top).** Promote only the metrics that imply an action: `gstReturnsDueToday` (urgent if >0), `pendingDocuments` (urgent over threshold), `openCallbacks`, overdue loan reviews. Urgent cards get the `warning`/`error` semantic treatment + a direct CTA ("Review 12 docs →"). Calm (non-actionable) metrics demote to a secondary strip.
2. **Tier 2 — operational KPIs** (active loans, ITR pending) as a compact stat strip, not equal-weight hero cards.
3. **Tier 3 — trends & queues** (activity chart, chat queue, team workload) below the fold / in a tabbed or collapsible region (progressive disclosure) so the top of the page is decision-ready.
4. **Visual hierarchy:** one clear primary number per card using `display.hero`/`display.section`; supporting context in `text.secondary`; consistent `elevation.1` cards; period switcher (`7D/30D/90D`) scoped to the trends region, not the whole page.
5. **Honesty:** keep the existing "render a dash, never fabricate" rule for failed/unavailable metrics; mocked sections (activity/chat/workload — STATIC-DATA-DEBT-7) get a subtle "sample data" affordance until wired (NEW-D04 / dashboard wiring).
6. **A11y:** KPI cards are `role="group"` with an accessible name = "label, value, status"; urgent state not conveyed by colour alone (icon + word). Tabs/collapsibles follow a11y ELG-1 ARIA pattern.

### 4.2 Mobile onboarding delight pass
Surfaces: Splash → Language → OTP → Persona → Profile wizards → first home.
- **Progressive, low-friction:** one decision per screen, clear progress (stepper with `accessibilityValue`), never ask for PAN/GSTIN before explaining why.
- **Delight, tastefully:** a warm branded splash, a friendly "Welcome" after first profile completion (celebration §3.4), smooth shared-element-ish transitions (respect reduce-motion).
- **Trust signals on regulated steps:** the existing KFS/consent "lock" trust banners pattern, surfaced early ("Your PAN is encrypted, never shared without consent").
- **Accessible & assisted:** the **assisted-KYC entry** (a11y §3) appears on OTP/KYC onboarding steps as a first-class, accessible affordance — onboarding delight includes "never stuck".
- **Indic-ready:** all onboarding copy en/hi/bn with the +30–40% expansion rule; no clipped buttons/labels at hi/bn length.

---

## 5. Implementation work packages (ordered, with acceptance criteria)

Ordered so tokens land first (everything depends on them), dark mode and polish build on the canonical set, and **nothing regresses a11y**.

| Slice | Title | Owner | Depends on | Acceptance criteria |
|---|---|---|---|---|
| **S0** | Canonical tokens (WP-T1/T2) | frontend-dev + mobile-dev | — | Admin `@theme` success=Emerald, accent=Orange/warning=Amber separated, `--radius-sm:6`, `--radius-3xl` added, `--color-loan:#EA580C`; semantic `text.*` + `display.*` tokens added to admin + mobile; tokens.json bumped (WP-T3, ui-ux-agent). No raw hex for tokenized colors in changed files. a11y contrast gate green. |
| **S1** | Dark-mode token foundation (WP-D0) | mobile-dev | S0 | `ThemeTokens` extended with tint + tint-fg + `elevation.*`; light+dark values; unit test asserts every dark pair ≥4.5:1 (text) / ≥3:1 (UI). |
| **S2** | Dark mode — regulated screens (WP-D1) | mobile-dev | S1, a11y blockers KFS-1/CON-1 not regressed | KFS/Consent/Eligibility/Privacy/MyConsents/OTP/PAN render correct in light+dark+system; tint cards legible in dark; a11y roles/labels/state preserved (diff-checked vs `accessibility-standard.md`); snapshot tests both themes. |
| **S3** | Interaction polish — skeletons + empty + error (§3.1/3.2/3.6) | frontend-dev + mobile-dev | S0 | Every audited list/data screen has shaped skeleton, designed empty state, recoverable error state; all copy via `t()`; reduce-motion respected; errors announced (live region). |
| **S4** | Micro-interactions, haptics, pull-to-refresh, celebration (§3.3/3.4/3.5) | mobile-dev | S2 | Haptics map applied consistently; `CelebrationOverlay` standardized + reduce-motion safe; pull-to-refresh on all data screens (brand-tinted); no haptic on nav/tab. |
| **S5** | Admin dashboard hierarchy redesign (§4.1) | frontend-dev | S0, S3 | 3-tier hierarchy live; urgent metrics actionable + not colour-only; trends/queues progressively disclosed; failed metrics show dash; mocked sections flagged; axe + keyboard a11y green (ELG-1 tabs pattern). |
| **S6** | Mobile onboarding delight (§4.2) | mobile-dev | S0, S1, S4 | Onboarding flow polished, progress accessible, trust signals + assisted-KYC entry present, en/hi/bn no-clip, reduce-motion safe. |
| **S7** | Dark mode — dashboards + remainder (WP-D2/D3/D4) | mobile-dev | S2 | All remaining 61-screen backlog migrated off static `Colors` surfaces; CI lint forbids raw light-surface hex in screens; both-theme snapshots. |

### 5.1 Global acceptance / non-regression gates (qa-web + qa-mobile)
1. **A11y never regresses:** the axe-web and RN-a11y-lint gates from `accessibility-standard.md` §5 stay green on every slice; no `accessibilityRole`/`accessibilityLabel`/`accessibilityState`/≥44pt target removed.
2. **Contrast:** every new/changed token pair (light **and** dark) validated ≥4.5:1 text / ≥3:1 UI (a11y §4).
3. **No magic values:** changed StyleSheets/classNames use canonical color/spacing/radius/type/elevation tokens — CI lint flags raw hex and off-scale font sizes in touched screens.
4. **i18n:** no new hardcoded user-facing or a11y strings; en/hi/bn parity; Indic strings don't clip (+30–40% rule).
5. **Reduce-motion / reduce-haptics** honored for every animation, shimmer, celebration, and haptic added.

---

## 6. Relationship to the accessibility standard

This spec **consumes** `accessibility-standard.md` as a hard constraint:
- Its §4 contrast/token rules are the **inputs** to S0's canonical text tokens.
- Its blockers (KFS-1, CON-1 scroll-gate) must be fixed/preserved during the S2 dark-mode migration of those exact screens.
- Its assisted-KYC alternative (§3) is surfaced by S6 onboarding and S3 error-recovery.
- Polish that improves visuals but lowers contrast, removes a11y semantics, shrinks targets below 44pt, or English-hardcodes copy is **rejected at review** — delight and conformance ship together.
