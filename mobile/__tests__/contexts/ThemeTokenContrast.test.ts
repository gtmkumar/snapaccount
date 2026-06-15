/**
 * ThemeTokenContrast — S1 gate of docs/design/design-elevation-spec.md (WP-D0).
 *
 * Asserts every tint-foreground / tint-surface pair in BOTH light and dark
 * token sets meets WCAG 2.1 AA: ≥4.5:1 for text pairs, ≥3:1 for UI pairs
 * (accessibility-standard.md §4 is binding — the a11y rule wins over visuals).
 */

import {
  LIGHT_TOKENS,
  DARK_TOKENS,
  type ThemeTokens,
} from '../../src/contexts/ThemeContext';

// ── WCAG relative luminance + contrast ratio ─────────────────────────────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── Pairs under test ─────────────────────────────────────────────────────────

/** [foreground, background, minimum ratio, description] */
function textPairs(tk: ThemeTokens): [string, string, number, string][] {
  return [
    // Tinted regulated cards (KFS APR hero, net-disbursal, cooling-off, privacy intro)
    [tk.brandFg, tk.brandTint, 4.5, 'brandFg on brandTint'],
    [tk.successFg, tk.successTint, 4.5, 'successFg on successTint'],
    [tk.warningFg, tk.warningTint, 4.5, 'warningFg on warningTint'],
    [tk.errorFg, tk.errorTint, 4.5, 'errorFg on errorTint'],
    [tk.infoFg, tk.infoTint, 4.5, 'infoFg on infoTint'],
    // Core text on surfaces
    [tk.textPrimary, tk.canvas, 4.5, 'textPrimary on canvas'],
    [tk.textPrimary, tk.raised, 4.5, 'textPrimary on raised'],
    [tk.textSecondary, tk.canvas, 4.5, 'textSecondary on canvas'],
    [tk.textSecondary, tk.raised, 4.5, 'textSecondary on raised'],
    // Solid CTAs
    [tk.textOnBrand, tk.brandCta, 4.5, 'textOnBrand on brandCta'],
    // S4 chat contrast fix: own-message bubble fill bumped brand500→brandCta
    // (brand500+white measured 4.27:1 in light — borderline AA).
    [tk.textOnBrand, tk.brandCta, 4.5, 'chat own-bubble text on brandCta fill'],
    [tk.textPrimary, tk.sunken, 4.5, 'chat other-bubble text on sunken fill'],
    ['#FFFFFF', tk.errorCta, 4.5, 'white on errorCta (destructive)'],
    // Module accents used as text on plain surfaces
    [tk.gstAccent, tk.raised, 4.5, 'gstAccent text on raised'],
    [tk.itrAccent, tk.raised, 4.5, 'itrAccent text on raised'],
    [tk.loanAccent, tk.raised, 4.5, 'loanAccent text on raised'],
    // Status foregrounds also used as icon/text accents on plain surfaces
    [tk.errorFg, tk.raised, 3.0, 'errorFg on raised (icon/UI)'],
    [tk.successFg, tk.raised, 3.0, 'successFg on raised (icon/UI)'],
    [tk.warningFg, tk.raised, 3.0, 'warningFg on raised (icon/UI)'],
    // WP-D1..D4: textOnBrand pairs with every solid status/module fill used by
    // the migrated screens (fills are lifted in dark, so the label flips dark).
    [tk.textOnBrand, tk.successFg, 4.5, 'textOnBrand on successFg fill'],
    [tk.textOnBrand, tk.warningFg, 4.5, 'textOnBrand on warningFg fill'],
    [tk.textOnBrand, tk.gstAccent, 4.5, 'textOnBrand on gstAccent fill'],
    [tk.textOnBrand, tk.itrAccent, 4.5, 'textOnBrand on itrAccent fill'],
    [tk.textOnBrand, tk.loanAccent, 4.5, 'textOnBrand on loanAccent fill'],
  ];
}

/** Non-text UI pairs — ≥3:1 (WCAG 1.4.11). */
function uiPairs(tk: ThemeTokens): [string, string, number, string][] {
  return [
    [tk.brand500, tk.canvas, 3.0, 'brand500 on canvas'],
    [tk.brandCta, tk.canvas, 3.0, 'brandCta fill on canvas'],
    [tk.errorCta, tk.canvas, 3.0, 'errorCta fill on canvas'],
  ];
}

describe.each([
  ['light', LIGHT_TOKENS],
  ['dark', DARK_TOKENS],
] as [string, ThemeTokens][])('%s tokens — WCAG contrast gate', (_mode, tk) => {
  it.each([...textPairs(tk), ...uiPairs(tk)])(
    '%#: %s on %s ≥ %s:1 (%s)',
    (fg, bg, min, label) => {
      const ratio = contrast(fg, bg);
      if (ratio < min) {
        throw new Error(`${label}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1, needs ≥ ${min}:1`);
      }
      expect(ratio).toBeGreaterThanOrEqual(min);
    },
  );

  it('elevation tokens expose the full named scale 0..4', () => {
    for (const key of ['elevation0', 'elevation1', 'elevation2', 'elevation3', 'elevation4'] as const) {
      expect(tk[key].shadowColor).toBe(tk.shadowColor);
      expect(tk[key].shadowOpacity).toBeGreaterThanOrEqual(0.04);
      expect(tk[key].elevation).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── tokens.json v2.1.0 — dark tertiary override ──────────────────────────────
// neutral-500 (#64748B) failed 3.07:1 on dark raised surfaces; dark tertiary is
// overridden to neutral-400 and therefore must stay readable as TEXT (≥4.5:1).
// In dark mode tertiary === secondary in colour — differentiate by weight/size.

describe('dark tokens — tertiary text override (tokens.json v2.1.0)', () => {
  it('dark textTertiary is #94A3B8 (neutral-400 override, not neutral-500)', () => {
    expect(DARK_TOKENS.textTertiary.toUpperCase()).toBe('#94A3B8');
  });

  it.each([
    [DARK_TOKENS.textTertiary, DARK_TOKENS.canvas, 'dark textTertiary on canvas'],
    [DARK_TOKENS.textTertiary, DARK_TOKENS.raised, 'dark textTertiary on raised'],
  ])('%s on %s ≥ 4.5:1 (%s)', (fg, bg, label) => {
    const ratio = contrast(fg, bg);
    if (ratio < 4.5) {
      throw new Error(`${label}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1, needs ≥ 4.5:1`);
    }
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
