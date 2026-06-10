---
name: hi/bn Indic typography & string-expansion convention
description: Reusable mobile design rule for Hindi/Bengali — line-height bump, +30-40% string expansion, numerals/grouping — applies to every screen spec
type: project
---

Mobile screen specs must accommodate Hindi (Devanagari) and Bengali script across all UI.

**The rule (apply to every mobile spec):**
- Hindi/Bengali translations run **+30–40% longer** than English. All label/body containers must wrap to 2–3 lines and grow vertically — never truncate regulatory/legal/consequence text. Two-column key/value grids: left label column uses flex min 40% / max 60% so long Hindi labels don't clip the value.
- Apply a **+2pt line-height bump** for `hi`/`bn` on `typography.fontSize.sm` (18→20) and `.base` (22→24) body/caption text — Devanagari/Bengali matras, reph, and stacked conjuncts get clipped at the English line-heights in tokens.json.
- Numeric values (amounts, %, APR) stay **Western Arabic numerals (0–9)** in all three locales (Indian financial convention) with **Indian digit grouping** (₹15,00,000) regardless of UI language; keep them LTR + `fontWeight.semibold`.
- Status chips / badges carry localized labels — reserve min-width and allow 2-line wrap on 375px devices rather than clipping.

**Why:** Indian financial UI ships en/hi/bn at parity (project i18n rule). Tokens.json line-heights are tuned for Latin; Indic scripts need extra vertical room. First codified in Phase 7 (KFS + Privacy Center specs).

**How to apply:** Reference this in the "hi/bn typography considerations" section of every new mobile screen spec instead of re-deriving it. Regulated text (consent descriptions, KFS cooling-off, fee bases) is server-supplied per language and versioned — client `t()` keys cover only chrome/labels.
