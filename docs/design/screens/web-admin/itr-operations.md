# Web Admin Screens: ITR Operations (Screens 70–75)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 70: ITR Verification Queue

**Purpose:** Queue of employee ITR cases requiring document verification and tax computation review.

**Roles:** Support Executive, CA, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Dashboard > ITR > Verification Queue]
---
[Urgency summary bar]
  [MetricCard: "Pending Verification" count]
  [MetricCard: "Filing Deadline: Jul 31" — days countdown]
  [MetricCard: "E-verification Pending" — 30-day window cases]
  [MetricCard: "Callbacks Open" count]

[Filter bar]
  [Select: Status — All / Draft / Document Review / Pending Callback / Tax Computation / Pending Approval / Filing Queue / E-Verify Pending]
  [Select: Assigned CA]
  [Select: ITR Form Type — ITR-1 / ITR-2 / ITR-3 / ITR-4]
  [DatePicker: Submission date range]
  [TextInput: Search by name or PAN]

[ITR verification table]
  [Columns: Taxpayer Name | PAN | FY | Form | Documents | Status | Refund/Due | Deadline | Assigned | SLA | Actions]
  [Documents: progress indicator "7/12 docs" with color]
  [Refund/Due: AmountDisplay — green=refund, red=due]
  [Status: StatusBadge]
  [Actions: "Review" | "Assign" | "Trigger Callback"]

[Bulk: Select → Assign bulk → Export]
[Pagination: 25/50 per page]
```

**Key Components:**
- Table, MetricCard, StatusBadge, AmountDisplay, ProgressBar
- Filters, PrimaryButton, AlertBanner

**Navigation:**
- Arrives: Dashboard ITR widget, Sidebar ITR → Queue
- Exits to: ITR Document Review (Screen 71) on "Review"

**Role permissions:**
- Support Executive: Can view, trigger callbacks, assign
- CA: Sees own queue; reviews documents and tax computation
- Operations Manager: Full access

---

## Screen 71: ITR Document Review

**Purpose:** Review uploaded ITR documents, verify completeness and accuracy.

**Roles:** CA, Data Entry Operator (document quality check), Operations Manager

**Layout:**
```
[Full-width layout]
[Top bar: Back | Taxpayer: "[Name] — PAN: [masked]" | FY | StatusBadge | Assigned CA | Save | Next]

[Two-column layout: 55% left document viewer, 45% right checklist/data]

[LEFT: Document viewer]
  [Tabs: one per document type]
    [Form 16 Part A | Form 16 Part B | Form 26AS | AIS | Rent Receipts | etc.]
  [Document image / PDF viewer per tab]
  [Zoom controls, multi-page support]
  [OCR highlights overlaid on document]
  [Annotation: highlight tool for extracting key values]

[RIGHT: Verification panel]

  [Checklist progress: "8 of 12 verified"]
  
  [Per-document checklist rows]
    [Row: Form 16 Part A — Employer TAN: ✓ | Employee PAN: ✓ | TDS Amount: ✓ | FY Period: ✓]
    [Row: Form 26AS — TDS match: ⚠ "Difference of ₹240" | AY verified: ✓]
    [Row: Rent receipts — Landlord PAN: ✗ "Missing"]
    [Confidence indicator per extracted field]

  [Extracted key values panel]
    [Total Salary: ₹X,XX,XXX]
    [Total TDS Deducted: ₹XX,XXX]
    [Total Deductions: ₹XX,XXX]
    [Cross-verification status: green/orange/red]

  [Issues panel — if any]
    [Issue list: description + affected document + recommended action]
    [PAN mismatch | Amount discrepancy | Missing document | Illegible document]

  [Actions]
    [PrimaryButton: "Approve Documents — Proceed to Tax Computation"]
    [SecondaryButton: "Flag for Callback"]
    [GhostButton: "Reject — Request Re-upload" (per document or all)]

  [Notes field: TextInput multiline for CA notes]
```

**Key Components:**
- PDF/image viewer, Checklist (status per item), AmountDisplay
- AlertBanner (issues), PrimaryButton, SecondaryButton, GhostButton
- StatusBadge (per field confidence)

**Navigation:**
- Arrives: ITR Verification Queue "Review"
- Exits to: Tax Computation Panel (Screen 72) on document approval

**Key Interactions:**
- Click document tab: Loads that document in viewer
- Click checklist item: Jumps to relevant section in document viewer
- Issue row click: Opens annotation on document highlighting the issue
- "Flag for Callback": Triggers callback assignment with pre-filled context

---

## Screen 72: Tax Computation Panel

**Purpose:** Review and validate tax computation under both Old and New regime; finalize before filing.

**Roles:** CA (primary), Operations Manager

**Layout:**
```
[Full-width layout with sidebar]
[Breadcrumb: ITR > Queue > [Taxpayer] > Tax Computation]
---
[Taxpayer header card]
  [Name | PAN | FY 2024-25 | ITR Form: ITR-1 | Resident Status: Resident]
  [Summary: Gross Income | Total TDS | Net Tax/Refund]

[Regime comparison tabs: "Old Regime" | "New Regime" | "Comparison View"]

[Per-regime content: TaxBreakdownTable]

  [Income Schedule]
  [Row: Salary Income (Gross) ₹X,XX,XXX]
    [Sub-rows: Basic | HRA | Other Allowances | Perquisites]
  [Row: Less: Exemptions (HRA, LTA etc.) -₹XX,XXX (Old Regime only)]
  [Row: Less: Standard Deduction -₹50,000 / -₹75,000]
  [Row: Income from House Property ₹XX,XXX]
  [Row: Capital Gains ₹XX,XXX]
  [Row: Income from Other Sources ₹X,XXX]
  [Row: Gross Total Income — bold]
  [Row: Chapter VI-A Deductions (Old Regime only)]
    [Sub-rows: 80C ₹1,50,000 | 80D ₹25,000 | 80CCD ₹50,000 | etc.]
  [Row: Total Taxable Income — bold, highlighted]

  [Tax Computation Section]
  [Slab-wise tax table]
    [Row: Up to ₹X — Rate% — Tax ₹X]
    [... all applicable slabs]
  [Total Tax before cess]
  [Section 87A Rebate (if applicable) — warning if borderline]
  [Surcharge (if applicable)]
  [Health & Education Cess 4%]
  [Net Tax Payable]
  [Less: TDS Deducted (from Form 26AS) — breakdown by deductor]
  [Less: Advance Tax / Self-Assessment Tax Paid]
  [Final: Refund or Additional Tax Due — large AmountDisplay]

[Comparison view: side-by-side table with difference column]
  [AI recommendation: "New Regime recommended — saves ₹12,340"]
  [Override: CA can select regime regardless of AI recommendation]

[Editable fields — CA can override any computed value with audit note]
  [Edit mode toggle: "Edit Computation"]
  [Reason field: required when overriding AI calculation]

[Final actions]
  [Select: "Recommended Regime: [Old/New]"]
  [PrimaryButton: "Approve Tax Computation — Proceed to Filing"]
  [SecondaryButton: "Send Back for Clarification"]
```

**Key Components:**
- TaxBreakdownTable (full detailed version), AmountDisplay (pos/neg colored)
- SegmentedControl (regime tabs), AlertBanner (AI recommendation)
- Editable fields with audit trail, PrimaryButton, SecondaryButton

**Navigation:**
- Arrives: ITR Document Review approval
- Exits to: ITR Filing Queue (Screen 73) on approval

---

## Screen 73: ITR Filing Queue

**Purpose:** Queue of approved ITRs ready for submission to Income Tax Portal.

**Roles:** CA, Support Executive, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: ITR > Filing Queue]
---
[Summary: "24 ready to file | 3 require challan payment first"]

[Filing queue table]
  [Columns: Taxpayer | PAN | FY | Form | Regime | Refund/Due | Challan Status | Approved By | Ready Since | Actions]
  [Challan status: "Paid" (green) / "Required" (red) / "N/A" (neutral)]
  [Actions: "File ITR" | "View Computation" | "Check Challan" | "Download Draft"]

[Bulk filing: Select multiple → "File All Selected" with confirmation]

[Filing confirmation modal]
  [Summary: "Filing ITR for [Name], PAN [XXXXX]"]
  [Form type, FY, regime, net refund/due]
  [Confirmation checkbox: "I confirm this ITR is ready for submission"]
  [PrimaryButton: "Confirm Filing"]

[Filed status update]
  [ITR filed: Acknowledgment Number (ITR-V) displayed]
  [E-verification deadline auto-calculated (30 days from filing)]
  [Notification sent to user automatically]
```

**Key Components:**
- Table, StatusBadge, AmountDisplay, AlertBanner
- ConfirmModal, PrimaryButton

**Navigation:**
- Arrives: Tax Computation approval, or Sidebar ITR → Filing Queue
- Exits to: ITR record updated to FILED status

**Role permissions:**
- CA: Can file ITRs
- Support Executive: Can view, flag challan issues
- Operations Manager: Full access

---

## Screen 74: ITR Callback Queue

**Purpose:** Manage human-touch callbacks for ITR document issues and clarifications.

**Roles:** Support Executive, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: ITR > Callback Queue]
---
[KPIs: "9 open | FCR target: >75% | Avg call: 8-12 min"]

[Callback table]
  [Columns: Taxpayer | Phone | Trigger | FY | Priority | Status | Assigned | SLA | Actions]

  [ITR Trigger types:]
  [Missing Documents | Rejected Documents | Clarification Needed | Multiple Employers | Complex Situation | User Requested]

  [Actions: "Claim" | "Log Outcome" | "Reassign"]

[Callback detail — same structure as GST callback detail]
  [Taxpayer context: name, PAN, employment type, relevant documents]
  [Trigger context: specific missing/rejected document names]
  [Outcome form: resolution, follow-up needed, satisfaction (1-5)]
```

**Key Components:** Same as GST Callback Queue (Screen 67)

**Navigation:** Sidebar ITR → Callbacks, or Dashboard widget

**KPI targets:** FCR > 75%, avg call 8-12 min, response < 4 hours, satisfaction > 4.5/5

---

## Screen 75: ITR Notice Tracker

**Purpose:** Track and manage income tax notices received by users.

**Roles:** CA, Support Executive, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: ITR > Notices]
---
[Summary: "12 active notices | 2 require urgent response (143(2) scrutiny)"]

[Alert for 143(2) notices: Error banner — scrutiny notices require immediate CA attention]

[Notices table]
  [Columns: Taxpayer | PAN | Notice Section | DIN | Issued | Response By | Demand ₹ | Status | Assigned CA | Actions]

  [Notice sections with descriptions:]
  [143(1): Intimation — Auto-processed by IT dept]
  [139(9): Defective Return — Needs correction]
  [143(2): Scrutiny — Detailed examination required]
  [156: Demand Notice — Payment required]

  [Status: color-coded — Received / Assigned / In Progress / Responded / Closed / Appealed]
  [Actions: "Review" | "Draft Response" | "Mark Closed" | "Flag for Appeal"]

[Notice detail panel]
  [Notice scan / text view]
  [Issue summary: AI-extracted key points from notice]
  [Recommended action: based on notice type]
  [Response preparation section]
    [Rich text editor for response draft]
    [Document attachment (supporting evidence)]
    [CA approval required checkbox]
  [Communication log: email/portal submissions history]
```

**Key Components:**
- Table, StatusBadge, AmountDisplay, AlertBanner (urgent)
- RichTextEditor, StatusTimeline, PrimaryButton

**Navigation:**
- Arrives: Sidebar ITR → Notices, or user-reported notice from mobile app
- Exits to: N/A (self-contained management)

**Role permissions:**
- CA: Full access — can draft responses, approve, and submit
- Support Executive: Can assign, view, communicate with user
- Operations Manager: Full access including escalation to appeal
