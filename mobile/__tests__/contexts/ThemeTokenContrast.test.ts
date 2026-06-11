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
    ['#FFFFFF', tk.errorCta, 4.5, 'white on errorCta (destructive)'],
    // Module accents used as text on plain surfaces
    [tk.gstAccent, tk.raised, 4.5, 'gstAccent text on raised'],
    [tk.itrAccent, tk.raised, 4.5, 'itrAccent text on raised'],
    [tk.loanAccent, tk.raised, 4.5, 'loanAccent text on raised'],
    // Status foregrounds also used as icon/text accents on plain surfaces
    [tk.errorFg, tk.raised, 3.0, 'errorFg on raised (icon/UI)'],
    [tk.successFg, tk.raised, 3.0, 'successFg on raised (icon/UI)'],
    [tk.warningFg, tk.raised, 3.0, 'warningFg on raised (icon/UI)'],
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
