# Web Admin Screens: Loan Operations (Screens 76–79)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 76: Loan Application Queue

**Purpose:** Central queue for all active loan applications across all partner banks.

**Roles:** Support Executive, Operations Manager, Partner Bank Representative (filtered to their bank), System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Dashboard > Loans > Application Queue]
---
[Summary KPIs]
  [MetricCard: "Active Applications" count]
  [MetricCard: "Awaiting Documents" count — warning color]
  [MetricCard: "Decisions Pending" count]
  [MetricCard: "Approved This Month" count — success]
  [MetricCard: "Total Loan Value in Pipeline" AmountDisplay]

[Filter bar]
  [Select: Status — All / Initiated / Docs Ready / Submitted / Under Review / Additional Docs / Approved / Disbursed / Rejected]
  [Select: Loan Type — Business / Working Capital / Personal / MSME-Mudra]
  [Select: Partner Bank — All / [Bank names]]
  [Select: Amount Range]
  [DatePicker: Application date range]
  [TextInput: Search by business name / PAN / GSTIN / application ID]

[Application table]
  [Columns: App ID | Business Name | GSTIN | Loan Type | Amount | Banks | Status | Applied | Last Update | Assigned | Actions]
  [Banks: avatar row of bank logos (small) — shows all applied banks]
  [Status: StatusBadge — overall or worst-case status across banks]
  [Actions: "Review" | "Assign" | "Update Status"]

[Bulk actions: Export selected, Assign bulk]
[Pagination: 25/50 per page]
```

**Key Components:**
- Table (sortable, filterable), MetricCard, StatusBadge
- AmountDisplay, Filters, PrimaryButton, Badge (bank logos)

**Navigation:**
- Arrives: Dashboard loan widget, Sidebar Loans → Queue
- Exits to: Document Package Review (Screen 77) or Bank Communication Log (Screen 78)

**Role permissions:**
- Support Executive: Full view, can update status, communicate with user
- Operations Manager: Full access + assignment + export
- Partner Bank Rep: Can only see applications sent to their bank, can update status for their bank
- System Admin: Full access

---

## Screen 77: Document Package Review

**Purpose:** Review the auto-generated document package before/after bank submission.

**Roles:** Support Executive, CA, Operations Manager, Partner Bank Rep (view)

**Layout:**
```
[Full-width layout]
[Top bar: Back | Application ID | Business Name | Loan Type | Amount Requested | StatusBadge | Actions]

[Two-column layout]

[LEFT (55%): Document Package Viewer]
  [Package info bar: "12 documents | 48 pages | Generated: [datetime] | Watermarked"]
  
  [Document list — clickable, loads in viewer]
    [Item: GSTR-3B Summaries (12 months) — Generated ✓]
    [Item: Balance Sheet FY 2024-25 — Generated ✓]
    [Item: P&L Statement FY 2024-25 — Generated ✓]
    [Item: Bank Statement (6 months) — Uploaded ✓]
    [Item: KYC — PAN & Aadhaar — Uploaded ✓]
    [Item: Business Address Proof — Missing ⚠]
    [Item: Previous 2Y ITR — Missing ✗]

  [Document viewer: PDF/image render of selected document]
  [Watermark visible: "FOR BANK USE ONLY — [Business Name] — [Date]"]

[RIGHT (45%): Application context + actions]

  [Business eligibility summary card]
    [Business Vintage: X years]
    [GST Compliance: %]
    [Avg Monthly Turnover: AmountDisplay]
    [Credit Score: (if available)]

  [Loan details]
    [Requested: AmountDisplay]
    [Type: Business Loan]
    [Purpose: [selected purpose]]

  [Applied banks status]
    [Per bank row: Logo | Name | Status | Last update]
    [Status per bank: Submitted / Under Review / Docs Needed / Approved / Rejected]

  [Missing documents alert]
    [Warning banner if any missing]
    [List of missing docs]
    [PrimaryButton: "Notify User — Request Documents"]

  [Actions]
    [PrimaryButton: "Submit to Banks" (if not yet submitted)]
    [SecondaryButton: "Regenerate Package"]
    [GhostButton: "Download Full Package"]
    [GhostButton: "Add Document to Package"]
```

**Key Components:**
- PDF/image viewer, Checklist (per document), AmountDisplay
- AlertBanner, PrimaryButton, SecondaryButton, GhostButton, StatusBadge

**Navigation:**
- Arrives: Loan Application Queue "Review"
- Exits to: Bank Communication Log, or Queue with updated status

**Key Interactions:**
- Click document in list: Loads in viewer
- "Notify User": Opens notification composer with pre-filled message listing missing docs
- "Submit to Banks": Triggers partner bank API calls, shows progress per bank
- Document watermark: Non-removable, tied to applicant identity for security

**Role permissions:**
- Partner Bank Rep: View only — cannot modify package or trigger actions
- Support Executive: Can notify user, update status
- CA: Can verify financial document accuracy
- Operations Manager: Full access

---

## Screen 78: Bank Communication Log

**Purpose:** Track all communications and status updates with partner banks for loan applications.

**Roles:** Support Executive, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Loans > [App ID] > Bank Communication Log]
---
[Application summary header: ID | Business | Amount | Current status]

[Per-bank sections — tabbed or accordion]
  [Tab: [Bank 1 Name] | [Bank 2 Name] | [Bank 3 Name]]

  [Per-bank content]
    [Bank status: StatusBadge — e.g., "ADDITIONAL_DOCS_NEEDED"]
    [Bank contact: [Relationship Manager name] | [Email] | [Phone]]

    [Communication timeline — chronological]
      [Timeline item: icon + heading + description + timestamp]
      [Types: Submitted / Status Update / Document Request / Offer Received / Approval / Rejection]
      [Submitted: "Application submitted via API — Ref: BANK-REF-12345"]
      [Document Request: "Bank requested additional docs: [list]"]
      [Offer Received: "Loan offer: ₹12L at 13.5% for 36 months — Expires: Apr 10"]
      [Approval: "Application approved — Loan amount: ₹15L at 14% — Agreement attached"]

    [Manual note: TextInput + "Add Note" button for off-system communication log]

    [Offer card — if offer received]
      [Loan Amount: AmountDisplay]
      [Interest Rate: X% p.a.]
      [Tenure: X months]
      [Processing Fee: ₹X,XXX]
      [Monthly EMI: AmountDisplay]
      [Offer Validity: [date]]
      [Actions: SecondaryButton "Send Offer to User" | GhostButton "View Offer Document"]

[Bottom: "View All Banks" summary table]
  [Bank | Status | Amount Offered | Rate | Decision Date | Action]
```

**Key Components:**
- StatusTimeline (per bank), AmountDisplay, Card (offer)
- TextInput (manual note), SecondaryButton, GhostButton, Tab navigation

**Navigation:**
- Arrives: Loan Queue or Document Package Review
- Exits to: Disbursement Tracking (Screen 79) on approval

---

## Screen 79: Disbursement Tracking

**Purpose:** Track loan disbursal status after approval.

**Roles:** Support Executive, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Loans > Disbursement Tracking]
---
[Filter: Status / Bank / Date range / Amount range]

[Summary cards]
  [MetricCard: "Approved — Awaiting Disbursal" count + value]
  [MetricCard: "Disbursed This Month" count + value]
  [MetricCard: "Total Disbursed (All Time)" AmountDisplay]

[Disbursement table]
  [Columns: Business | Bank | Approved Amount | Disbursed Amount | Disbursed On | Loan Account No | EMI Start | Next EMI | Status | Actions]
  [Status: Awaiting Disbursal / Partially Disbursed / Fully Disbursed]
  [Actions: "View Details" | "Update Disbursement" | "View EMI Schedule"]

[Disbursement detail panel — click row]
  [Loan agreement summary]
  [Disbursement tranches (if multiple)]
  [EMI schedule table: Month | EMI | Principal | Interest | Balance]
  [Payment reminders: sent / upcoming]
  [User notification history]
```

**Key Components:**
- Table, MetricCard, AmountDisplay, StatusBadge, PrimaryButton

**Navigation:**
- Arrives: Sidebar Loans → Disbursement, or Loan Queue approved items
- Exits to: N/A (tracking view)

**Role permissions:**
- Partner Bank Rep: Can update disbursement status for their bank's loans
- Support Executive: Can view, communicate with user about disbursement
- Operations Manager: Full access
