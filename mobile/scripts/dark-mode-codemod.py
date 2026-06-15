#!/usr/bin/env python3
"""
Dark-mode migration codemod (WP-D1..D4, design-elevation-spec §2).

Transforms a legacy screen/component that uses static `Colors` constants into
the ThemeContext pattern:
  - `const styles = StyleSheet.create({...})`
      → `const useStyles = createThemedStyles((tk: ThemeTokens) => StyleSheet.create({...}))`
  - `Colors.*` inside style sheets → `tk.*` (property-aware mapping, light-mode
    pixel-equivalent where the token set allows)
  - `Colors.*` elsewhere (JSX icon colors etc.) → `tokens.*`
  - inserts `const styles = useStyles();` / `const { tokens } = useTheme();`
    into top-level function components that need them
  - swaps the Colors import for the ThemeContext import

Anything it cannot map safely is left as `Colors.*` so tsc/eslint flag it for
manual follow-up. Usage: python3 scripts/dark-mode-codemod.py <file> [...]
"""
import re
import sys

# (prop-kind, token-path) -> tk token
# prop kinds: bg, fg, border, shadow
MAP = {
    'bg': {
        'bg.base': 'canvas', 'bg.subtle': 'sunken',
        'surface.default': 'raised', 'surface.raised': 'raised',
        'neutral[0]': 'raised', 'neutral[50]': 'canvas', 'neutral[100]': 'sunken',
        'neutral[200]': 'border', 'neutral[300]': 'border',
        'neutral[400]': 'textTertiary',
        'brand[50]': 'brandTint', 'brand[100]': 'brandTintBorder',
        'brand[200]': 'brandTintBorder', 'brand[300]': 'brand400',
        'brand[400]': 'brand400', 'brand[500]': 'brand500', 'brand[600]': 'brandCta',
        'brand[700]': 'brandFg',
        'success[50]': 'successTint', 'success[100]': 'successTintBorder',
        'success[200]': 'successTintBorder', 'success[400]': 'successFg',
        'success[500]': 'successFg', 'success[600]': 'successFg', 'success[700]': 'successFg',
        'warning[50]': 'warningTint', 'warning[100]': 'warningTintBorder',
        'warning[200]': 'warningTintBorder', 'warning[500]': 'warningFg',
        'warning[600]': 'warningFg', 'warning[700]': 'warningFg',
        'error[50]': 'errorTint', 'error[100]': 'errorTintBorder',
        'error[200]': 'errorTintBorder', 'error[300]': 'errorTintBorder',
        'error[400]': 'errorFg', 'error[500]': 'errorCta', 'error[600]': 'errorCta',
        'error[700]': 'errorFg',
        'info[50]': 'infoTint', 'info[100]': 'infoTint',
        'info[500]': 'infoFg', 'info[600]': 'infoFg', 'info[700]': 'infoFg',
        'accent[50]': 'warningTint', 'accent[100]': 'warningTintBorder',
        'accent[300]': 'loanAccent', 'accent[400]': 'loanAccent',
        'accent[500]': 'loanAccent', 'accent[600]': 'loanAccent', 'accent[700]': 'loanAccent',
        'gst': 'gstAccent', 'itr': 'itrAccent', 'loan': 'loanAccent', 'docs': 'brand500',
        'positive': 'successFg', 'negative': 'errorFg',
    },
    'fg': {
        'neutral[900]': 'textPrimary', 'neutral[800]': 'textPrimary',
        'neutral[700]': 'textSecondary', 'neutral[600]': 'textSecondary',
        'neutral[500]': 'textSecondary', 'neutral[400]': 'textTertiary',
        'neutral[300]': 'textTertiary', 'neutral[200]': 'border',
        'neutral[100]': 'textOnBrand', 'neutral[50]': 'textOnBrand',
        'neutral[0]': 'textOnBrand',
        'bg.base': 'canvas', 'surface.default': 'raised',
        'brand[50]': 'brandTint', 'brand[100]': 'brandTintBorder',
        'brand[200]': 'brand400', 'brand[300]': 'brand400',
        'brand[400]': 'brand400', 'brand[500]': 'brand500', 'brand[600]': 'brandCta',
        'brand[700]': 'brandFg',
        'success[400]': 'successFg', 'success[500]': 'successFg',
        'success[600]': 'successFg', 'success[700]': 'successFg', 'success[800]': 'successFg',
        'warning[500]': 'warningFg', 'warning[600]': 'warningFg',
        'warning[700]': 'warningFg', 'warning[800]': 'warningFg',
        'error[400]': 'errorFg', 'error[500]': 'errorFg',
        'error[600]': 'errorFg', 'error[700]': 'errorFg',
        'info[500]': 'infoFg', 'info[600]': 'infoFg', 'info[700]': 'infoFg',
        'accent[300]': 'loanAccent', 'accent[400]': 'loanAccent',
        'accent[500]': 'loanAccent', 'accent[600]': 'loanAccent', 'accent[700]': 'loanAccent',
        'gst': 'gstAccent', 'itr': 'itrAccent', 'loan': 'loanAccent', 'docs': 'brand500',
        'positive': 'successFg', 'negative': 'errorFg',
    },
    'border': {
        'bg.base': 'canvas', 'surface.default': 'raised',
        'neutral[0]': 'raised', 'neutral[50]': 'border', 'neutral[100]': 'border',
        'neutral[200]': 'border', 'neutral[300]': 'border', 'neutral[400]': 'textTertiary',
        'brand[50]': 'brandTintBorder', 'brand[100]': 'brandTintBorder',
        'brand[200]': 'brandTintBorder', 'brand[300]': 'brand400',
        'brand[400]': 'brand400', 'brand[500]': 'brand500', 'brand[600]': 'brandCta',
        'brand[700]': 'brandFg',
        'success[100]': 'successTintBorder', 'success[200]': 'successTintBorder',
        'success[300]': 'successTintBorder',
        'success[500]': 'successFg', 'success[600]': 'successFg', 'success[700]': 'successFg',
        'warning[100]': 'warningTintBorder', 'warning[200]': 'warningTintBorder',
        'warning[300]': 'warningTintBorder',
        'warning[500]': 'warningFg', 'warning[600]': 'warningFg',
        'error[100]': 'errorTintBorder', 'error[200]': 'errorTintBorder',
        'error[300]': 'errorTintBorder',
        'error[500]': 'errorCta', 'error[600]': 'errorCta',
        'info[100]': 'infoTint', 'info[500]': 'infoFg', 'info[600]': 'infoFg',
        'accent[100]': 'warningTintBorder', 'accent[200]': 'warningTintBorder',
        'accent[500]': 'loanAccent', 'accent[600]': 'loanAccent',
        'gst': 'gstAccent', 'itr': 'itrAccent', 'loan': 'loanAccent', 'docs': 'brand500',
    },
    'shadow': {
        'neutral[900]': 'shadowColor', 'neutral[800]': 'shadowColor',
    },
}

BG_PROPS = {'backgroundColor'}
BORDER_PROPS = {'borderColor', 'borderTopColor', 'borderBottomColor',
                'borderLeftColor', 'borderRightColor', 'outlineColor'}
SHADOW_PROPS = {'shadowColor'}

COLORS_RE = re.compile(r"Colors\.((?:\w+\[\d+\])|(?:\w+\.\w+)|\w+)")
PROP_RE = re.compile(r"(\w+)\s*:\s*Colors\.((?:\w+\[\d+\])|(?:\w+\.\w+)|\w+)")
OVERLAY = "'rgba(15, 23, 42, 0.6)'"  # Colors.surface.overlay literal (scrim, both modes)


def kind_for_prop(prop):
    if prop in BG_PROPS:
        return 'bg'
    if prop in BORDER_PROPS:
        return 'border'
    if prop in SHADOW_PROPS:
        return 'shadow'
    return 'fg'


def map_token(kind, path, var):
    if path == 'surface.overlay':
        return OVERLAY
    tk = MAP.get(kind, {}).get(path)
    if tk is None and kind != 'fg':
        tk = MAP['fg'].get(path)
    if tk is None:
        return None
    return f"{var}.{tk}"


def replace_in_styles(seg):
    unmapped = []

    def prop_sub(m):
        prop, path = m.group(1), m.group(2)
        rep = map_token(kind_for_prop(prop), path, 'tk')
        if rep is None:
            unmapped.append((prop, path))
            return m.group(0)
        return f"{prop}: {rep}"

    seg = PROP_RE.sub(prop_sub, seg)
    # white text inside style sheets pairs with brand/status fills → textOnBrand
    seg = re.sub(r"color:\s*'#(?:fff|FFF|ffffff|FFFFFF)'", "color: tk.textOnBrand", seg)
    seg = re.sub(r"shadowColor:\s*'#0F172A'", "shadowColor: tk.shadowColor", seg)

    # Anything left like `Colors.x` inside arrays/ternaries — map as fg
    def loose_sub(m):
        rep = map_token('fg', m.group(1), 'tk')
        if rep is None:
            unmapped.append(('?', m.group(1)))
            return m.group(0)
        return rep

    seg = COLORS_RE.sub(loose_sub, seg)
    return seg, unmapped


def replace_inline(line):
    """Outside style sheets: Colors.* → tokens.* (fg mapping; bg if prop hints)."""
    unmapped = []

    def prop_sub(m):
        prop, path = m.group(1), m.group(2)
        rep = map_token(kind_for_prop(prop), path, 'tokens')
        if rep is None:
            unmapped.append((prop, path))
            return m.group(0)
        return f"{prop}: {rep}"

    line = PROP_RE.sub(prop_sub, line)

    def loose_sub(m):
        rep = map_token('fg', m.group(1), 'tokens')
        if rep is None:
            unmapped.append(('?', m.group(1)))
            return m.group(0)
        return rep

    line = COLORS_RE.sub(loose_sub, line)
    return line, unmapped


FUNC_RE = re.compile(r"^(?:export )?(?:default )?function ([A-Z]\w*)")
ARROW_RE = re.compile(r"^(?:export )?const ([A-Z]\w*)(?::[^=]+)? = (?:React\.memo\()?(?:async )?\(")


def find_body_start(lines, i):
    """From a component signature line, find index of the line whose end opens
    the body (paren depth back to 0 and a `{` seen after)."""
    depth = 0
    seen_paren = False
    for j in range(i, min(i + 40, len(lines))):
        for ch in lines[j]:
            if ch == '(':
                depth += 1
                seen_paren = True
            elif ch == ')':
                depth -= 1
        if seen_paren and depth <= 0 and lines[j].rstrip().endswith('{'):
            return j
    return None


def component_ranges(lines):
    """Yield (name, sig_idx, body_open_idx, end_idx) for top-level components."""
    out = []
    for i, ln in enumerate(lines):
        m = FUNC_RE.match(ln) or ARROW_RE.match(ln)
        if not m:
            continue
        body = find_body_start(lines, i)
        if body is None:
            continue
        # find end: next top-level closer
        end = len(lines) - 1
        for j in range(body + 1, len(lines)):
            if re.match(r"^\}\)?;?\s*$", lines[j]) and not lines[j].startswith(' '):
                end = j
                break
        out.append((m.group(1), i, body, end))
    return out


def process(path):
    src = open(path).read()
    if 'constants/colors' not in src:
        print(f"SKIP (no Colors import): {path}")
        return

    lines = src.split('\n')
    out = []
    unmapped_all = []
    sheets = []  # original style const names
    i = 0
    n = len(lines)
    sheet_open = re.compile(r"^const (\w+) = StyleSheet\.create\(\{")
    while i < n:
        ln = lines[i]
        m = sheet_open.match(ln)
        if m:
            name = m.group(1)
            sheets.append(name)
            hook = 'useStyles' if name == 'styles' else 'use' + name[0].upper() + name[1:]
            # collect until closing `});` at column 0
            block = [ln]
            i += 1
            while i < n and not re.match(r"^\}\);\s*$", lines[i]):
                block.append(lines[i])
                i += 1
            if i < n:
                block.append(lines[i])
                i += 1
            seg = '\n'.join(block)
            seg = seg.replace(f"const {name} = StyleSheet.create({{",
                              f"const {hook} = createThemedStyles((tk: ThemeTokens) =>\n  StyleSheet.create({{")
            seg = re.sub(r"\}\);\s*$", "  }),\n);", seg)
            # indent body two extra spaces to match wrapper
            seg, unm = replace_in_styles(seg)
            unmapped_all += unm
            out.append(seg)
            continue
        out.append(ln)
        i += 1

    lines = '\n'.join(out).split('\n')

    # inline replacements outside the converted sheets (sheets now use tk.)
    for idx, ln in enumerate(lines):
        if 'Colors.' in ln:
            new, unm = replace_inline(ln)
            lines[idx] = new
            unmapped_all += unm

    text = '\n'.join(lines)
    uses_tokens = 'tokens.' in text and 'const { tokens }' not in text

    # swap import
    needs = ['createThemedStyles']
    if uses_tokens:
        needs.insert(0, 'useTheme')
    parts = path.split('/')
    depth = len(parts) - parts.index('src') - 2  # dirs between file and src/
    rel = '../' * depth + 'contexts/ThemeContext'
    import_line = ("import { " + ', '.join(needs) + ", type ThemeTokens } from '" + rel + "';")
    text = re.sub(r"import \{ Colors \} from '[^']*constants/colors';", import_line, text)

    # insert hooks into components
    lines = text.split('\n')
    comps = component_ranges(lines)
    insertions = []  # (line_idx, text)
    for name, sig, body, end in comps:
        body_text = '\n'.join(lines[body + 1:end + 1])
        ins = []
        for sheet in sheets:
            hook = 'useStyles' if sheet == 'styles' else 'use' + sheet[0].upper() + sheet[1:]
            if re.search(rf"\b{sheet}\.", body_text) and f"const {sheet} =" not in body_text:
                ins.append(f"  const {sheet} = {hook}();")
        if 'tokens.' in body_text and 'const { tokens }' not in body_text:
            ins.append("  const { tokens } = useTheme();")
        for t in ins:
            insertions.append((body, t))
    for idx, t in sorted(insertions, key=lambda x: -x[0]):
        lines.insert(idx + 1, t)

    open(path, 'w').write('\n'.join(lines))
    status = "OK" if not unmapped_all else f"OK with UNMAPPED: {sorted(set(unmapped_all))}"
    print(f"{status}: {path}")


if __name__ == '__main__':
    for p in sys.argv[1:]:
        process(p)
