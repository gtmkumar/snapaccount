# SnapAccount Mobile UI Redesign — Audit & Changes

## Date: 2026-04-05

## Design Direction
- **Premium Indian Fintech**: Inspired by Razorpay, PhonePe, CRED — professional B2B financial tool
- **Color System**: Shifted from Blue (#2563EB) to Indigo (#6366F1) — more modern, premium, distinctive
- **Neutrals**: Moved from warm Gray to Slate — cooler undertones feel more professional for financial data
- **Typography**: Tighter letter-spacing on headings (-0.3 to -0.5), larger font weights (800 for titles)
- **Border Radius**: Increased to 14-20px for cards/buttons — softer, more contemporary
- **Shadows**: Refined to subtle, color-aware shadows (brand-tinted FABs, lighter card shadows)

---

## Screen-by-Screen Audit & Changes

### Auth Flow

#### SplashScreen
**Before**: Blue (#1E40AF) background, circular logo, basic fade animation
**Issues**: Flat appearance, no depth, generic circle logo
**After**:
- Gradient background (brand.950 to brand.700) using LinearGradient
- Rounded-square logo shape (borderRadius: 32) — more modern
- Nested logo containers with glass-like transparency
- Staggered animation: logo slides up while fading in, tagline follows, bottom indicator last
- Softer tagline opacity (0.6 instead of direct color)

#### PhoneEntryScreen
**Before**: Gray background, basic phone icon in circle, standard layout
**Issues**: Felt like a generic template, no visual identity
**After**:
- White background for a cleaner, more confident feel
- Shield-checkmark icon communicating security/trust
- Multi-line heading with tight letter-spacing for impact
- Rounded icon containers (borderRadius: 28/20) instead of circles
- Social login buttons with left-aligned icons (Google/Apple logos)
- Refined divider text ("or continue with")

#### OTPVerifyScreen
**Before**: Standard centered layout with emoji icon
**Issues**: Emoji (envelope) felt unprofessional, back button was text-only
**After**:
- Proper back button with rounded container (neutral.100 background)
- Mail icon in branded container instead of emoji
- Error messages with icon + text row for better visibility
- "Verify & Continue" CTA label for clarity
- White background matching phone entry

#### LanguageSelectionScreen
**Before**: Standard card grid, basic checkmark circle
**Issues**: Cards felt cramped, checkmark was too small
**After**:
- Cleaner white background
- Language icon instead of map emoji
- Cards with 18px padding and 1.5px borders
- Selected state: brand shadow glow + brand background
- Proper checkmark with Ionicons instead of text character

#### BusinessProfileWizardScreen
**No major changes** — the wizard is well-structured. Minor updates to color tokens only.

#### PermissionRequestsScreen
**No major changes** — permission cards already well-designed. Color token updates propagate automatically.

### Main App

#### HomeScreen (Most impactful redesign)
**Before**: Solid blue hero, basic metric cards, flat quick actions
**Issues**: Hero felt heavy, metric cards were generic, quick actions lacked visual interest
**After**:
- Gradient hero (brand.900 to brand.700) with LinearGradient
- Greeting message ("Good morning/afternoon/evening") for personal touch
- Rounded avatar/button containers (borderRadius: 14 instead of 20)
- Net P&L with uppercase label and FY pill indicator
- Metric cards overlap hero section (-28px margin) for depth effect
- Metric cards with colored icon backgrounds and trend pills
- Quick action buttons with gradient icons (each module gets unique gradient)
- Deadline banner inside Card component with icon + text block layout
- Activity items inside Card with consistent icon styling (borderRadius: 12)
- Empty state with proper icon container
- FAB: borderRadius: 18 with brand-colored shadow

#### DocumentListScreen
**Before**: Standard list with basic filter chips
**Issues**: Filter chips were too generic, header actions cramped
**After**:
- Rounded header action buttons (borderRadius: 12)
- Filter chips with no border when inactive — cleaner appearance
- Sort bar with dropdown indicator
- Empty state with larger icon container and call-to-action button
- FAB with rounded-square shape matching overall design language

#### GstDashboardScreen
**Before**: Horizontal metric scroll, basic return cards
**Issues**: Metrics didn't show clear hierarchy, GSTIN display was subtle
**After**:
- Summary grid: 2 cards side-by-side for ITC/Output + full-width Net Payable card
- Net Payable card with pending count badge
- Each summary card has a colored icon circle
- Alert banners with rounded corners and border
- Return cards with type badge (colored pill) instead of bold text
- Due date badges with icon + text
- Consistent Card component usage throughout

#### LoanHubScreen
**Before**: Basic hero card, standard loan cards
**Issues**: Hero lacked depth, loan cards were flat
**After**:
- Gradient hero card with diamond icon
- Available amount in its own highlighted section
- Loan cards with 48px icon containers (borderRadius: 14)
- Government badge with success colors
- Bottom links as styled card-like pressables with chevrons

#### ITRDashboardScreen
**Before**: Basic three-column actions, text-only back button
**Issues**: Actions felt cramped, stub screen was bare
**After**:
- Proper back button with icon container
- Action buttons with icon containers (48px, borderRadius: 14)
- Empty state with large branded icon container
- Info banner with checkmark list items instead of bullet points
- Left border accent using ITR module color

#### ChatListScreen
**Before**: Simple list, text back button
**Issues**: Generic appearance, no visual distinction for categories
**After**:
- Proper back button, new chat button with brand background
- Avatar containers with rounded-square shape (borderRadius: 16)
- Category pills with subtle brand background
- Empty state with branded icon container and elevated CTA button

#### NotificationCenterScreen
**Before**: Standard notification list
**Issues**: Type icons were all same color, unread state was subtle
**After**:
- Per-type icon colors and backgrounds (GST=violet, ITR=cyan, etc.)
- Notification icon containers with borderRadius: 14
- Cleaner unread state
- Better empty state with icon container

#### ProfileScreen
**Before**: Standard menu list, text back button
**Issues**: Menu items were plain, organization card was basic
**After**:
- Avatar with brand-colored shadow for depth
- User type in styled pill
- Organization card with icon header and GSTIN row
- Menu items with per-item colored icon backgrounds
- Rounded card container for menu (borderRadius: 18)
- Sign out row with error-colored icon background

#### MoreScreen
**Before**: Grid of cards with basic icons
**Issues**: Cards were standard, user card was simple
**After**:
- User card with chevron button for edit action
- Grid items with larger icon containers (borderRadius: 14)
- Subtle shadows instead of borders for cleaner look

#### EMICalculatorScreen
**Before**: Standard sliders with basic result card
**Issues**: Sliders had no thumb indicator, result card was flat
**After**:
- Slider with visible thumb dot and brand-colored track
- Increase/decrease buttons with rounded-square shape
- Gradient result card (brand.900 to brand.700)
- Per-month label separated from EMI amount
- Divider line between EMI and breakdown
- Chart legend with percentages
- Consistent back button pattern

### Secondary Screens (inherited improvements)
- DocumentDetailScreen, DocumentCategoryScreen, CameraScreen
- GstApprovalScreen, Gstr3bScreen
- FinancialReportsListScreen, ReportDetailScreen
- LoanEligibilityScreen, LoanStatusScreen

These screens received color token updates automatically through the updated Colors constant. Back buttons on LoanEligibility and LoanStatus were updated to use the new icon-in-container pattern.

---

## Component Changes

### Button
- Border radius: 12 -> 14 (md), 16 (lg), 10 (sm)
- Primary: brand-colored shadow for depth
- Secondary: 1.5px border (down from 2px), neutral color instead of brand
- Added `danger` variant
- Letter-spacing: 0.2 for labels
- Press animation: scale(0.98) instead of 0.97

### Card
- Default radius: xl (borderRadius: 20) — up from lg (12)
- Default border: off — relying on shadow for definition
- Shadow values refined: lighter opacity, larger radius
- Press animation: scale(0.98)

### Input
- White background instead of neutral.100
- Border: 1.5px neutral.200
- Focus state: brand-colored ring shadow
- Error state: error-colored ring shadow
- Label font-weight: 600 (up from 500)
- Label letter-spacing: 0.1
- Increased height: md is 50px (up from 48)
- Increased padding and border-radius: 12

### Badge / StatusBadge
No structural changes — color token updates propagate automatically.

### AmountDisplay
No structural changes — color token updates propagate automatically.

---

## Color Palette Changes

| Token | Before | After | Rationale |
|-------|--------|-------|-----------|
| brand.500 | #2563EB (Blue) | #6366F1 (Indigo) | More modern, premium, distinctive |
| brand.600 | #1D4ED8 | #4F46E5 | Better pressed state contrast |
| brand.700 | #1E40AF | #4338CA | Richer dark brand for headers |
| neutral.* | Gray scale | Slate scale | Cooler, more professional for financial data |
| accent.500 | #F59E0B (Amber) | #F97316 (Orange) | More vibrant, better CTA contrast |
| success.500 | #22C55E | #10B981 (Emerald) | More refined green |

---

## Admin Web Recommendations (not implemented — mobile focus)

1. **Sidebar**: Add indigo gradient to match mobile brand colors
2. **Data tables**: Increase row padding, add subtle row hover states
3. **Dashboard cards**: Use same metric card pattern as mobile with colored icon backgrounds
4. **Forms**: Match Input component styling — white background, colored focus ring
5. **Navigation**: Use rounded-square icon containers for sidebar items
6. **Status badges**: Ensure consistency with mobile StatusBadge component
7. **Typography**: Adopt tighter letter-spacing for headings
