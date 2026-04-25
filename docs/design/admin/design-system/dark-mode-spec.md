# Dark Mode Specification (Phase 6F)

> Phase 6F · Track F1 · Owner: ui-ux-agent → frontend-dev (admin) + mobile-dev (mobile mirrors via separate spec).

## 1. Purpose
Activate the previously seeded dark token set across every admin surface, with persisted user preference, system-following default, and zero visual regressions in either theme. WCAG AA contrast for all text + UI; meaningful focus rings retained.

## 2. User goal
"I work nights and bright UI hurts my eyes. I want a one-click toggle that remembers my choice across reloads and devices, and never makes critical disclaimers (loan, ITR) hard to read."

## 3. Token mapping

Tokens are defined as CSS custom properties on `:root` (light) and `:root[data-theme='dark']` (dark). Components MUST reference tokens via `var(--token)` — no hard-coded hex. NativeWind mirror is documented in `docs/design/mobile/ux/dark-mode-mobile.md`.

### 3.1 Surface / background
| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-canvas` | `slate.50` `#F8FAFC` | `slate.950` `#020617` | Page background |
| `--surface-raised` | `white` `#FFFFFF` | `slate.900` `#0F172A` | Cards, modals, drawers |
| `--surface-sunken` | `slate.100` `#F1F5F9` | `slate.800` `#1E293B` | Inputs, table headers |
| `--surface-overlay` | `slate.900/60` | `slate.950/80` | Modal scrim |
| `--surface-inverse` | `slate.900` | `slate.50` | Tooltips, snackbars |

### 3.2 Border
| Token | Light | Dark |
|---|---|---|
| `--border-subtle` | `slate.200` `#E2E8F0` | `slate.800` `#1E293B` |
| `--border-default` | `slate.300` `#CBD5E1` | `slate.700` `#334155` |
| `--border-strong` | `slate.400` `#94A3B8` | `slate.600` `#475569` |
| `--border-focus` | `indigo.500` `#6366F1` | `indigo.400` `#818CF8` |

### 3.3 Text
| Token | Light | Dark | Min size | Contrast |
|---|---|---|---|---|
| `--text-primary` | `slate.900` `#0F172A` | `slate.50` `#F8FAFC` | any | 17.4 / 17.4 |
| `--text-secondary` | `slate.600` `#475569` | `slate.300` `#CBD5E1` | 14px | 7.6 / 11.2 |
| `--text-tertiary` | `slate.500` `#64748B` | `slate.400` `#94A3B8` | 16px | 4.83 / 7.2 |
| `--text-disabled` | `slate.400` `#94A3B8` | `slate.500` `#64748B` | n/a | non-interactive |
| `--text-inverse` | `white` | `slate.900` | any | n/a |
| `--text-link` | `indigo.600` | `indigo.400` | 14px | 5.0 / 5.4 |

### 3.4 Brand
| Token | Light | Dark |
|---|---|---|
| `--brand-50` | `indigo.50` | `indigo.950` |
| `--brand-100` | `indigo.100` | `indigo.900` |
| `--brand-500` (primary) | `indigo.500` `#6366F1` | `indigo.400` `#818CF8` |
| `--brand-600` (hover) | `indigo.600` `#4F46E5` | `indigo.300` `#A5B4FC` |
| `--brand-on-primary` | `white` | `slate.950` |

Dark-mode brand intentionally lifts from 500→400 to maintain contrast on dark surfaces (4.7:1 against `--surface-raised`).

### 3.5 Semantic
| Role | Light bg/fg | Dark bg/fg | Notes |
|---|---|---|---|
| success | `emerald.100` / `emerald.700` | `emerald.950` / `emerald.300` | Filings, refunds, approvals |
| warning | `amber.100` / `amber.800` | `amber.950` / `amber.300` | Due-soon, near-match |
| error | `rose.100` / `rose.700` | `rose.950` / `rose.300` | Rejected, overdue |
| info | `sky.100` / `sky.700` | `sky.950` / `sky.300` | Submitted, neutral status |
| accent | `indigo.100` / `indigo.700` | `indigo.950` / `indigo.300` | User-approved, responded |

All bg/fg pairs verified ≥ 4.5:1 for text and ≥ 3:1 for icons.

### 3.6 Module accents (preserved from redesign)
Each module color (Accounting=indigo, GST=teal, Loans=violet, ITR=emerald, Chat=amber, Reports=sky, Subscription=rose) gets a `--module-{name}-fg` and `--module-{name}-bg` pair. Dark-mode variants use 300/950 inverse.

### 3.7 Shadows
Dark-mode shadows replace `rgba(0,0,0,X)` with `rgba(0,0,0,Y)` where Y is **higher** (0.4 → 0.6) and we add a 1px border to compensate for reduced shadow visibility.

| Token | Light | Dark |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,0.06)` | `0 1px 2px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)` |
| `--shadow-md` | `0 4px 12px rgba(15,23,42,0.08)` | `0 4px 12px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)` |
| `--shadow-lg` | `0 12px 32px rgba(15,23,42,0.12)` | `0 12px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)` |

## 4. Toggle UX

### 4.1 Placement
Top-right of `AppShell` header, next to user avatar. 36×36 px icon button, sun/moon icon swap with 200ms cross-fade.

### 4.2 Three-state preference
1. **System** (default for new users) — follows `prefers-color-scheme`.
2. **Light** — forced.
3. **Dark** — forced.

Single click cycles light → dark → system → light. Long-press / right-click opens 3-radio menu for explicit selection. Current effective theme always announced via `aria-live="polite"` on change.

### 4.3 Persistence
- Local: `localStorage.snapaccount.theme = 'system'|'light'|'dark'`.
- Server: `PATCH /me/preferences { theme }` debounced 800ms after change. On login, server pref overrides local if newer.
- Set `data-theme="dark"` on `<html>` BEFORE first paint via blocking inline script in `index.html` to avoid flash-of-wrong-theme.

### 4.4 Smooth swap
Apply `transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease` to root + cards. Disable transitions for users with `prefers-reduced-motion`.

## 5. Per-component dark-mode behavior

| Component | Dark adjustment |
|---|---|
| `Button.primary` | bg `--brand-500` → `--brand-400`; hover `--brand-300`. Always `--brand-on-primary` text. |
| `Button.secondary` | bg `--surface-sunken`; border `--border-default`; text `--text-primary`. |
| `Button.ghost` | bg transparent → hover `--surface-sunken`. |
| `Input` | bg `--surface-sunken`; border `--border-default`; placeholder `--text-tertiary`. Focus ring uses `--border-focus` 2px outline. |
| `Card` | bg `--surface-raised`; border `--border-subtle`; shadow `--shadow-sm`. |
| `Modal/Dialog` | bg `--surface-raised`; scrim `--surface-overlay`; close button `--text-secondary`. |
| `Drawer` | same as Modal; with `--shadow-lg`. |
| `Toast` | success/info/warn/error each pick semantic dark pair. ARIA live polite. |
| `StatusBadge` | uses semantic 950/300 dark pairs; icon + text never color-only. |
| `DataTable` | header bg `--surface-sunken`; row hover `--surface-sunken/60`; selected row `--brand-950` with `--brand-300` left border. |
| `Skeleton` | shimmer gradient: `slate.800 → slate.700 → slate.800` in dark; `slate.100 → slate.50 → slate.100` in light. Animation respects reduced-motion. |
| `EmptyState` | illustration uses currentColor + `--text-tertiary` accents; never raster art that breaks in dark. |
| `Tabs` | active tab border `--brand-400` (dark) / `--brand-600` (light); inactive `--text-secondary`. |
| `Stepper` | completed `--success-300`; current `--brand-400`; upcoming `--border-default`. |
| `PdfViewer` | canvas bg `--surface-raised`; controls bar `--surface-sunken`. PDF pages remain white (don't invert document content); add 8px padding ring around page. |
| `Charts` (RegimeBarChart, MRR dashboard) | grid lines `--border-subtle`; axis labels `--text-secondary`; series colors picked from a dark-safe palette (lifted saturation). |
| `CelebrationOverlay` | confetti palette swaps to higher-luminance tones; backdrop `--surface-canvas` + 0.92 opacity. |
| `LoanDisclaimerCard` / `ITR notice copy` | tone preserved; verify body text `--text-primary` ≥ 14px against bg pair (warning bg test = 5.4:1 dark, 4.6:1 light). |

## 6. Legal copy verification (dark)
Every disclaimer + legal block from prior phases (Loan Hub disclaimer, ITR consent, GST notice fields, Subscription terms) MUST be rendered against `--surface-raised` AND `--surface-sunken` in dark and screenshotted by qa-web. Acceptance: ≥ 4.5:1 contrast + no semantic color reversal (red stays warning, green stays positive — never invert).

## 7. Empty / loading / error
- Loading: skeletons use dark tokens; spinner `--brand-400` on `--surface-canvas`.
- Empty: illustration adapts via currentColor.
- Error: error toast with `error.950` bg + `error.300` fg; retry button uses semantic error border.

## 8. i18n keys
- `theme.toggle.label` (en: "Toggle theme", hi: "थीम बदलें", bn: "থিম পরিবর্তন")
- `theme.toggle.system` ("System default" / "सिस्टम डिफ़ॉल्ट" / "সিস্টেম ডিফল্ট")
- `theme.toggle.light` ("Light")
- `theme.toggle.dark` ("Dark")
- `theme.announce.changed` ("Theme changed to {{theme}}")

## 9. Accessibility
- Toggle button: `aria-label`, `aria-pressed` reflecting effective theme; `aria-haspopup="menu"` on long-press menu.
- Theme change announced via offscreen live region ("Theme changed to dark").
- All focus rings use `--border-focus` at 2px offset; never removed for dark mode.
- `prefers-reduced-motion`: theme transition collapses to 0ms.
- Color is never the sole channel: icons, text labels, prefixes (+/-) accompany every status color.

## 10. Responsive
Theme toggle: full icon button at ≥ 768px; collapses into user-menu dropdown at < 768px.

## 11. QA checklist (handed to qa-web)
- [ ] No flash of wrong theme on cold load (any page).
- [ ] Toggle reflects on every open tab in same session within 1s (BroadcastChannel sync).
- [ ] All Phase 6A–E pages screenshotted in both themes — diff log to `docs/design/screenshots/phase-6f-dark/`.
- [ ] WCAG AA verified for every text/bg pair (axe-core scan).
- [ ] Print stylesheet always uses light tokens.
