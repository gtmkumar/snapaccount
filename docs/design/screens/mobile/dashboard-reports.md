# Mobile Screens: Dashboard & Reports (Screens 8–11)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 8: Home Screen

**Purpose:** Central hub showing financial health snapshot, recent activity, and quick actions.

**Layout:**
```
[Status bar — light icons on brand gradient]

[TopNavBar: transparent over gradient]
  [Left: Business name + org switcher chevron]
  [Right: Bell icon with badge count, Avatar]

[Hero section: gradient bg brand-700→brand-500, padding-6]
  [FY label: "FY 2024-25" text-xs text-brand-200]
  [Net P/L: AmountDisplay xl — positive/negative color]
  [Label: "Net Profit/Loss" text-sm text-brand-100]

[Metric cards: horizontal scroll — 2.5 visible]
  [MetricCard: Sales — AmountDisplay + trend]
  [MetricCard: Expenses — AmountDisplay + trend]
  [MetricCard: GST Payable — AmountDisplay, color-gst accent]
  [MetricCard: ITR Status — badge if filing season]

[Section: "Financial Overview" text-lg font-bold — spacing-6]
  [Period selector: tabs Week / Month / Quarter / Year]
  [Chart: Bar chart — Sales (brand-500) vs Expenses (error-400)]
  [X-axis: months/weeks, Y-axis: INR compact format]

[Section: "Recent Activity" text-lg font-bold]
  [Activity items: icon + description + timestamp + amount]
  [Pull to refresh handles this section]
  ["View All" GhostButton]

[Bottom padding: 88px for BottomTabBar clearance]
```

**Key Components:**
- MetricCard (x4), AmountDisplay, Chart (react-native-chart-kit or Victory Native)
- TopNavBar, BottomTabBar, Avatar
- Activity feed items, StatusBadge

**Navigation:**
- Arrives: After login/onboarding, or from BottomTabBar (Home tab)
- Exits to:
  - Metric card tap → Financial Reports List
  - Activity item tap → Relevant detail screen
  - Bell icon → Notification Center
  - Avatar → Profile Screen
  - GST card → GST Dashboard
  - Org switcher → Organization switcher bottom sheet

**Key Interactions:**
- Pull-to-refresh: Refreshes all metric cards and activity feed with loading skeletons
- Metric card horizontal scroll with snap
- Chart: Tap bar to see tooltip with exact values
- Hero section swipe left/right to switch financial years
- FAB (bottom right): Quick capture document (opens Camera)

**Empty state (new user):**
- Metric cards show ₹0.00 with "Upload your first bill to get started" prompt
- Activity feed shows onboarding checklist cards

**Loading state:**
- Hero shows shimmer skeleton
- MetricCards show SkeletonMetricCard
- Chart shows grey rectangle shimmer

**Indian UX notes:**
- Amounts always in INR with Indian formatting (lakhs/crores)
- Highlight upcoming GST filing deadline if within 7 days (warning banner)
- Language switcher accessible from header for quick switch
- Financial Year awareness: April–March cycle, not Jan–Dec

---

## Screen 9: Financial Reports List

**Purpose:** Browse and access all financial report types.

**Layout:**
```
[TopNavBar: Back arrow, "Financial Reports" title, Filter icon right]
---
[FY Selector: segmented control — FY 2024-25 / FY 2023-24 / FY 2022-23]
---
[Reports grid: 2 columns]

[ReportCard: Trial Balance]
  [Icon: balance scale, brand-colored]
  [Label: "Trial Balance"]
  [Last generated: "Updated 2 hrs ago"]
  [PrimaryButton: "View" small]

[ReportCard: Profit & Loss]
  [Icon: bar-chart-up, success-colored]

[ReportCard: Balance Sheet]
  [Icon: building, brand-colored]

[ReportCard: Cash Flow]
  [Icon: arrows-flow, info-colored]

[ReportCard: Tax Liability]
  [Icon: calculator, gst-colored]

[ReportCard: Ledger]
  [Icon: book-open, neutral-colored]

[ReportCard: Comparative Analysis]
  [Icon: vs-chart — badge: "NEW"]

[ReportCard: Cash Flow Forecast]
  [Icon: trend-up — badge: "AI"]
---
[Export section card]
  [Heading: "Export for CA / Auditor"]
  [SecondaryButton: "Tally XML Export"]
  [SecondaryButton: "Standard CSV Export"]
```

**Key Components:** Card (grid), Badge ("AI", "NEW"), PrimaryButton, SecondaryButton, SegmentedControl (FY selector)

**Navigation:**
- Arrives: From Home Screen metric card tap, or Home → Reports
- Exits to: Report Detail Screen (on card tap)

**Key Interactions:**
- FY switcher changes all report cards to show that year's data
- Pull-to-refresh regenerates report summaries
- Export buttons trigger async export job with progress toast

**Loading state:** SkeletonCard x6 in 2-column grid

**Empty state (no data):** "No financial data for this period. Upload documents to get started."

---

## Screen 10: Report Detail

**Purpose:** Full view of a specific financial report (P&L, Balance Sheet, Cash Flow, etc.).

**Layout:**
```
[TopNavBar: Back arrow, "[Report Name]" title, Share icon + Download icon right]
---
[Report header card]
  [Business name, GSTIN]
  [Report type, Period: "April 2024 – March 2025"]
  [Generated: timestamp]
---
[Period comparison toggle: "Current vs Previous Year"]
---
[Report content — scrollable — varies by type]

--- For P&L ---
  [Section: "Income"]
  [Row: Sales ₹XX,XX,XXX]
  [Row: Other Income ₹X,XXX]
  [Total row: "Total Income" bold + larger amount]

  [Section: "Expenses"]
  [Row items: Purchase / Salary / Rent / etc]
  [Total Expenses]

  [Net P/L row: highlighted card — green or red]
  [Previous year comparison row if toggled]

--- For Balance Sheet ---
  [Assets section / Liabilities section]
  [Standard accounting format]

--- For Cash Flow ---
  [Operating / Investing / Financing sections]
  [Opening and closing cash balance]
---
[Bottom action bar]
  [SecondaryButton: "Download PDF"]
  [SecondaryButton: "Share"]
```

**Key Components:**
- TaxBreakdownTable (repurposed for report layout)
- AmountDisplay (multiple), StatusBadge
- Comparison toggle, TopNavBar, AmountDisplay (positive/negative color-coded)

**Navigation:**
- Arrives: From Financial Reports List
- Exits to: Report PDF Preview (on Download tap)

**Key Interactions:**
- Long-press on amount row: copy to clipboard
- Comparison toggle: Animated transition showing previous year column
- Share: Native share sheet with formatted text + PDF attachment option

**Loading state:** Full page skeleton matching report structure

**Indian UX notes:**
- All amounts in Indian number format (lakhs/crores)
- Financial year shown as "FY 2024-25" Indian convention (not calendar year)

---

## Screen 11: Report PDF Preview & Share

**Purpose:** Preview generated PDF report and share via WhatsApp, email, or bank link.

**Layout:**
```
[TopNavBar: Back (close), "Report Preview" title, Download icon right]
---
[PDF viewer: full-width scrollable PDF render]
  [SnapAccount branded header on first page]
  [Page indicator: "Page 1 of 3"]
---
[Bottom share action bar — sticky]
  [Icon buttons row:]
  [WhatsApp icon button: "WhatsApp"]
  [Email icon button: "Email"]
  [Share icon button: "Share with Bank" — generates bank-formatted link]
  [Download icon button: "Download"]
  [More icon: opens native share sheet]
```

**Key Components:** PDF viewer (react-native-pdf), IconButton (share options), BottomActionBar

**Navigation:**
- Arrives: From Report Detail (Download tap) or Report List (View PDF)
- Exits to: Back to Report Detail, or external apps via share sheet

**Key Interactions:**
- Pinch-to-zoom within PDF viewer
- Double-tap to zoom to fit
- "Share with Bank" generates a secure link (24hr signed URL) formatted with bank-required cover page
- WhatsApp share: Opens WhatsApp with PDF attachment pre-loaded
- Download: Saves to device Downloads folder with toast confirmation

**Loading state:** Spinner overlay while PDF generates, then fade-in on load

**Indian UX note:**
- WhatsApp share is highest-priority action — most Indian bankers and CAs communicate via WhatsApp. Place it prominently.
- "Share with Bank" is differentiated — banks need specific formatting with applicant consent note.
