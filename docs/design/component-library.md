# SnapAccount Component Library

> Produced by: ui-ux-agent
> Date: 2026-04-04
> Status: APPROVED

---

## Overview

All components are defined for two platforms:
- **Web Admin**: React 19 + TypeScript + Tailwind CSS v4
- **Mobile**: React Native (Expo SDK 52+) + NativeWind

Component naming uses PascalCase. Props use camelCase. All interactive components meet WCAG 2.1 AA accessibility standards.

---

## 1. Form Components

### 1.1 TextInput

**Purpose:** Standard single-line text entry.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | string | — | Field label (shown above) |
| `placeholder` | string | — | Placeholder text |
| `value` | string | — | Controlled value |
| `onChange` | function | — | Change handler |
| `type` | `text\|email\|number\|password\|search` | `text` | HTML input type |
| `hint` | string | — | Helper text below field |
| `error` | string | — | Error message (replaces hint) |
| `disabled` | boolean | false | Disabled state |
| `required` | boolean | false | Marks field required |
| `maxLength` | number | — | Character limit |
| `prefix` | ReactNode | — | Prefix icon or text |
| `suffix` | ReactNode | — | Suffix icon or text |
| `size` | `sm\|md\|lg` | `md` | Field size |

**Variants:** Default, With prefix icon, With suffix icon, With character count

**States:**
- **Default**: `border-neutral-300`, `bg-neutral-100` (mobile) / `bg-white` (web), `text-neutral-900`
- **Focus**: `border-brand-500`, `ring-2 ring-brand-500/20`, label animates up (web)
- **Filled**: `border-neutral-400`, full value shown
- **Error**: `border-error-600`, error text in `text-error-600` below field, error icon suffix
- **Disabled**: `bg-neutral-100`, `text-neutral-400`, `cursor-not-allowed`
- **Loading**: Pulse skeleton for value area

**Accessibility:**
- `aria-label` or `aria-labelledby` always set
- `aria-describedby` linked to hint/error
- `aria-required` when required
- `aria-invalid="true"` when error present

---

### 1.2 PhoneInput

**Purpose:** Indian mobile number entry with +91 prefix locked.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | string | — | 10-digit number (without +91) |
| `onChange` | function | — | Change handler |
| `error` | string | — | Validation error |
| `disabled` | boolean | false | — |

**Variants:**
- Prefix `+91` displayed as non-editable grey badge on left
- 10-digit entry limited; validates starts with 6/7/8/9
- Large `text-xl font-semibold` display for number (legibility)

**States:** Same as TextInput. Validation error: "Please enter a valid Indian mobile number"

**Indian UX note:** Auto-strips leading `0` if user types `0XXXXXXXXXX`. Auto-detects and strips `+91` if pasted.

---

### 1.3 OTPInput

**Purpose:** 6-digit OTP entry with individual boxes — high visibility, touch-friendly.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `length` | number | 6 | Number of OTP digits |
| `value` | string | — | Current OTP value |
| `onChange` | function | — | Called on each digit change |
| `onComplete` | function | — | Called when all digits filled |
| `error` | boolean | false | Shows error ring |
| `disabled` | boolean | false | — |
| `autoFocus` | boolean | true | Focus first box on mount |

**States:**
- **Empty**: Dashed border box, 48x56px each, gap-3
- **Active/Focused**: `border-brand-500 ring-2 ring-brand-500/30`
- **Filled**: Solid `border-neutral-400`, digit shown large `text-2xl font-bold`
- **Error**: All boxes get `border-error-600`
- **Success**: Brief green flash on complete

**Indian UX note:**
- **SMS Retriever API (Android):** Auto-reads OTP from SMS. No user action needed. Implementation: `react-native-otp-verify` package.
- **iOS:** Keyboard shows `one-time-code` type to enable system OTP suggestion from SMS.
- Auto-advances focus to next box on digit entry.
- Backspace deletes current digit and moves focus back.
- Paste support: pastes all 6 digits at once.

---

### 1.4 PINInput

**Purpose:** 4 or 6-digit numeric PIN (app lock, payment confirmation).

**Props:** Same as OTPInput but `type="password"` — shows dots/asterisks instead of digits.

**Additional:**
- `showToggle` (boolean): Show/hide PIN option
- Haptic feedback on each digit entry (mobile)

---

### 1.5 DatePicker

**Purpose:** Date selection — financial year awareness, Indian date formats.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | Date\|null | — | Selected date |
| `onChange` | function | — | Date change handler |
| `minDate` | Date | — | Minimum selectable date |
| `maxDate` | Date | — | Maximum selectable date |
| `format` | string | `DD/MM/YYYY` | Display format |
| `placeholder` | string | `DD/MM/YYYY` | — |
| `disabled` | boolean | false | — |
| `financialYear` | boolean | false | FY-aware: April start highlighted |
| `mode` | `date\|month\|year\|range` | `date` | Selection mode |

**States:** Standard input states + open calendar popover

**Notes:**
- Indian date format: DD/MM/YYYY (not MM/DD/YYYY)
- Financial Year runs April 1 to March 31 — FY navigation button in header
- Month/year jump dropdowns for fast navigation

---

### 1.6 Select / Dropdown

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `{value, label, icon?}[]` | — | Option list |
| `value` | string | — | Selected value |
| `onChange` | function | — | Change handler |
| `placeholder` | string | `Select...` | — |
| `searchable` | boolean | false | Enables search within options |
| `disabled` | boolean | false | — |
| `loading` | boolean | false | Options loading state |
| `error` | string | — | Error message |

**Variants:** Standard, With icons, Grouped options

**States:**
- **Closed**: Input with chevron-down icon, shows selected label
- **Open**: Dropdown panel, `shadow-lg`, max-height 240px with scroll
- **Search active**: Search input at top of dropdown
- **Loading**: Spinner replacing chevron
- **Empty**: "No options found" message
- **Error**: Red border

---

### 1.7 MultiSelect

**Purpose:** Select multiple values (e.g., GST rate selection, document categories).

Extends Select with checkbox items and selected chips displayed in the input area.

**Additional props:**
- `maxItems` (number): Limit selections
- `showCount` (boolean): Show `+N more` when overflow

---

### 1.8 FileUpload

**Purpose:** Document uploads — bills, PDFs, statements.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `accept` | string | `image/*,.pdf` | Accepted file types |
| `maxSize` | number | 5242880 | Max bytes (5MB default) |
| `multiple` | boolean | false | Allow multiple files |
| `onUpload` | function | — | File(s) selected handler |
| `value` | File[] | — | Current files |
| `status` | `idle\|uploading\|success\|error` | `idle` | Upload status |
| `progress` | number | — | 0-100 upload progress |

**Variants:**
- **Drag & Drop zone** (web): Dashed border area, "Drag PDF/image here or click to browse". 
- **Click to upload** (mobile): Triggers native file picker or camera
- **With preview**: Shows thumbnail for images, PDF icon for PDFs

**States:**
- **Idle**: Dashed border, upload icon, instructions
- **Drag over**: `border-brand-500 bg-brand-50`, highlighted
- **Uploading**: Progress bar, filename shown, cancel button
- **Success**: Green checkmark, filename, file size, remove button
- **Error**: Red border, error message, retry button

---

### 1.9 Toggle

**Purpose:** Binary on/off switches (notification preferences, feature flags).

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | boolean | false | On/off state |
| `onChange` | function | — | Toggle handler |
| `label` | string | — | Accessible label |
| `size` | `sm\|md\|lg` | `md` | Physical size |
| `disabled` | boolean | false | — |
| `loading` | boolean | false | Async state pending |

**States:**
- **Off**: `bg-neutral-300`, thumb left
- **On**: `bg-brand-500`, thumb right, spring animation
- **Disabled Off**: `bg-neutral-200`, opacity 50%
- **Disabled On**: `bg-brand-300`, opacity 50%
- **Loading**: Spinner inside thumb

**Sizes:** sm (32x18px), md (44x24px — default), lg (52x30px)

---

### 1.10 Checkbox

**Props:** `checked`, `indeterminate`, `onChange`, `label`, `disabled`, `error`

**States:** Unchecked / Checked (brand-500 fill, white checkmark) / Indeterminate (dash) / Disabled / Error

**Touch target:** 44x44px minimum

---

### 1.11 Radio

**Props:** `value`, `selected`, `onChange`, `label`, `disabled`

Radio buttons grouped via RadioGroup wrapper. Single selection enforced.

---

## 2. Display Components

### 2.1 Card

**Purpose:** Container for grouped content.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `padding` | `none\|sm\|md\|lg` | `md` | Inner padding |
| `shadow` | `none\|sm\|md` | `sm` | Elevation |
| `radius` | `md\|lg\|xl` | `lg` | Border radius |
| `border` | boolean | true | Show subtle border |
| `clickable` | boolean | false | Adds hover state, cursor-pointer |
| `selected` | boolean | false | Selected state (border brand) |

**States:**
- Default: `bg-white shadow-sm rounded-xl border border-neutral-200`
- Hover (clickable): `shadow-md border-brand-300`
- Selected: `border-2 border-brand-500 shadow-md`
- Disabled: `opacity-60`

---

### 2.2 MetricCard (Dashboard KPI)

**Purpose:** Financial key performance indicator display.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | string | — | Metric label |
| `value` | string | — | Formatted value (INR or count) |
| `trend` | `up\|down\|neutral` | — | Trend direction |
| `trendValue` | string | — | e.g. "+12% vs last month" |
| `icon` | ReactNode | — | Metric icon |
| `color` | `brand\|success\|warning\|error\|gst\|loan\|itr` | `brand` | Accent color |
| `loading` | boolean | false | Skeleton state |
| `onPress` | function | — | Navigate to detail |

**Layout:**
```
[Icon bg colored]  [Title text-sm text-neutral-500]
                   [Value text-2xl font-bold]
                   [Trend arrow + text-xs]
```

**Variants:** Compact (mobile, 2-column grid), Full width (detail screens), Mini (sidebar widgets)

---

### 2.3 Badge

**Purpose:** Small status/category indicator inline with text.

**Props:** `label`, `variant` (`default|brand|success|warning|error|info|neutral`), `size` (`sm|md`)

**Visual:** Pill shape, `text-xs font-medium tracking-wide`, uppercase or mixed case per use.

---

### 2.4 Tag

**Purpose:** User-applied labels on documents, similar to chips.

**Props:** `label`, `color` (from palette), `removable` (shows × button), `onRemove`

---

### 2.5 StatusBadge

**Purpose:** Workflow state indicator for documents, GST returns, ITR, loans.

**Props:** `status` (enum per domain), `size` (`sm|md|lg`)

**Document statuses:**
| Status | Color | Icon |
|--------|-------|------|
| UPLOADED | info | cloud-upload |
| OCR_COMPLETE | brand | scan |
| IN_REVIEW | warning | eye |
| PROCESSED | success | check-circle |
| REJECTED | error | x-circle |

**GST return statuses:**
| Status | Color |
|--------|-------|
| DRAFT | neutral |
| PENDING_APPROVAL | warning |
| APPROVED | info |
| FILED | success |
| REVISION_NEEDED | error |

**ITR statuses:**
| Status | Color |
|--------|-------|
| DRAFT | neutral |
| PENDING_APPROVAL | warning |
| USER_APPROVED | info |
| FILING_IN_PROGRESS | brand |
| FILED | success |
| E_VERIFIED | success |
| COMPLETED | success |

**Loan statuses:**
| Status | Color |
|--------|-------|
| INITIATED | neutral |
| DOCUMENTS_READY | info |
| SUBMITTED | brand |
| UNDER_REVIEW | warning |
| ADDITIONAL_DOCS_NEEDED | warning |
| APPROVED | success |
| DISBURSED | success |
| REJECTED | error |

---

### 2.6 Avatar

**Props:** `src` (image URL), `name` (fallback initials), `size` (`xs|sm|md|lg|xl`), `online` (green dot)

**Sizes:** xs=24px, sm=32px, md=40px (default), lg=48px, xl=64px

**Fallback:** Shows 1-2 character initials on colored background (color deterministic from name hash).

---

### 2.7 Skeleton Loader

**Purpose:** Content placeholder during data loading.

**Variants:**
- `SkeletonText`: Animated grey bar for text lines
- `SkeletonCard`: Full card placeholder
- `SkeletonMetricCard`: KPI card shape
- `SkeletonTable`: Table with rows

**Animation:** Shimmer effect — gradient sweeps left to right, `duration-1500ms` loop.

---

## 3. Navigation Components

### 3.1 BottomTabBar (Mobile)

**Purpose:** Primary navigation — 5 tabs max.

**SnapAccount tabs:**
1. Home (house icon)
2. Documents (folder-open icon)
3. GST / ITR (filing icon, context-aware per user type)
4. Expert Chat (chat-bubble icon)
5. More/Profile (menu icon)

**Props:** `tabs` (array of tab config), `activeTab`, `onTabChange`, `badge` (per tab notification count)

**Visual:**
- Height: 56px + bottom safe area
- Active tab: icon + label in `color-brand-500`, `font-semibold`
- Inactive: icon + label in `color-neutral-400`
- Badge: red circle with count on icon top-right
- Background: `bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]`

---

### 3.2 TopNavBar (Mobile)

**Purpose:** Screen-level header.

**Props:** `title`, `subtitle`, `leftAction` (back button or menu), `rightActions` (array of icon buttons), `transparent`, `elevated`

**Variants:**
- Standard: white bg, title centered, back arrow left
- Large title: title left-aligned, larger `text-2xl font-bold`
- Transparent: over hero image/gradient

---

### 3.3 Sidebar (Web Admin)

**Purpose:** Primary navigation for web admin panel.

**Sections:**
1. Logo / Org switcher
2. Navigation links (icon + label)
3. Bottom: User profile, Settings, Logout

**Nav items:** Dashboard, Documents, GST, ITR, Loans, Chat, Users, Team, Subscriptions, Reports, Settings, System

**States:** Collapsed (icons only, 64px width) / Expanded (icons + labels, 240px width)

**Active item:** `bg-brand-50 text-brand-700 border-l-2 border-brand-500`

**Role visibility:** Each nav item has required roles — users only see items they have access to.

---

### 3.4 Breadcrumb

**Purpose:** Web admin location indicator.

**Props:** `items` (`{label, href}[]`), `separator` (default `/`)

**Visual:** `text-sm text-neutral-500` for ancestors, `text-neutral-900 font-medium` for current page.

---

## 4. Feedback Components

### 4.1 Toast / Snackbar

**Purpose:** Brief non-blocking feedback messages.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | string | — | Main message text |
| `type` | `success\|error\|warning\|info` | `info` | Visual style |
| `duration` | number | 3000 | Auto-dismiss ms |
| `action` | `{label, onPress}` | — | Optional action button |
| `position` | `top\|bottom` | `bottom` | Screen position |

**Visual:** 16px from screen edge, max-width 400px (web) / screen-width minus 32px (mobile), rounded-lg, shadow-xl

**Colors:**
- Success: `bg-success-600 text-white`
- Error: `bg-error-600 text-white`
- Warning: `bg-warning-600 text-white`
- Info: `bg-neutral-800 text-white`

---

### 4.2 Alert Banner

**Purpose:** Persistent inline alerts within page content.

**Props:** `type` (`success|error|warning|info`), `title`, `description`, `dismissible`, `actions`

**Visual:** Full-width within content area, left colored border (4px), icon left, title + description, optional action links.

---

### 4.3 ProgressBar

**Props:** `value` (0-100), `size` (`sm|md|lg`), `color` (`brand|success|warning|error`), `label`, `showValue`

**Variants:**
- Linear bar with rounded ends
- Stepped bar (for workflow stages)

**Accessibility:** `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

---

### 4.4 Spinner / Loader

**Variants:**
- `SpinnerCircle`: Rotating circular stroke, `color-brand-500`
- `SpinnerDots`: 3 pulsing dots (for async operations)
- `SpinnerOverlay`: Full-screen overlay with spinner (blocking operations)

**Sizes:** xs=16px, sm=20px, md=32px, lg=48px, xl=64px

---

### 4.5 EmptyState

**Purpose:** Zero-data state for lists and dashboards.

**Props:** `illustration` (SVG name), `title`, `description`, `action` (`{label, onPress}`)

**Standard illustrations:** Empty folder (documents), No data chart (dashboard), No messages (chat), Checklist complete (tasks)

**Layout:** Centered, illustration top, title `text-xl font-semibold`, description `text-neutral-500`, CTA button below.

---

### 4.6 ErrorState

**Purpose:** Error recovery screen.

**Props:** `type` (`network|server|notFound|forbidden|timeout`), `title`, `description`, `onRetry`, `onGoBack`

---

## 5. Action Components

### 5.1 PrimaryButton

**Props:** `label`, `onPress/onClick`, `disabled`, `loading`, `size` (`sm|md|lg`), `fullWidth`, `leftIcon`, `rightIcon`

**Visual:** `bg-brand-500 text-white rounded-xl font-semibold`

**States:**
- Default: `bg-brand-500`
- Hover: `bg-brand-600`
- Active/Pressed: `bg-brand-700 scale-95`
- Disabled: `bg-neutral-300 text-neutral-500 cursor-not-allowed`
- Loading: Spinner replaces label, same bg

**Sizes:** sm (h-36px, text-sm), md (h-44px, text-base — default), lg (h-52px, text-lg)

**Touch target:** Always minimum 48px height on mobile.

---

### 5.2 SecondaryButton

**Visual:** `bg-white border-2 border-brand-500 text-brand-600 rounded-xl font-semibold`

**States:**
- Hover: `bg-brand-50`
- Active: `bg-brand-100 scale-95`
- Disabled: `border-neutral-300 text-neutral-400`

---

### 5.3 GhostButton

**Visual:** `bg-transparent text-brand-600 rounded-xl font-medium` (no border)

Used for secondary actions like "Cancel", "Skip", "Learn more".

---

### 5.4 IconButton

**Props:** `icon`, `onPress`, `size` (`sm|md|lg`), `variant` (`ghost|outline|filled`), `ariaLabel` (required)

**Visual:** Square/circle button with icon only. Always has `aria-label`.

**Touch target:** 44x44px minimum on mobile.

---

### 5.5 FAB (Floating Action Button — Mobile)

**Purpose:** Primary mobile CTA — "Add Document" or "New Chat".

**Props:** `icon`, `label` (extended FAB), `onPress`, `position` (`bottomRight|bottomCenter`)

**Visual:**
- Mini FAB: 48x48px circle, `bg-brand-500 shadow-xl`
- Regular FAB: 56x56px circle, `bg-brand-500 shadow-xl`
- Extended FAB: Pill shape, icon + label

**Position:** `bottom: 88px` (above bottom tab bar), `right: 16px`

---

## 6. Finance-Specific Components

### 6.1 AmountDisplay

**Purpose:** Consistent INR currency formatting across the app.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `amount` | number | — | Raw amount in paise or rupees |
| `unit` | `paise\|rupees` | `rupees` | Input unit |
| `format` | `full\|compact\|symbol-only` | `full` | Display format |
| `sign` | `auto\|positive\|negative\|none` | `auto` | Show +/- sign |
| `size` | `sm\|md\|lg\|xl` | `md` | Text size |
| `colorCode` | boolean | false | Green for positive, red for negative |

**Formatting rules:**
- Indian number system: `₹1,23,45,678` (not `₹12,345,678`)
- Compact: `₹12.5L` (lakh), `₹2.3Cr` (crore)
- Symbol: `₹` always precedes the number (never suffix)
- Decimals: Show paise only when non-zero (`₹1,500` not `₹1,500.00`)

**Implementation:**
```typescript
function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
```

---

### 6.2 GSTRateChip

**Purpose:** Visual GST rate indicator on invoice rows.

**Props:** `rate` (0 | 5 | 12 | 18 | 28), `size` (`sm|md`), `showLabel` (boolean)

**Visual:** Colored pill with rate %:
- 0%: `bg-neutral-100 text-neutral-500`
- 5%: `bg-success-100 text-success-700`
- 12%: `bg-info-100 text-info-700`
- 18%: `bg-brand-100 text-brand-700`
- 28%: `bg-error-100 text-error-700`

---

### 6.3 StatusTimeline

**Purpose:** Visual workflow progress indicator — multi-step horizontal/vertical timeline.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `steps` | `{id, label, status, timestamp, description?}[]` | Timeline steps |
| `currentStep` | string | Active step ID |
| `orientation` | `horizontal\|vertical` | Layout direction |

**Step status visual:**
- `completed`: Green filled circle with checkmark
- `active`: Brand blue pulsing circle (ring animation)
- `pending`: Grey empty circle
- `error`: Red circle with X

**Connector lines:** Solid green between completed, dashed grey between pending steps.

---

### 6.4 DocumentCard

**Purpose:** Document list item / grid card.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `document` | DocumentDto | Document data |
| `view` | `list\|grid` | Display mode |
| `onPress` | function | Navigate to detail |
| `onShare` | function | Share action |
| `showOcrConfidence` | boolean | Show confidence indicator |

**Layout (list view):**
```
[Thumbnail 56x56]  [Category badge]
                   [Filename text-base font-medium]
                   [Date • Vendor • Amount]
                   [StatusBadge]      [OCR confidence dot]
```

**OCR confidence dots:**
- Green (>80%): auto-processed, minimal review
- Yellow (50-80%): needs attention
- Red (<50%): manual review required

---

### 6.5 InvoiceRow

**Purpose:** Single invoice line in GSTR-1 invoice list.

**Props:** `invoice` (InvoiceDto), `editable`, `selected`, `onSelect`, `onEdit`

**Layout:** Checkbox | Invoice No | Date | Party | Taxable | GST Rate | Tax | Total | Status | Actions

**Inline editing:** Tap/click any editable field to enter edit mode with inline input.

---

### 6.6 TaxBreakdownTable

**Purpose:** GST/ITR tax calculation breakdown display.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `items` | `TaxLineItem[]` | Tax components |
| `type` | `gst\|itr` | GST or income tax breakdown |
| `showComparison` | boolean | Old vs New regime (ITR) |

**GST layout columns:** Component | Taxable Amount | Rate | Tax Amount

**ITR layout:** Income Head | Amount | Exemptions | Taxable | Tax

**Comparison layout:** Income Head | Old Regime | New Regime | Difference (highlighted)

**Total row:** Bold, border-top-2, larger font.

---

## 7. Accessibility Standards

All components comply with:
1. **WCAG 2.1 AA** minimum — 4.5:1 contrast for normal text, 3:1 for large text
2. **Touch targets**: 44x44px minimum on mobile (Apple HIG / Google Material)
3. **Screen reader**: All interactive elements have meaningful `aria-label` or visible label
4. **Focus management**: Visible focus ring `ring-2 ring-brand-500 ring-offset-2`
5. **Keyboard navigation**: All interactive elements reachable and operable via keyboard (web)
6. **Error announcements**: Errors announced via `aria-live="polite"` region
7. **Loading states**: Spinners have `aria-busy="true"` and `aria-label="Loading..."`

---

## 8. Component States Summary

Every interactive component must implement all applicable states:

| State | Visual Treatment |
|-------|-----------------|
| Default | Base styles |
| Hover | Subtle background lightening or border color change |
| Focus | `ring-2 ring-brand-500 ring-offset-2` |
| Active/Pressed | Scale down 2-5%, darker shade |
| Disabled | 40-50% opacity, `cursor-not-allowed`, no pointer events |
| Loading | Spinner or shimmer, interaction blocked |
| Error | Red border/text, error message, error icon |
| Success | Green indicator, confirmation message |
| Empty | Empty state illustration + CTA |

---

## Redesign Updates (2026-04-05)

### Design System Changes

All components updated with the following design token changes:

| Token Group | Before | After |
|-------------|--------|-------|
| brand.500 | #2563EB (Blue) | #6366F1 (Indigo) |
| neutral.* | Gray scale | Slate scale (cooler) |
| accent.500 | #F59E0B (Amber) | #F97316 (Orange) |
| success.500 | #22C55E | #10B981 (Emerald) |

### Button Component Updates
- Border radius increased: sm=10, md=14, lg=16
- Primary variant: brand-colored shadow (shadowColor: brand.500, opacity: 0.3)
- Secondary variant: border reduced from 2px to 1.5px, neutral border color
- Added `danger` variant with error-colored shadow
- Label letter-spacing: 0.2
- Press animation: scale(0.98)

### Card Component Updates
- Default radius changed to xl (borderRadius: 20)
- Default border: off (shadow-first approach)
- Refined shadow values: lower opacity, larger blur radius
- Press animation uses scale(0.98) transform

### Input Component Updates
- Background: white instead of neutral.100
- Border: 1.5px neutral.200 (was 1px neutral.300)
- Focus ring: brand-tinted shadow glow
- Error ring: error-tinted shadow glow
- Label weight: 600 (was 500), letter-spacing: 0.1
- Height: md=50px (was 48px)
- Border radius: 12px (was 8px)

### Header Pattern (New Standard)
All secondary screens now use a consistent back button:
```
<Pressable style={styles.backBtn}>
  <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
</Pressable>
```
With styling: `width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100]`

### New Dependency
- `expo-linear-gradient` (~14.0.2) added for gradient backgrounds on:
  - SplashScreen, HomeScreen hero, LoanHubScreen hero, EMICalculatorScreen result, HomeScreen quick action icons

---

## Phase 6A Additions (2026-04-25)

### StatusTimeline — `actor` prop extension
- **New optional prop:** `actor?: { name: string; avatarUrl?: string }` — when provided, renders `Avatar` size=xs inline before the actor name on each timeline row.
- Non-breaking; existing call sites without `actor` continue to render as before.
- Consumed by: GstReturnReviewPage audit trail, CallbackDetailPage timeline.
- **New optional prop:** `orientation?: 'vertical' | 'horizontal'` (default `'vertical'`). Horizontal variant used in CallbackDetailPage stepper.

### StatusBadge — Document processing statuses
Append to document status table:
| Status | Color variant | Icon | Motion |
|---|---|---|---|
| QUEUED | neutral | clock | static |
| UPLOADING | info | arrow-up-circle | rotating icon |
| PROCESSING | brand (alias `processing`) | sparkles | pulsing 6px dot prefix |
| READY | success | check-circle | static |
| FAILED | error | alert-triangle | static |

### DocumentCard — `footerSlot` prop extension
- **New optional prop:** `footerSlot?: ReactNode` — renders below the body row with 12px top margin.
- Used to surface Retry/Remove CTAs on FAILED uploads.

---

## Phase 6E Additions (2026-04-25)

### StatusBadge — Callback statuses
| Status | Color variant | Icon |
|---|---|---|
| PENDING | warning | clock |
| SCHEDULED | info | calendar |
| IN_PROGRESS | brand | phone-call |
| COMPLETED | success | check-circle |
| FOLLOW_UP_NEEDED | accent | rotate-ccw |
| ESCALATED_TO_CA | error | arrow-up-circle |
| CANCELLED | neutral (strikethrough label) | x |

All pairs (variant-100 bg + variant-700 text) verified WCAG AA ≥ 4.5:1.

### Toast — No new variants required
Callback events reuse `success`, `info`, `error` variants. Motion and placement unchanged.

### New composite components (detailed specs in linked docs)
- `RequestCallbackCTA` — `docs/design/mobile/callbacks/request-callback-cta.md`
- `CallbackStatusChip` — described inline in the CTA spec (pending-state variant)
- `NotificationRow` — `docs/design/admin/notifications/notification-center-enhancements.md`
- `NotificationPreviewPopover` / `NotificationPreviewSheet` — same file as above

### Stepper (via StatusTimeline horizontal)
Used on CallbackDetailPage to visualize state transitions. Branch steps (FOLLOW_UP_NEEDED, ESCALATED_TO_CA, CANCELLED) render via dashed connectors below the happy path. Invalid transitions disabled with tooltip.

---

## Phase 6B Additions (2026-04-25)

### StatusBadge — Notice statuses
| Status | Variant | Icon |
|---|---|---|
| RECEIVED | info (info.100 + info.700) | inbox |
| UNDER_REVIEW | warning (warning.100 + warning.800) | eye |
| RESPONDED | accent (indigo.100 + indigo.700) | send |
| CLOSED | success (emerald.100 + emerald.700) | check-circle |

All pairs verified WCAG AA ≥ 4.5:1.

### StatusBadge — Invoice statuses (GSTR-1 line items)
| Status | Variant | Icon |
|---|---|---|
| DRAFT | neutral | file |
| VALIDATED | info | check |
| ERROR | error | alert-triangle |
| FINAL | success | lock |

### StatusBadge — IRN / EWB statuses
IRN: `not_applicable` (slate), `not_generated` (slate), `generating` (info, spinner), `generated` (success), `failed` (error), `cancelled` (warning, strikethrough text).
EWB: same enum plus `active` (success) and `expired` (error).

### New composite components (detailed specs in linked docs)
- `DueDateChip` — `docs/design/admin/gst/notice-tracker-list-page.md` §6.1. Compact countdown chip; reused on web (notice list, e-invoice cards) and mobile (notice inbox row, NIL return detail card).
- `SelectionToolbar` — same file §6.2. Floating bulk-action bar above DataTable.
- `NoticeRowCard` (web ≤ 768px) — same file §6.4.
- `NoticeRowMobile` — `docs/design/mobile/gst/notice-inbox-screen.md` §6.
- `PdfViewer` — `docs/design/admin/gst/notice-detail-page.md` §6.1. Page nav, zoom, download, print, text selection.
- `AttachmentList` — same file §6.2. Per-row upload progress, retry, virus-scan state, remove.
- `EditableDataGrid` — `docs/design/admin/gst/invoice-detail-tab.md` §6.1. Generic spreadsheet-grade inline editor.
- `HsnSacTypeahead` — same file §6.2. Combobox with 300ms debounce, max 10 results, recent-codes section, full WAI-ARIA combobox.
- `IrpStatusCard` / `EwbStatusCard` — `docs/design/admin/gst/e-invoice-eway-status-views.md`. QR rendering, validity countdown, copy, cancel/extend.
- `NoticesDueWidget` — `docs/design/admin/gst/notices-due-widget.md`.
- `ResultScreen` (mobile) — `docs/design/mobile/gst/nil-return-confirm-screen.md` §8. Generic post-action success/info screen.

### Toast — No new variants required
Notice + invoice + IRN + EWB events reuse existing `success`, `info`, `warning`, `error` variants.

---

## Phase 7 — GSTN IMS (Invoice Management System) Additions

> Full spec: `docs/design/ims-inbox-spec.md`. Statuses are the EXACT backend `ImsInvoice.Status` / GSTR-1A vocabulary. All pairs icon+text, validated WCAG AA per `accessibility-standard.md` §4.

### StatusBadge — IMS invoice statuses
| Status (API verbatim) | Variant | Icon |
|---|---|---|
| PENDING | warning (Amber) | clock |
| ACCEPTED | success (Emerald; **text `success[700] #047857`**) | check-circle |
| REJECTED | error | x-circle |
| PENDING_KEPT | info | pause-circle |

When `deemedAccepted = true`, append a muted "Deemed" `Tag` beside the ACCEPTED badge.

### StatusBadge — GSTR-1A amendment statuses
| Status | Variant | Icon |
|---|---|---|
| DRAFT | neutral | file-pen |
| SUBMITTED | info | send |
| FILED | success | check-circle |

### DueDateChip — IMS deemed-acceptance reuse
Reuse the existing `DueDateChip` (countdown) for "days until deemed acceptance" with IMS-specific thresholds: ≤3 days = error, 4–7 = warning, >7 = neutral, past/swept = info "Deemed accepted". Suppress countdown once an explicit terminal action (ACCEPTED/REJECTED) exists. Thresholds + a11y labels in `ims-inbox-spec.md` §4.

### New composite components (detailed specs in `docs/design/ims-inbox-spec.md`)
- `ImsInvoiceCard` (mobile) — §3.1. Card composition of supplier/GSTIN/invoice/amounts/status/DueDateChip + 44pt action zone.
- `RejectReasonModal` (web Dialog / mobile bottom sheet) — §6.2. Required multiline reason (client rule; reason is optional server-side) + quick-pick chips; focus-trapped; shared by single + bulk reject.
- `Gstr1aCreateForm` — §9.3. Amendment type Select + read-only original-invoice fields + editable tax rows serialized to `amendmentPayloadJson`.

### Toast — undo affordance
Accept / Keep-pending / Reject success toasts carry a 5s **Undo** (re-action to prior status; PENDING→undo lands on PENDING_KEPT). No bulk undo. Reuses existing `success` Toast variant.

---

## Phase 6D — ITR Engine Additions
> Date: 2026-04-25 — appended; do NOT replace prior entries.

### New primitives

#### Stepper (linear wizard)
Horizontal indicator for multi-step wizards (mobile primary; admin reuses for Mark-Filed modal).
- **Props:** `steps: { key, label }[]`, `currentIndex`, `completedKeys`, `onStepPress?`.
- **States:** completed (filled `color.success.500` + check), current (filled `color.brand.500`), upcoming (outlined `color.neutral.300`).
- **Accessibility:** each node `accessibilityRole="button"`, `accessibilityState={{selected, disabled}}`. Tappable only on completed steps.
- **Layout:** 32pt height; dots 16pt; 1px connectors.

#### PanInput
Extension of TextInput with PAN-specific masking + checksum validation.
- **Props:** all TextInput props, plus `validateChecksum?: boolean` (default true).
- **Mask:** `AAAAA9999A` (5 letters / 4 digits / 1 letter), auto-uppercase.
- **Validation:** regex + 4th-character business rule (P/F/C/H/A/T/B/L/J/G).
- **Variant:** `read-only` shows formatted with subtle copy icon.

#### AccordionSection
Collapsible section header + body for grouping long forms (used in DocChecklist deductions and FilingSummary).
- **Props:** `title`, `subtitle?`, `defaultOpen?`, `rightAdornment?`, `children`.
- **States:** collapsed (chevron right) / expanded (chevron down). Animated height transition 200ms ease-out.
- **Accessibility:** header is `accessibilityRole="button"` with `accessibilityState={{expanded}}`.

#### SummaryList
Read-only "label : value [Edit]" rows used in wizard Review step + filing summary.
- **Props:** `rows: { label, value, onEdit? }[]`, `density?: 'compact'|'cozy'`.
- **Layout:** label left `text-sm color.neutral.600`, value right `text-base font-medium tabular-nums`, Edit link rightmost (only if `onEdit` set).

#### ProgressRing
Circular progress for DocChecklistScreen.
- **Props:** `value`, `max`, `size?` (default 96pt), `strokeWidth?` (default 8pt), `label?`.
- **Accessibility:** `accessibilityRole="progressbar"`, `accessibilityValue={now,max}`.

#### CountdownCard
Days-remaining card with severity gradient (used in EVerification + Notice detail).
- **Props:** `dueDate`, `thresholds?: { warning: 14, error: 7 }`, `overdueCopy?`, `progressTotal?: 30`.
- **Variants:** info (> warning), warning (warning..error window), error (< error days), errorFilled (overdue).
- Progress bar inside the card uses `n/total` filled segments.

#### StatusTimeline (vertical variant)
Reuses Phase 6E StatusTimeline component but in vertical orientation for RefundTracker + FilingDetail e-verification block.
- **Props:** `nodes: { key, label, secondaryText?, state }[]`, `orientation: 'vertical'`.
- States: completed / current (pulse animation; respects `prefersReducedMotion`) / pending / failed.

#### DualPaneEditor
The signature primitive of the CA Computation Panel.
- **Props:** `left: ReactNode`, `right: ReactNode`, `defaultRatio?: number` (0.55), `minLeftPx?: 360`, `minRightPx?: 380`, `onRatioChange?`.
- Persists user's preferred ratio in localStorage keyed by panel id.
- Keyboard: focus splitter and use Left/Right arrows to resize in 16px increments.
- Mobile fallback: stacks vertically; right panel sticky-top.

#### ComputationCard + DeltaPill
ComputationCard renders a label + value + optional `delta` props. DeltaPill formats `Δ +₹Y` (success.700) or `Δ -₹Y` (error.700) with directional arrow icon and a screen-reader-only "increased by" / "decreased by" prefix.

#### RegimeBarChart
Bar chart used in mobile RegimeComparisonScreen and admin RegimeMiniBar.
- **Props:** `oldRegime: { taxPayable }`, `newRegime: { taxPayable }`, `recommendation: 'OLD'|'NEW'|'EQUAL'`, `compact?: boolean`.
- Recommended bar: `color.brand.500` + crown icon, other bar `color.neutral.400`.
- Currency labels: Indian format (lakh/crore) above each bar.
- Animation: bars rise from baseline 600ms ease-out (skipped if `prefersReducedMotion`).

#### ComputationVersionCard + DiffViewer
ComputationVersionCard lists a saved computation snapshot. Tap expands a DiffViewer:
- Two-column row diff with strikethrough for removed, color-coded for added.
- Both color and `+ / -` prefix used (color-blind safe).

#### RaiseGrievanceModal
Standardized modal for raising a refund-delay grievance or filing-related complaint. Subject + body + optional attachments. Reuses existing `Modal`, `TextInput`, `FilePicker`.

### Status badge map (filing lifecycle)

Consistent with existing Badge variant table:
| Filing Status | Variant | Icon |
|---|---|---|
| DRAFT | neutral | edit-3 |
| UNDER_CA_REVIEW | info | eye |
| USER_APPROVAL_PENDING | warning | clock |
| USER_APPROVED | accent | check |
| FILED | success | send |
| E_VERIFIED | success | shield-check |
| REFUND_ISSUED | success | indian-rupee |
| NOTICE_RECEIVED | error | mail-warning |
| REJECTED_BY_CA | error | x-circle |

### Notice severity map

| Severity | Sections | Variant | Icon |
|---|---|---|---|
| critical | 156 (demand), 143(2) (scrutiny) | error | alert-octagon |
| warning | 139(9) (defective), 245 (adjustment) | warning | alert-triangle |
| info | 143(1) (intimation) | info | info |

All variant pairs verified WCAG AA ≥ 4.5:1.

### Accessibility contract for live recompute (Phase 6D)
The CA Computation Panel surfaces values that change without user action. Right-panel ComputationCard is wrapped in an `aria-live="polite"` region; updates throttled to once per 500ms to avoid screen-reader spam. DeltaPills inside the live region include the `accessibilityLabel="increased by ₹X"` / "decreased by ₹X" pattern.

---

## Phase 6C — Loan Hub Additions
> Date: 2026-04-25 — appended; do NOT replace prior entries.

### New primitives

#### LoanProductCard (mobile + admin)
The catalog row used in `LoanHubScreen` and inside `LoanEligibilityScreen` result list.
- **Props:** `bank: { id, name, logoUri }`, `product: { name, amountMin, amountMax, tenureMin, tenureMax, rateMin, rateMax }`, `qualification: 'qualified'|'nearMatch'|'notQualified'|'unknown'`, `reason?: string`, `onPressDetails`, `onPressApply`.
- **Layout:** logo 40pt left, content middle, CTAs right; full card tap routes to details. Min height 140pt.
- **Variants:** by `qualification` — qualified (success outline), nearMatch (warning), notQualified (neutral), unknown (neutral, no badge).
- **Accessibility:** `accessibilityRole="button"`, full label = "{bank}, {product}, amount {min} to {max}, tenure {min} to {max} months, interest {min} to {max} percent, {qualification reason}".

#### BadgeQual
Small qualification chip used inside LoanProductCard and EligibilityHintRow.
- **Variants:** `qualified` (success), `nearMatch` (warning), `notQualified` (neutral), `unknown` (info).
- **Icon pairing:** check / triangle-warning / minus-circle / question-circle.

#### EligibilityHintRow
One-line reason row with icon + text.
- **Props:** `tone: 'success'|'warning'|'info'|'neutral'`, `text`.

#### ConsentSignatureBlock
Sticky-bottom block on `LoanConsentScreen`.
- **Props:** `consentEnabled: boolean` (gated by scroll-to-end), `signatureLabel` (interpolated name + dateTime), `onDecline`, `onSignContinue`, `loading?: boolean`.
- **Behavior:** checkbox disabled until `consentEnabled` true; primary CTA disabled until checkbox ticked; primary CTA invokes biometric re-auth before submit.
- **A11y:** disabled state announces "Scroll to end of document to enable acceptance."

#### ScrollHintBanner
Floating chip with arrow that fades out when scroll within 24pt of end.
- **Props:** `visible`, `text`.
- **Position:** bottom-center, 16pt above ConsentSignatureBlock.

#### PdfViewerMobile
Wraps `react-native-pdf` (or equivalent) for `LoanPackagePreviewScreen` + offline DocChecklist preview.
- **Props:** `source: { uri, headers? }`, `expectedWatermarkText?: string`, `onIntegrityFail?`, `onPageChanged`.
- **Features:** pinch-zoom, page indicator, accessibility text layer (uses PDF text content, not OCR), watermark integrity check on first render.
- **A11y:** page indicator announced via `liveRegion='polite'` on change.

#### PdfViewer-WebPackagePane (admin)
Variant of existing `PdfViewer` (Phase 6B) with watermark verification badge ("Watermark intact" / "Integrity failed") rendered above the canvas. Used in `LoanDetailPage > Documents` tab.

#### PackageMetaStrip
Single-row meta strip atop preview screens.
- **Props:** `pages`, `sizeBytes`, `generatedAt`, `packageId`, `onCopyId`.
- **Layout:** label/value pairs; copy-icon at right of packageId; Indian date format.

#### DisclaimerCard
Mandatory legal callout. Required wherever the loan package PDF is shown or transmitted.
- **Props:** `tone: 'info'|'warning'`, `body`, `compact?`.
- **Default copy (loan):** "Prepared by SnapAccount from user-provided data. Not a CA certification. Final lending decision rests with the partner bank."

#### BankAdapterTypeBadge
Compact chip for the adapter type column / partner-bank card.
- **Variants:** `email` (slate), `rest` (indigo), `oauth` (violet).
- **Icon pairing:** mail / cloud-upload / lock-key.

#### BankCommStatusBadge
Status of an outbound/inbound bank message.
- **Variants:** `queued` (neutral), `sent` (info), `delivered` (info), `responded` (success), `bounced` (error), `failed` (error).
- All paired with icon + text; WCAG AA verified.

#### BankHealthBadge
Card-level health on `PartnerBanksSettingsPage`.
- **Variants:** `healthy` (success · check), `degraded` (warning · alert), `down` (error · x), `inactive` (neutral · pause).

#### ConsentAuditCard
Read-only audit row used in admin LoanDetailPage / Consents tab.
- **Props:** `consentType`, `version`, `signedAt`, `signatureHashLast4`, `ip`, `userAgent`, `bioUsed`, `onVerifyHmac`, `onViewText`.
- Hash announced as "signature ending {last4}" not full hash.

#### PayloadViewer (admin)
JSON tree viewer with raw toggle for REST adapter payloads; sanitized HTML iframe for email bodies.
- **Props:** `kind: 'json'|'email'|'oauth-token'`, `payload`, `redactPaths?: string[]`.
- **A11y:** keyboard-traversable tree; iframe sandboxed without script execution.

#### MaskedSecretRow / SecretInput
Reuses Phase 6E secrets primitive; surfaces only last-4 of saved secret. Reveal action requires re-auth + writes audit log entry.

#### ProductChipsEditor (admin)
List + add modal for the loan products attached to a partner bank. Each chip shows product name + min/max range; tap opens edit modal.

#### LogoUploader
Client-side resize to 256pt square; PNG/SVG ≤ 100 KB; alt-text required field.

#### ETACountdownCard
Days-in-stage countdown for `LoanStatusScreen`.
- **Props:** `submittedAt`, `expectedMinDays`, `expectedMaxDays`.
- **Tone:** info during expected window, warning after expectedMin, error after expectedMax.

#### CelebrationOverlay (mobile)
Full-screen celebration used by `LoanStatusScreen` for APPROVED + DISBURSED. Generic primitive that Phase 6F will reuse.
- **Props:** `kind: 'approved'|'disbursed'|'custom'`, `headline`, `subline`, `primaryCta`, `secondaryCta`, `confettiTone?`, `autoDismissMs?`.
- **A11y:** focus moves to headline; respects `prefersReducedMotion` (no confetti, simple fade); ESC / back-button dismisses.

### Status badge map (loan lifecycle)

| Application Status | Variant | Icon |
|---|---|---|
| DRAFT | neutral | edit-3 |
| SUBMITTED | info | send |
| UNDER_REVIEW | info (pulse) | search |
| DOCS_REQUESTED | warning | alert-circle |
| APPROVED | success | check-circle |
| REJECTED | error | x-circle |
| DISBURSED | success | indian-rupee |
| CLOSED | neutral | archive |

All variant pairs WCAG AA ≥ 4.5:1; never color-only — icon + text always.

### Disclaimer copy (canonical — DO NOT alter without legal sign-off)

> "Prepared by SnapAccount from user-provided data. Not a CA certification. Final lending decision rests with the partner bank."

Required surfaces:
1. Mobile `LoanPackagePreviewScreen` DisclaimerCard above StickyFooter.
2. Every page footer of the generated PDF (rendered server-side by ReportService).
3. Email body of `EmailPartnerBankAdapter` outbound message.
4. Admin `LoanDetailPage > Documents` tab DisclaimerCard above the PDF preview.

### Watermark text (canonical)

> "Generated by SnapAccount | {orgName} | {date} | Package ID: {id} | Not a CA certification"

Diagonal across each PDF page, ≥18pt font, opacity 12%, color `color.neutral.900`.

### Consent text versioning rule

Every consent has a `consent_text_version` (semver-like, e.g., "1.4"). Bumping version is required when ANY change to body, list of recipients, scope, or retention. UI surfaces version + date in the document header. Old applications retain reference to the version they signed; never re-display "current" body in audit.

### Biometric re-auth surfaces (Phase 6C)

LocalAuthentication invoked at:
1. Mounting `LoanPackagePreviewScreen` (view-time gate).
2. Submitting from `LoanPackagePreviewScreen` (submit-time gate, separate from #1).
3. Each `Sign & continue` press on `LoanConsentScreen`.

Devices without biometrics fall back to device passcode. Refusal closes the screen with an explanatory toast.

### Reuse map (no new primitives needed)

The following Phase 6C surfaces reuse existing primitives without modification:
- `Stepper` (6D) — used in LoanConsentScreen step header.
- `AccordionSection` (6D) — LoanPackagePreviewScreen "What's inside".
- `SummaryList` (6D) — LoanApplicationScreen auto-rows.
- `StatusTimeline` (6D, vertical) — LoanStatusScreen + LoanDetailPage Timeline tab.
- `ProgressRing` (6D) — LoanEligibilityScreen score, LoanApplicationScreen checklist.
- `RaiseGrievanceModal` (6D) — LoanStatusScreen "Help / grievance" CTA.
- `KpiStrip`, `FilterBar`, `SelectionToolbar`, `DataGrid`, `EditableDataGrid` (6B) — admin Loans + BankComms pages.
- `PdfViewer` (6B) — LoanDetailPage Documents tab (with watermark badge wrapper).
- `Drawer`, `Modal`, `RadioGroup`, `KeyValueEditor` (existing) — PartnerBanksSettingsPage.
- `Toast` — no new variants.

---

## Phase 6F — Design System Refresh + Chat + Reports/Subscription/Team + Mobile UX
> Date: 2026-04-25 — appended; do NOT replace prior entries.

### New primitives

#### ChatBubble (admin + mobile variants)
- **Props:** `sender: 'self'|'other'|'system'`, `body: ReactNode` (markdown-lite supported), `time: Date`, `attachments?: Attachment[]`, `readReceipt?: 'sent'|'delivered'|'read'`, `edited?: boolean`, `onLongPress?`, `onReply?`.
- **Layout:** self = right-aligned, `--brand-500` bg / `--brand-on-primary` fg; other = left-aligned, `--surface-sunken` bg / `--text-primary` fg; system = centered pill, italic, neutral.
- **Max width:** 70% (web) / 78% (mobile) of pane.
- **A11y:** `role="article"` (web) / `accessibilityRole="text"` (RN) with full label "Message from {{sender}} at {{time}}".

#### TypingIndicator
- **Props:** `users: string[]`, `visible: boolean`.
- **Behavior:** ephemeral; debounce-driven; auto-dismiss 3s after last typing event. Multiple typers concatenated grammar-aware.
- **A11y:** `aria-live="polite"`, throttled to one announcement per 3s.

#### ReadReceipt
- **States:** sent (open circle), delivered (single check), read (double check `--brand-300`).
- **Props:** `state`, `timestamp?`. Tooltip on hover (web).
- **A11y:** `aria-label="Read at {{time}}"` etc.

#### MessageInput (web + mobile variants)
- **Props:** `value`, `onChange`, `onSend`, `attachments[]`, `onAttach`, `onCameraCapture?` (mobile), `onCannedReplies?`, `placeholder`, `maxLen?`.
- **Behavior:** Enter sends, Shift+Enter newline; auto-grow up to 6 lines (web) / 4 (mobile); attachment tray above input.
- **A11y:** `aria-multiline="true"`, `aria-label="Reply"`.

#### CategoryBadge
- **Props:** `category: 'taxQuery'|'gstNotice'|'loan'|'general'|'featureRequest'|'bug'`, `size?: 'sm'|'md'`.
- **Variants & tokens:** see `mobile/chat/chat-list-screen-refresh.md` §6 — all bg/fg pairs WCAG AA verified light + dark.
- **Pairing:** icon + text always; never color-only.

#### KeyboardShortcutsOverlay
- **Props:** `role: Role`, `route?: string`, `open`, `onClose`.
- **Layout:** modal 720px wide; two-column grid grouped by Navigation / Universal / List / Page-specific.
- **Behavior:** filter input narrows live; ESC closes.

#### CommandPalette
- **Props:** `open`, `onClose`, `onResult(item)`, `recents?`, `suggestedActions?`.
- **Pattern:** WAI-ARIA combobox; debounced async search; type-filter chips; per-type result sections.
- **Shortcuts:** `cmd/ctrl+k` toggles; `cmd+enter` opens in new tab; `cmd+.` copies id.

#### DarkModeToggle
- **Props:** `value: 'system'|'light'|'dark'`, `onChange`.
- **Behavior:** click cycles; long-press opens 3-radio menu.
- **A11y:** `aria-label`, `aria-pressed`; theme change announced via polite live region.

#### RoleGuard
- **Props:** `allow: Role[]`, `permissions?: string[]`, `fallback?`, `redirectOnDeny?: boolean`.
- **Behavior:** see `admin/design-system/role-based-shell.md` §4. Returns Skeleton during user resolution; redirects to `/403` on deny by default.

#### NetworkQualityChip
- **Props:** `quality: 'excellent'|'good'|'slow'|'cellularPaused'|'offline'`, `queueSize?`, `onPress`.
- **Visibility:** hidden for excellent/good; visible only when actionable.
- **A11y:** descriptive label "Slow connection, 3 items waiting, double-tap for details".

#### HapticsTrigger
- Abstraction wrapping Expo `Haptics`. Globally gated by `Settings > Accessibility > Haptics`.
- **Methods:** `light()`, `medium()`, `success()`, `warning()`, `error()`, `celebrationSequence()`.

#### DateRangePicker
- **Props:** `value: {start, end}`, `onChange`, `presets?`, `minDate?`, `maxDate?`, `fyAware?: boolean` (default true), `align?`.
- **Presets (default):** Today, Yesterday, Last 7d, Last 30d, This month, Last month, FY 25-26, FY 26-27, Custom.
- **Pattern:** WAI-ARIA grid; arrow-key day nav; PageUp/Down month; Shift+Page year.

#### Combobox
- **Props:** `value`, `onChange`, `options | onSearch(q)`, `multi?`, `recents?`, `placeholder`, `maxResults?`.
- **Pattern:** full WAI-ARIA combobox.
- **States:** loading shimmer in listbox; "No results" empty.

#### DropdownMenu
- **Props:** `trigger`, `items: MenuItem[]`. Items can be `default`, `destructive`, `disabled`. Supports `Separator`, `CheckboxItem`, one-level submenu.
- **Pattern:** keyboard arrow nav, type-ahead first letter.

#### Heatmap (Team workload)
- **Props:** `rows: { id, label }[]`, `columns: Date[]`, `value(row, col): number`, `scale?: 'sequential'|'diverging'`, `onCellPress`.
- **A11y:** each cell has full descriptive label; high-contrast mode uses pattern + intensity.

#### RoleChip
- **Variants:** ADMIN=indigo, CA=teal, LOAN_OFFICER=violet, OPS=amber. Light + dark token pairs.
- **Pairing:** icon (shield, briefcase, bank, headset) + text.

### Extended primitives

#### Skeleton — new variants
`shell` (full app-shell), `dataTableDense`, `chart`, `pdf`. All respect `prefers-reduced-motion` and use light/dark tokens. (See `admin/design-system/missing-primitives.md` §1.)

#### EmptyState — new variants
`empty.callbacks`, `empty.chat.thread`, `empty.chat.inbox`, `empty.reports`, `empty.subscriptions`, `empty.team`, `empty.search.noResults`, `empty.notice.inbox`, `empty.loans.applications`. Illustrations are inline SVG using `currentColor` for theme adaptation. Optional primary + secondary CTAs.

#### Dialog — new modes
- `Confirm.Destructive` — requires typing entity name to confirm.
- `Wide` size (720px) for two-column forms.
- `scrollableBody` — header/footer pinned, body scrolls (long T&Cs).

#### Drawer — new options
- `placement="bottom"` (mobile-web sheets).
- `size="lg"` (720px).
- Snap-points 30/70/100% on mobile.

#### Tabs — new variants
- `pills` (rounded chip tabs).
- `vertical` (Settings, Reports left rail).
- `scrollable` (horizontal overflow with shadow fade + chevrons).
- `badgeSlot` (counter chip aligned right; live-region update).

#### Stepper — new variants
- `numbered` (numbered dots vs check-icon).
- `branching` (state-machine variants for Callbacks).

#### ErrorBoundary — new scopes
- `scope="pane"` for widget-level isolation (e.g., MRR chart fails without taking down SubscriptionsPage).
- `scope="route"` (default).
- Reports redacted stack to backend `/clientErrors`.

#### DataTable — `density="compact"`
Row 32px, header 36px, font 13px, tabular-nums. Toolbar density toggle persisted per-table-id in localStorage. Used: BankComms log, AuditTrail, Subscriptions, Team.

#### CelebrationOverlay — new `kind` variants
- `firstGst`, `firstRefund`, `firstItr`, `firstNoticeResolved`, `planK2Step15`, `firstChatResolved`. (Existing: `loanApproved`, `loanDisbursed`, `custom`.)
- Server-guarded (fired-once per user per kind).
- Reduce-motion fallback (static icon, fade vs scale-bounce).
- Haptic sequence: Success then 2× Light 60ms apart on mount.

### Status badge map (chat lifecycle)

| Thread status | Variant | Icon |
|---|---|---|
| OPEN | info | message-circle |
| PENDING_USER | warning | clock |
| RESOLVED | success | check-circle |
| ESCALATED | error (pulse) | arrow-up-circle |
| REOPENED | accent | rotate-cw |

All variant pairs WCAG AA ≥ 4.5:1; never color-only — icon + text always.

### Status badge map (subscription lifecycle)

| Status | Variant | Icon |
|---|---|---|
| ACTIVE | success | check-circle |
| TRIALING | info | flask |
| PAST_DUE | warning | alert-circle |
| CANCELLED | neutral | x-circle |
| PAUSED | neutral | pause-circle |

### Status badge map (queue/document upload)

| State | Variant | Icon |
|---|---|---|
| QUEUED | neutral | clock |
| UPLOADING | info | up-arrow + progress ring |
| PROCESSING | info | sparkles |
| READY | success | check-circle |
| FAILED | error | alert-triangle |

### Dark-mode contract (Phase 6F-wide)
- Every text/bg pair verified ≥ 4.5:1; UI components ≥ 3:1.
- PDF/WebView content NEVER auto-inverted (financial documents preserved).
- Print stylesheet always uses light tokens.
- Theme transition 200ms, collapsed to 0ms under `prefers-reduced-motion`.
- Set `data-theme` on `<html>` BEFORE first paint via blocking inline script (no flash).

### Disclaimer copy reused (no changes)
Phase 6C canonical disclaimer is reused in: ReportsPage share-with-bank flow, Subscription upgrade modal (proration disclosure), Loan PDFs (unchanged). Dark-mode legibility verified on `--surface-raised` AND `--surface-sunken`.

### Reuse map (Phase 6F surfaces — no new primitives needed)
- All Phase 6A–E primitives — used unchanged.
- `KpiStrip`, `DeltaPill` (6B/6D) — Subscriptions Overview.
- `StatusTimeline` (6D) — Chat thread peek + Subscription history.
- `DisclaimerCard` (6C) — Reports share modal, Subscription upgrade modal.
- `Toast` — no new variants.
- `PdfViewer` (6B) — Reports preview pane.
- `BadgeQual` (6C) — reused in Plan eligibility chips on Subscriptions plan list.

---

## Auth & RBAC Module (Module 1) — new components

> Added 2026-05-29 by ui-ux-agent. Screens: docs/design/screens/web-admin/auth-rbac-*.md.
> Multi-tenant roles + constrained delegation. Extends existing primitives; nothing replaced.

### Delegation pattern (cross-cutting — the CRITICAL rule)
A permission/role control is **interactive only if** its key ∈ the caller's grantable set
(`GET /auth/me/grantable-permissions`). Otherwise it renders **disabled/greyed**:
text → `--text-tertiary`, a 14px `lucide Lock` icon, `Switch`/option in `disabled` state
(track `neutral.200`/`neutral.700` dark, thumb `neutral.400`, `cursor:not-allowed`,
`aria-disabled`, out of tab order — but the lock icon stays focusable to reach the tooltip).
`Tooltip` copy: i18n `roles.matrix.notGrantable` (perms) / `members.role.notAssignable` (roles).
Existing grant values are NEVER hidden — a disabled-ON switch shows ON, just uncontrollable.
UI assistance only; server is authoritative (403 on escalation → toast + revert rejected rows).

#### RoleListItem (NEW)
- Left-rail selectable row. Radio-select semantics (`role="option"` in a `listbox`).
- Content: `RoleChip` + role name, member count, `system`/`custom` tag, selected accent
  (`color.brand.500` left-border 3px + `brand.50`/`brand.950` bg tint).
- States: default / hover / selected / system (read-only badge). Min height 44px.

#### PermissionModuleSection (NEW)
- Collapsible disclosure grouping permission rows by module (Organization, Roles, GST,
  Accounting, Documents, ITR, Loans, Chat, Callbacks…).
- Header: chevron + module name + "N of M granted" counter + "Select all in module" control.
- "Select all" toggles ONLY grantable rows; disabled entirely if module has zero grantable
  rows (tooltip `roles.matrix.selectAllGrantableOnly`).
- `aria` disclosure pattern; module color accent from `color.module.*` where applicable.

#### PermissionRow (NEW)
- Label + permission key (`--font-mono`, `--text-tertiary`) + `Switch`.
- Variants: grantable (interactive) / non-grantable (disabled per delegation pattern) /
  rejected (rose `error.500` 3px left-border after a server 403, reverts then clears).
- `Switch` reuses existing Toggle (§1.9) with `disabled` state.

#### DirtySaveBar (NEW)
- Sticky bottom bar, appears when draft ≠ saved (slide 200ms; 0ms reduced-motion).
- Shows "{n} changes unsaved" (`aria-live="polite"`) + Discard + Save (primary, spinner on save).
- `shadow.md` to elevate above content. `cmd/ctrl+S` saves when dirty. Used by Role Matrix.

#### CreateRoleDialog (NEW)
- `Dialog size="md"`: name (req) + description (140). Duplicate-from-system pre-checks the
  source role's grants ∩ caller grantable set; excluded perms noted inline.

#### OrgSwitcher (NEW, SUPER_ADMIN only)
- Header dropdown to set active org context on platform screens. Hidden for ORG_ADMIN/employees.
- Searchable; shows org name + status pill. `combobox` semantics.

#### CreateOrgDialog (NEW, platform)
- Org legal name (req), GSTIN (15-char validated, optional), PAN (XXXXX9999X, optional),
  primary admin email + phone (fires first Org-Admin invite). Mono font for GSTIN/PAN.

#### InviteMemberDialog (NEW — extends TeamPage InviteDialog)
- Adds: contact-method `SegmentedControl` (Email | Phone), `PhoneField` (+91 chip + 10-digit
  numeric), delegation-aware `RoleCard` radios (non-assignable roles disabled per pattern),
  optional message. Org-scoped `POST /auth/org/members/invite`.

#### SegmentedControl (NEW)
- `radiogroup` of pill segments; used for Email|Phone contact method. Selected = `brand.500`
  fill + white text; rest = `--surface-sunken`. Min 44px targets.

#### PhoneField (NEW)
- Fixed `+91` prefix chip (`radius.full`, `--surface-sunken`) + 10-digit numeric input
  (`inputmode="numeric"`, `maxlength=10`). Uses Shared `PhoneNumber` format. Reusable across
  invite flows. `aria-describedby` shows format hint.

#### RoleCard (NEW — radio variant)
- Radio-selectable card: `RoleChip` + short description. Variants: default / selected
  (`brand.500` border + `brand.50` bg) / disabled (delegation: greyed + lock + tooltip).

#### AuthCardShell (existing, reused) + invite-acceptance terminal cards
- Invite acceptance reuses the centered auth card layout (auth.md). Terminal states
  (expired/revoked/accepted/invalid) render as semantic-tinted status cards (icon + text + CTA).
- `PasswordStrengthMeter` — labeled meter (`error→warning→success` ramp), text label not color-only.

### Increment 1.1 — Permission Catalog (added 2026-05-29)
> Screen: docs/design/screens/web-admin/auth-rbac-permission-catalog.md (SUPER_ADMIN, `/settings/permissions`, gated `platform.permissions.manage`). i18n via `@/i18n` `t()` (NOT react-i18next).

#### Callout / InfoBanner (NEW — lightweight)
- Persistent informational banner. `variant="info"` = `color.info.50` bg / `color.info.700` text /
  `color.info.500` left accent (3px) + `lucide Info` icon. `role="status"` (not alert).
- Dismissible-per-session (X) but reappears next visit. Other variants follow semantic ramp
  (warning/success/error 50/700/500) for reuse elsewhere.
- First use: the "permissions are inert until enforced in backend code" caveat above the catalog table.

#### CreatePermissionDialog (NEW)
- `Dialog size="md"`. Resource `Combobox` (existing resources or type new, `[a-z0-9_]+`) + Action
  free text (may contain dots) → **live mono code preview** `resource.action` validated against
  `^[a-z0-9_]+(\.[a-z0-9_]+)+$` per keystroke (green check valid / `error.500` hint invalid;
  submit disabled while invalid). Description required. Condensed caveat in footer. Duplicate (409)
  → inline error on preview. `POST /auth/permissions`.

#### EditPermissionDialog (NEW)
- `Dialog size="md"`. Code read-only (immutable, with note). Edit Description + Active toggle.
  `PUT /auth/permissions/{id}`.

#### Permission Catalog reuse (no new primitives)
- `PermissionModuleSection` (Module 1) — same module grouping as the Role Matrix.
- `DataTable density="compact"` — catalog rows (Description / Code mono / # roles / Active toggle / Actions).
- `Toggle` (§1.9) — inline active flag. `SegmentedControl` (Module 1) — Active|Inactive|All filter.
- `Dialog` confirm — deactivate (soft-delete) with role-reference warning (count via `warning` tint).
- Mono codes are copy-on-click (Tooltip "Copied", keyboard-reachable, `aria-live`).

### Increment 1.3 — Admin Add User (added 2026-05-29)
> Screen: docs/design/screens/web-admin/auth-rbac-add-user-dialog.md. Triggered from UserListPage `/users`. i18n via `@/i18n` `t()` (NOT react-i18next), keys under `users.addUser.*`.

#### AddUserDialog (NEW — composition, no new primitives/tokens)
- `Dialog size="lg" scrollableBody`. Create a user + assign role + per-user permission overrides.
- Scope `SegmentedControl` (Platform | Organization). Platform shows a `Callout variant="warning"`
  (SYSTEM_ADMIN is SUPER_ADMIN-only) and may be disabled for non-platform admins. Organization shows
  an org `Combobox` + org Role.
- Identity: Full name, Email, `PhoneField` (+91), optional DEV-only Initial password + `PasswordStrengthMeter`
  (email-or-phone required).
- Role = `RoleCard` radios from `GET /auth/assignable-roles?scope=` (non-assignable → disabled lock+tooltip,
  delegation pattern). Picking a role shows a read-only inherited-permissions chip preview.
- **Permission overrides** = `PermissionModuleSection` + `Toggle` matrix for EXTRA direct grants. Three
  row states beyond the Role Matrix: grantable (interactive), **inherited-from-role** (dimmed + `✓ inherited`
  `success` Badge, disabled ON, not counted), **non-grantable** (greyed + Lock + tooltip — same delegation rule).
  Only grantable+not-inherited toggles feed `permissionIds[]`.
- Live **effective-permissions** summary (role ∪ overrides, deduped, `aria-live`). Submit `POST /auth/admin/users`;
  server 403 Role.PrivilegeEscalation → toast + revert offending rows/role.

### Increment 1.4 Phase A — Reference Data (master data) (added 2026-05-29)
> Screen: docs/design/screens/web-admin/auth-rbac-reference-data.md (SUPER_ADMIN, `/settings/reference-data`, gated `platform.refdata.manage`). i18n via `@/i18n` `t()` (NOT react-i18next), keys under `refdata.*`. Sibling of Permission Catalog.

#### ReferenceDataDialog (NEW — create + edit, one dialog)
- `Dialog size="md"`. Manages `auth.reference_data` rows. Category locked to current tab (read-only).
  Fields: Name, Code (mono, live format-validated, immutable on edit), Sort order (numeric), Active `Toggle`.
- **Country parent `Combobox`** shown ONLY for the STATE category (sourced from
  `GET /auth/reference-data?category=COUNTRY&activeOnly=true`, `Name (CODE)`) → `parentCode`. Required for STATE.
- Duplicate `(category, code)` → 409 inline on Code. `POST` / `PUT /auth/reference-data`.

#### Reference Data reuse (no new primitives)
- `SegmentedControl` (Module 1) — category switch (Languages|User Types|Genders|States|Countries),
  active category mirrored in URL `?category=`; second `SegmentedControl` = Active|Inactive|All filter.
- `DataTable density="compact"` — Name / Code(mono, copy-on-click) / Country(parent, STATE-only) / Active `Toggle` / Sort order / Actions. Default sort by sortOrder.
- `Dialog` confirm — delete with **in-use 409 guard**: on 409 the dialog swaps to a non-destructive
  "still in use" message + a "Deactivate instead" action (`PUT {isActive:false}`). COUNTRY-with-states warns first.
- `Combobox` (OrgSwitcher base) reused for the STATE parent country picker.

### Increment 1.4 Phase B — Full User CRUD (added 2026-05-29)
> Screen: docs/design/screens/web-admin/auth-rbac-user-crud.md. Extends AddUserDialog (Incr 1.3) + new EditUserDialog + delete/deactivate UX on UserListPage/UserDetailPage. i18n via `@/i18n` `t()` (NOT react-i18next), keys `users.*` / `users.addUser.*` / `users.edit.*`.

#### AddUserDialog — extended (no new primitives/tokens)
- Now sectioned: **Identity** (full name, email/PhoneField, preferred language ←LANGUAGE, user type ←USER_TYPE [required, replaces auto-derive], active-on-create `Toggle`, DEV initial password) · **Access** (scope/role/overrides — unchanged from Incr 1.3) · **Profile/KYC** (collapsible `Disclosure`).
- Profile/KYC fields: PAN (uppercase, `^[A-Z]{5}[0-9]{4}[A-Z]$`, "encrypted at rest" lock affordance, SEC-013), Aadhaar last-4 (`^[0-9]{4}$`), DOB (`DatePicker` mode=date maxDate=today, FY off), Gender ←GENDER, address1/2, city, Country ←COUNTRY (default IN), State ←STATE, pincode (`^[0-9]{6}$`).
- **State↔Country dependency**: State `Select`/`Combobox` options filtered to STATE rows where `parentCode === selected country code`; disabled until country chosen; resets when country changes. Client logic over refdata, not a new component.

#### EditUserDialog (NEW — composition)
- `Dialog size="lg" scrollableBody`, prefilled from `GET /auth/admin/users/{id}`. Same sections.
- **Read-only once set:** Email + Phone (lock + note), Scope + Organization (display only). Editable: name, language, user type, status toggle, role (delegation-greyed), permission overrides (matrix prechecked from current `user_permission`, grantable/inherited/non-grantable), all Profile/KYC.
- PAN returned masked (`AAAA••••A`); "Change PAN" clears for re-entry; untouched → no PAN change (preserves encrypted value). Password NOT edited here (separate Reset password / Send invite action). Dirty-tracked Save. `PUT /auth/admin/users/{id}`; 403 escalation → toast + revert.

#### Delete / Deactivate (Users list + detail)
- Soft-delete labelled "Deactivate user" (distinct from existing Suspend). `Dialog Confirm.Destructive`.
- Guards: **self-delete** disabled+tooltip; **last active SUPER_ADMIN** blocked+message. Server may also 409 defensively → same messages. `DELETE /auth/admin/users/{id}`.

### Status badge map (member / org / invitation lifecycle)
| Entity status | Variant | Icon |
|---|---|---|
| Member ACTIVE | success | check-circle |
| Member SUSPENDED | neutral (or error in actions) | pause-circle |
| Member INVITED | warning | clock |
| Org ACTIVE | success | check-circle |
| Org SUSPENDED | neutral | pause-circle |
| Invite PENDING | warning | mail / clock |
| Invite ACCEPTED | success | check-circle |
| Invite REVOKED | neutral | x-circle |
| Invite EXPIRED | warning | clock |
All pairs WCAG AA ≥ 4.5:1 text / ≥ 3:1 UI; icon + text always, never color-only.

## Phase 7 Additions (2026-06-10)
> Wave 2 — DPDP Privacy Center + RBI Key Facts Statement. Appended; do NOT replace prior entries. All new components are compositions of existing primitives + tokens — no new tokens introduced.

### New composite components (detailed specs in linked docs)
> Full layout/state/interaction specs live in the screen docs; this section is the index + prop contract.

#### Key Facts Statement (KFS) — `docs/design/mobile/loans/key-facts-statement-screen.md`
- **`KfsTrustBanner`** — `AlertBanner` (§4.2) `info` variant, sticky under header; lock icon + "digitally signed, cannot be edited". Tap → signature explainer sheet. Props: `bankName`, `productName`, `onExplain`.
- **`AprHeroBlock`** — wraps `AmountDisplay` (§6.1) in `percent` mode at `typography.fontSize.4xl` / `fontWeight.bold`; the single largest numeric on screen. Props: `apr`, `nominalRate`, `interestType`. `accessibilityRole="text"` with a combined label.
- **`KfsAcknowledgeFooter`** — sticky bottom; mirrors `ConsentSignatureBlock` (loan-consent). `Checkbox` (§1.10) + `SecondaryButton` (Download PDF) + `PrimaryButton` (Continue). Both gates (scroll-to-bottom AND checked) required to enable Continue. Props: `enabled`, `onAcknowledgeChange`, `onContinue`, `onDownload`.
- Reuses: `SummaryList`/`TaxBreakdownTable`/`AccordionSection`/`CalloutCard`/`ScrollHintBanner` (no changes).

#### Privacy Center — `docs/design/mobile/privacy/privacy-center.md`
- **`PrivacyNavCard`** — `Card` (§2.1) + leading 24pt icon + title + optional `StatusBadge`/count chip + trailing chevron; ≥64pt tall. Variants: `default`, `destructive` (error tint, account deletion). `accessibilityRole="button"`.
- **`ConsentPurposeCard`** — `Card` with title + `StatusBadge` (Granted/Withdrawn), body description (server-supplied, localized, versioned), meta line (granted date · version), footer action `Withdraw`/`Re-grant`. Withdraw = `error`-text ghost button.
- **`ExportJobCard`** — async-job state machine card (`none | requested/processing | ready | expired | failed`) wrapping `ProgressBar` (§4.3) + `PrimaryButton`/`SecondaryButton` + tinted status; `accessibilityLiveRegion="polite"` on status change.
- **`DpoContactBlock`** — `Card` with labeled rows (name/email/phone/address/hours) + `Email`/`Call` actions in ≥44pt hit areas + SLA line. DPDP Rules 2025 published India-based contact (admin-configurable, never hardcoded).
- Reuses: `FilterTabs` (mobile), `Select`, `TextInput`, `FileUpload`, `EmptyState`, `ErrorState`, `Toast`, `Dialog`-style confirm (default focus on Cancel for destructive withdraw).

