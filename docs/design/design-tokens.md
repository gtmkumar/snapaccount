# SnapAccount Design Tokens

> Produced by: ui-ux-agent
> Date: 2026-04-04
> Status: APPROVED

---

## Overview

SnapAccount targets Indian SME users on mid-range Android devices. The design language is **warm, trustworthy, and slightly bolder** than flat Western minimal — taking cues from Indian financial brands (HDFC, Zerodha, Groww) while remaining modern. Colors favor warm blues and saffron accents. Typography prioritizes legibility at small sizes on lower-resolution screens.

All tokens are defined as semantic names first, then mapped to Tailwind CSS v4 (web admin) and NativeWind (React Native) equivalents.

---

## 1. Color Palette

### Brand Colors

| Token | Hex | Description |
|-------|-----|-------------|
| `color-brand-50` | `#EFF6FF` | Lightest blue tint |
| `color-brand-100` | `#DBEAFE` | Very light blue |
| `color-brand-200` | `#BFDBFE` | Light blue |
| `color-brand-300` | `#93C5FD` | Medium-light blue |
| `color-brand-400` | `#60A5FA` | Medium blue |
| `color-brand-500` | `#2563EB` | **Primary brand blue** — trust, finance |
| `color-brand-600` | `#1D4ED8` | Pressed state |
| `color-brand-700` | `#1E40AF` | Dark brand |
| `color-brand-800` | `#1E3A8A` | Very dark brand |
| `color-brand-900` | `#1E3270` | Darkest brand |

### Accent Colors (Saffron/Amber — Indian identity)

| Token | Hex | Description |
|-------|-----|-------------|
| `color-accent-50` | `#FFFBEB` | Lightest amber |
| `color-accent-100` | `#FEF3C7` | Very light amber |
| `color-accent-200` | `#FDE68A` | Light amber |
| `color-accent-300` | `#FCD34D` | Medium amber |
| `color-accent-400` | `#FBBF24` | Warm amber |
| `color-accent-500` | `#F59E0B` | **Primary accent** — CTAs, highlights |
| `color-accent-600` | `#D97706` | Pressed accent |
| `color-accent-700` | `#B45309` | Dark accent |
| `color-accent-800` | `#92400E` | Very dark accent |
| `color-accent-900` | `#78350F` | Darkest accent |

### Semantic Colors

#### Success (Green)
| Token | Hex | Usage |
|-------|-----|-------|
| `color-success-50` | `#F0FDF4` | Background |
| `color-success-100` | `#DCFCE7` | Light background |
| `color-success-500` | `#22C55E` | Icons, text |
| `color-success-600` | `#16A34A` | **Primary success** |
| `color-success-700` | `#15803D` | Pressed |
| `color-success-900` | `#14532D` | Dark text |

#### Warning (Amber)
| Token | Hex | Usage |
|-------|-----|-------|
| `color-warning-50` | `#FFFBEB` | Background |
| `color-warning-100` | `#FEF3C7` | Light background |
| `color-warning-500` | `#F59E0B` | Icons |
| `color-warning-600` | `#D97706` | **Primary warning** |
| `color-warning-900` | `#78350F` | Dark text |

#### Error (Red)
| Token | Hex | Usage |
|-------|-----|-------|
| `color-error-50` | `#FFF1F2` | Background |
| `color-error-100` | `#FFE4E6` | Light background |
| `color-error-500` | `#F43F5E` | Icons |
| `color-error-600` | `#E11D48` | **Primary error** |
| `color-error-700` | `#BE123C` | Pressed |
| `color-error-900` | `#881337` | Dark text |

#### Info (Sky)
| Token | Hex | Usage |
|-------|-----|-------|
| `color-info-50` | `#F0F9FF` | Background |
| `color-info-100` | `#E0F2FE` | Light background |
| `color-info-500` | `#0EA5E9` | Icons |
| `color-info-600` | `#0284C7` | **Primary info** |
| `color-info-900` | `#0C4A6E` | Dark text |

### Neutral Grays (Warm undertone — not pure neutral)

| Token | Hex | Description |
|-------|-----|-------------|
| `color-neutral-0` | `#FFFFFF` | White |
| `color-neutral-50` | `#F9FAFB` | Off-white, page background |
| `color-neutral-100` | `#F3F4F6` | Card background, input bg |
| `color-neutral-200` | `#E5E7EB` | Borders, dividers |
| `color-neutral-300` | `#D1D5DB` | Disabled border |
| `color-neutral-400` | `#9CA3AF` | Placeholder text |
| `color-neutral-500` | `#6B7280` | Secondary text |
| `color-neutral-600` | `#4B5563` | Body text |
| `color-neutral-700` | `#374151` | Strong text |
| `color-neutral-800` | `#1F2937` | Heading text |
| `color-neutral-900` | `#111827` | Primary text |
| `color-neutral-950` | `#0A0F1A` | Near black |

### Background & Surface (Light Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `color-bg-base` | `#F7F8FA` | App/page background (slightly warm) |
| `color-bg-subtle` | `#EFF1F5` | Sidebar, secondary areas |
| `color-surface-default` | `#FFFFFF` | Cards, modals, sheets |
| `color-surface-raised` | `#FFFFFF` | Elevated cards (with shadow) |
| `color-surface-overlay` | `rgba(0,0,0,0.5)` | Modal backdrop |
| `color-surface-invert` | `#1F2937` | Dark surface (used sparingly) |

### Finance-Specific Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `color-positive` | `#059669` | Profit, income, refund |
| `color-negative` | `#DC2626` | Loss, expense, tax owed |
| `color-gst` | `#7C3AED` | GST module accent |
| `color-itr` | `#0891B2` | ITR module accent |
| `color-loan` | `#D97706` | Loan module accent |
| `color-docs` | `#2563EB` | Documents module accent |

---

## 2. Typography

### Font Stack

**Primary font:** System UI stack — avoids Google Fonts download latency on Indian 2G/3G networks.

```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Noto Sans',
             'Noto Sans Devanagari', 'Noto Sans Bengali', 'Arial', sans-serif;
```

**Why Roboto/Noto:** Pre-installed on virtually all Android devices sold in India. Noto Sans covers Devanagari (Hindi), Bengali, Gujarati, Tamil, Telugu, Kannada, Malayalam scripts without extra downloads.

**Monospace (amounts, account numbers):**
```
font-family: 'Roboto Mono', 'Courier New', monospace;
```

### Size Scale

| Token | px | rem | Tailwind | Usage |
|-------|----|-----|---------|-------|
| `text-xs` | 12px | 0.75rem | `text-xs` | Legal text, timestamps, labels |
| `text-sm` | 14px | 0.875rem | `text-sm` | Secondary body, form labels |
| `text-base` | 16px | 1rem | `text-base` | Primary body copy |
| `text-md` | 18px | 1.125rem | `text-lg` | Sub-headings, important info |
| `text-lg` | 20px | 1.25rem | `text-xl` | Section headings |
| `text-xl` | 24px | 1.5rem | `text-2xl` | Card headings, screen titles |
| `text-2xl` | 28px | 1.75rem | `text-[28px]` | Major headings |
| `text-3xl` | 32px | 2rem | `text-3xl` | Large display numbers |
| `text-4xl` | 40px | 2.5rem | `text-[40px]` | Hero amounts, big KPIs |

**Note:** Minimum body size is 16px to support users on lower-DPI mid-range Indian devices. Never go below 12px even for captions.

### Weight Scale

| Token | Value | Tailwind | Usage |
|-------|-------|---------|-------|
| `font-light` | 300 | `font-light` | Rare — only decorative large text |
| `font-regular` | 400 | `font-normal` | Body copy, descriptions |
| `font-medium` | 500 | `font-medium` | Labels, subtle emphasis |
| `font-semibold` | 600 | `font-semibold` | Headings, button labels, important values |
| `font-bold` | 700 | `font-bold` | Strong emphasis, primary headings |
| `font-extrabold` | 800 | `font-extrabold` | Hero numbers, major KPIs only |

### Line Heights

| Token | Value | Tailwind | Usage |
|-------|-------|---------|-------|
| `leading-tight` | 1.2 | `leading-tight` | Large headings, single-line display |
| `leading-snug` | 1.35 | `leading-snug` | Sub-headings |
| `leading-normal` | 1.5 | `leading-normal` | Body text |
| `leading-relaxed` | 1.65 | `leading-relaxed` | Long-form content, descriptions |
| `leading-loose` | 2.0 | `leading-loose` | Spaced list items |

### Letter Spacing

| Token | Value | Tailwind | Usage |
|-------|-------|---------|-------|
| `tracking-tight` | -0.025em | `tracking-tight` | Large display numbers |
| `tracking-normal` | 0 | `tracking-normal` | Body text |
| `tracking-wide` | 0.025em | `tracking-wide` | Uppercase labels, badge text |
| `tracking-wider` | 0.05em | `tracking-wider` | ALL CAPS status badges |

---

## 3. Spacing System

Base unit: **4px**

| Token | px | Tailwind | Usage |
|-------|----|---------|-------|
| `space-1` | 4px | `p-1 / m-1 / gap-1` | Micro spacing — icon padding, tight chips |
| `space-2` | 8px | `p-2 / m-2 / gap-2` | Compact spacing — label to input |
| `space-3` | 12px | `p-3 / m-3 / gap-3` | Default inner padding |
| `space-4` | 16px | `p-4 / m-4 / gap-4` | Standard card padding, form field gap |
| `space-5` | 20px | `p-5 / m-5 / gap-5` | Medium spacing |
| `space-6` | 24px | `p-6 / m-6 / gap-6` | Section spacing, large card padding |
| `space-8` | 32px | `p-8 / m-8 / gap-8` | Screen section separators |
| `space-10` | 40px | `p-10 / m-10 / gap-10` | Large section gaps |
| `space-12` | 48px | `p-12 / m-12 / gap-12` | Hero areas |
| `space-16` | 64px | `p-16 / m-16 / gap-16` | Major page sections |
| `space-20` | 80px | `p-20 / m-20 / gap-20` | Top/bottom page margins (web) |
| `space-24` | 96px | `p-24 / m-24 / gap-24` | Footer clearance, large empty states |

**Screen safe areas (mobile):**
- Top safe area: 44px (status bar)
- Bottom safe area: 34px (home indicator on notch devices)
- Horizontal screen margin: 16px

---

## 4. Border Radius

| Token | px | Tailwind | Usage |
|-------|----|---------|-------|
| `rounded-none` | 0 | `rounded-none` | Dividers, full-width banners |
| `rounded-sm` | 4px | `rounded` | Badges, small chips, inline tags |
| `rounded-md` | 8px | `rounded-lg` | Input fields, small cards |
| `rounded-lg` | 12px | `rounded-xl` | Standard cards, modals |
| `rounded-xl` | 16px | `rounded-2xl` | Large cards, bottom sheets |
| `rounded-2xl` | 20px | `rounded-[20px]` | Floating action areas |
| `rounded-full` | 9999px | `rounded-full` | Avatars, pills, toggle handles |

---

## 5. Shadow / Elevation System

| Level | Token | CSS Shadow | Tailwind | Usage |
|-------|-------|-----------|---------|-------|
| 0 | `shadow-none` | none | `shadow-none` | Flat elements, disabled cards |
| 1 | `shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` | `shadow-sm` | Subtle lift — input focus rings |
| 2 | `shadow-sm` | `0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)` | `shadow` | Default cards, dropdowns |
| 3 | `shadow-md` | `0 4px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)` | `shadow-md` | Raised cards, sticky headers |
| 4 | `shadow-lg` | `0 8px 24px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)` | `shadow-lg` | Modals, bottom sheets, popovers |
| 5 | `shadow-xl` | `0 16px 48px rgba(0,0,0,0.16), 0 8px 16px rgba(0,0,0,0.08)` | `shadow-xl` | FABs, tooltips, critical alerts |

**NativeWind note:** React Native elevation uses `elevation` prop (Android) and `shadowOffset/shadowRadius` (iOS). Map as:
- Level 1: `elevation: 1`
- Level 2: `elevation: 2`
- Level 3: `elevation: 4`
- Level 4: `elevation: 8`
- Level 5: `elevation: 16`

---

## 6. Motion Tokens

### Duration

| Token | ms | Tailwind | Usage |
|-------|----|---------|-------|
| `duration-instant` | 0ms | — | State changes with no animation |
| `duration-fast` | 100ms | `duration-100` | Micro-interactions — toggle, checkbox |
| `duration-normal` | 200ms | `duration-200` | Most transitions — hover, focus |
| `duration-moderate` | 300ms | `duration-300` | Panel slides, drawer open |
| `duration-slow` | 400ms | `duration-400` | Full screen transitions, modals |
| `duration-deliberate` | 600ms | `duration-500` | Loading states, progress bars |

### Easing

| Token | CSS Value | Tailwind | Usage |
|-------|-----------|---------|-------|
| `ease-linear` | `linear` | `ease-linear` | Loaders, progress bars |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | `ease-in` | Elements leaving screen |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | `ease-out` | Elements entering screen |
| `ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | `ease-in-out` | Balanced transitions |
| `ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | — | Bouncy FAB, sheet snapping |

---

## 7. Tailwind CSS v4 Configuration

```css
/* src/admin/src/styles/tokens.css */
@theme {
  /* Colors */
  --color-brand-500: #2563EB;
  --color-brand-600: #1D4ED8;
  --color-accent-500: #F59E0B;
  --color-accent-600: #D97706;
  --color-success-600: #16A34A;
  --color-warning-600: #D97706;
  --color-error-600: #E11D48;
  --color-info-600: #0284C7;
  --color-positive: #059669;
  --color-negative: #DC2626;
  --color-gst: #7C3AED;
  --color-itr: #0891B2;
  --color-loan: #D97706;
  --color-docs: #2563EB;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Noto Sans', Arial, sans-serif;
  --font-mono: 'Roboto Mono', 'Courier New', monospace;

  /* Spacing base 4px */
  --spacing: 0.25rem;

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;
}
```

## 8. NativeWind (React Native) Mapping

```typescript
// mobile/src/theme/tokens.ts
export const tokens = {
  colors: {
    brand: { 500: '#2563EB', 600: '#1D4ED8' },
    accent: { 500: '#F59E0B', 600: '#D97706' },
    success: { 600: '#16A34A' },
    warning: { 600: '#D97706' },
    error: { 600: '#E11D48' },
    positive: '#059669',
    negative: '#DC2626',
    neutral: {
      0: '#FFFFFF', 50: '#F9FAFB', 100: '#F3F4F6',
      200: '#E5E7EB', 300: '#D1D5DB', 400: '#9CA3AF',
      500: '#6B7280', 600: '#4B5563', 700: '#374151',
      800: '#1F2937', 900: '#111827',
    },
    bg: { base: '#F7F8FA' },
    surface: { default: '#FFFFFF' },
  },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  fontSize: { xs: 12, sm: 14, base: 16, md: 18, lg: 20, xl: 24, '2xl': 28, '3xl': 32, '4xl': 40 },
  fontWeight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  borderRadius: { sm: 4, md: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 },
};
```

---

## 9. Indian Market Considerations

- **Warm palette**: Blue-based primary with saffron accent evokes Indian financial brand trust.
- **High contrast**: Minimum 4.5:1 contrast ratio to account for sunlight readability on outdoor use.
- **Bold CTAs**: Indian users respond to clear, assertive action buttons — no ghost-only primary CTAs on critical flows.
- **Large touch targets**: Minimum 48x48px touch area — Indian market has high share of larger-screen budget phones with imprecise touch.
- **Amount formatting**: INR formatting in lakhs/crores (not millions/billions): `₹1,00,000` not `₹100,000`.
- **Script support**: All text fields must support Unicode for Devanagari, Bengali, Gujarati input.
