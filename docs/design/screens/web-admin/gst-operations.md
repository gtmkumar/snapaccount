# Web Admin Screens: GST Operations (Screens 63–69)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 63: GST Filing Queue

**Purpose:** Prioritized queue of all GST returns requiring action — review, approval, or filing.

**Roles:** Support Executive, CA, Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Dashboard > GST > Filing Queue]
---
[Page header]
  [Title: "GST Filing Queue"]
  [Urgency summary: "3 overdue | 8 due today | 12 due this week"]

[Alert banners — stacked if multiple]
  [Error: "GSTR-3B for 3 businesses is overdue. Late fee accruing."]
  [Warning: "GSTR-1 deadline in 2 days for 12 businesses."]

[Filter bar]
  [Select: Return Type — All / GSTR-1 / GSTR-3B / GSTR-9]
  [Select: Status — All / Draft / Pending Approval / Approved / Filed / Revision Needed]
  [Select: Assigned CA — All / Me / Unassigned / [CA name]]
  [DatePicker: Due date range]
  [TextInput: Search business name or GSTIN]

[GST Queue table]
  [Columns: Business Name | GSTIN | Return Type | Period | Status | Due Date | Tax Payable | Assigned CA | SLA | Actions]
  [Status: StatusBadge per cell]
  [Due Date: colored chip — Red=overdue, Orange=<3 days, Yellow=<7 days, Green=OK]
  [Tax Payable: AmountDisplay, red if > 0 (unpaid)]
  [SLA: remaining time badge]
  [Actions: "Review" button | "Assign" button | "File Now" button (if approved)]

[Bulk actions: Select all → Assign bulk / Export]
[Pagination: 25/50 per page]
```

**Key Components:**
- Table (sortable), StatusBadge, AmountDisplay, AlertBanner
- Filters (Select, DatePicker, TextInput), PrimaryButton, Badge

**Navigation:**
- Arrives: Dashboard GST widget, Sidebar GST → Queue
- Exits to: GST Return Review (Screen 64 or 65) on "Review" click

**Role permissions:**
- Support Executive: Can see queue, assign to CA, trigger callbacks
- CA: Sees own assignments; can review and submit for filing
- Operations Manager: Full access, can reassign, override

---

## Screen 64: GST Return Review (GSTR-3B Detail)

**Purpose:** Full review panel for GSTR-3B — all tax sections editable by admin before filing.

**Roles:** CA, Support Executive (view only), Operations Manager

**Layout:**
```
[Full-width layout — maximize workspace]
[Top bar: Back | "GSTR-3B — [Business] — March 2025" | GSTIN | StatusBadge | "Assigned: CA Priya" | Timer | Actions]

[Content: two columns]

[LEFT (60%): Return data editor]

  [Section tabs: 3.1 Outward Supplies | 4 ITC | 5 Exempt | 6 Net Payable]

  [Section 3.1: Outward Supplies]
  [Editable table: Rate | Taxable | CGST | SGST | IGST | Cess]
  [Row per GST rate: 0% / 5% / 12% / 18% / 28%]
  [All cells editable — TextInput inline]
  [Auto-total row at bottom]

  [Section 4: Input Tax Credit]
  [Row: ITC Available (from GSTR-2A/2B) — readonly]
  [Row: ITC Claimed — editable]
  [Row: Difference — auto-calculated, warning if >0]
  [GSTR-2A/2B reconciliation link]

  [Section 6: Net Tax Payable]
  [Summary calculation: Output - ITC = Net Payable]
  [AmountDisplay XL — prominent]

[RIGHT (40%): Business context + actions]

  [Business profile card]
  [Business Name, GSTIN, State, Turnover]
  [Filing history: last 12 months compliance status calendar]

  [Checklist]
  [Checkbox: Sales data verified]
  [Checkbox: Purchase data verified]
  [Checkbox: ITC reconciled with 2A/2B]
  [Checkbox: Late fees calculated (if any)]

  [Audit trail]
  [Last modified: by whom, when]
  [Changes log: compact, scrollable]

  [Actions]
  [PrimaryButton: "Submit for Filing" — if all checkboxes ticked]
  [SecondaryButton: "Save & Assign for Review"]
  [GhostButton: "Request User Callback" — opens callback reason form]
  [GhostButton: "Flag Revision Needed" — sends back to user]
```

**Key Components:**
- Editable Table (inline TextInput), AmountDisplay, Checkbox, StatusBadge
- AlertBanner, PrimaryButton, SecondaryButton, GhostButton
- Audit trail (timeline compact)

**Navigation:**
- Arrives: GST Queue "Review" click
- Exits to: GST Queue (on save/submit), or next item in queue

**Key Interactions:**
- Tax auto-recalculates on any cell edit
- GSTR-2A link: Opens reconciliation panel (inline or modal)
- Callback trigger: Opens pre-filled callback assignment form

**Role permissions:**
- CA: Full edit access, can submit for filing
- Support Executive: View only, can trigger callback
- Operations Manager: Full access

---

## Screen 65: GSTR-1 Review

**Purpose:** Review and edit individual sales invoices for GSTR-1 filing.

**Roles:** CA, Support Executive (view), Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: GST > Queue > GSTR-1 Review]
---
[Header: "GSTR-1 — [Business] — March 2025" | GSTIN | Period | StatusBadge]

[Summary stats bar]
  [B2B Invoices: N | B2C Total | Credit Notes: N | Total Tax: AmountDisplay]

[Sub-tabs: B2B Invoices | B2C Summary | Credit/Debit Notes | HSN Summary | Document Issues]

[B2B Invoices tab]
  [InvoiceRow table — editable]
  [Columns: Checkbox | Invoice No | Date | Buyer GSTIN | Taxable | CGST | SGST | IGST | Total | Confidence | Status | Actions]
  [GSTRateChip per invoice]
  [OCR confidence dot per invoice]
  [Inline edit: click cell to edit]
  [Add Invoice FAB / button]

[Document Issues tab]
  [Invoices with OCR errors or missing data]
  [Highlighted in orange/red for immediate attention]

[Action bar bottom]
  [SecondaryButton: "Save Draft"]
  [PrimaryButton: "Approve GSTR-1 for Filing"]
```

**Key Components:**
- InvoiceRow (editable), GSTRateChip, StatusBadge, AmountDisplay
- Sub-tabs, PrimaryButton, SecondaryButton, AlertBanner

**Navigation:**
- Arrives: GST Queue for GSTR-1 type entries
- Exits to: GST Queue (updated status)

---

## Screen 66: ITC Mismatch Tracker

**Purpose:** Track and resolve discrepancies between ITC claimed and GSTR-2A/2B data.

**Roles:** CA, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: GST > ITC Mismatch Tracker]
---
[Summary: "47 businesses with ITC mismatches | Total mismatch: ₹2.3L"]

[Filter: Business / Period / Mismatch amount range / Status]

[Mismatch table]
  [Columns: Business | GSTIN | Period | ITC per 3B | ITC per 2A/2B | Difference | % Diff | Status | Actions]
  [Difference: red if positive (excess claim), green if negative]
  [% Diff: critical if >10%, warning if 5-10%]
  [Actions: "Review Details" | "Mark Resolved" | "Flag for Callback"]

[Individual mismatch detail (click row)]
  [Side by side: Your records vs GST Portal data]
  [Invoice-level reconciliation table]
  [Column: Invoice No | Vendor | Amount | Tax | In 3B? | In 2A? | Status]
  [Actions per invoice: Accept portal data / Keep original / Flag dispute]
```

**Key Components:**
- Table (sortable), AmountDisplay, StatusBadge, AlertBanner
- DetailPanel (invoice reconciliation)

**Navigation:**
- Arrives: GST Dashboard ITC alert, or Sidebar GST → ITC Tracker
- Exits to: GST Return Review (with resolved ITC)

---

## Screen 67: GST Callback Queue

**Purpose:** Manage human-touch callbacks triggered by GST issues.

**Roles:** Support Executive, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: GST > Callback Queue]
---
[Urgency KPIs: "12 open | 3 due SLA breach | Avg wait: 2.1 hrs"]

[Callback list table]
  [Columns: User | Phone | Trigger Type | Business | GSTIN | Period | Priority | Assigned | SLA | Status | Actions]

  [Trigger types (color-coded badges):]
  [Missing Bills | Rate Mismatch | ITC Mismatch | Incomplete Billing | First-time | Discrepancy | GST Notice | Deadline | User-Requested]

  [Priority: P1/P2/P3 badges]
  [SLA: time remaining, red if overdue]
  [Actions: "Claim Callback" | "Mark Completed" | "Log Outcome"]

[Callback detail (click row or Claim)]
  [User details card: name, phone, preferred language, business info]
  [Trigger context: specific issue details]
  [Document links: relevant docs for context]
  [Previous callback history]
  [Call outcome form: Notes | Resolution | Follow-up needed | Satisfaction rating]
  [PrimaryButton: "Log Outcome & Close"]
```

**Key Components:**
- Table, StatusBadge (trigger type), AlertBanner, Form (outcome)
- PrimaryButton, MetricCard (KPIs)

**Navigation:**
- Arrives: Dashboard callback widget, Sidebar GST → Callbacks
- Exits to: GST Filing Queue (if issue resolved leads to filing)

**KPI targets (from project brief):**
- FCR > 70%, avg call 5-12 min, response time < 4 hours, satisfaction > 4.5/5

---

## Screen 68: GST Notice Tracker

**Purpose:** Manage and track all GST notices received by users.

**Roles:** CA, Support Executive, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: GST > Notices]
---
[Summary: "18 active notices | 3 response deadlines this week"]

[Filter: Status / Notice Type / Business / Due date]

[Notices table]
  [Columns: Business | GSTIN | Notice Type | Reference No | Received | Response Deadline | Demand ₹ | Status | Assigned CA | Actions]
  [Notice type badge: 38B / 61 / 73 / 74 / 76 / other]
  [Deadline: colored chip by urgency]
  [Demand amount: AmountDisplay (red)]
  [Actions: "Review" | "Draft Response" | "Mark Closed"]

[Notice Detail panel]
  [Notice text / scan]
  [Response draft editor: rich text]
  [Supporting documents attach]
  [Response history timeline]
  [StatusTimeline: Received → Assigned → Under Preparation → Responded → Closed]
```

**Key Components:**
- Table, StatusBadge, AmountDisplay, StatusTimeline
- RichTextEditor (response draft), AlertBanner

**Navigation:**
- Arrives: Sidebar GST → Notices, or Dashboard notice alert
- Exits to: N/A (self-contained)

---

## Screen 69: E-Invoice Management

**Purpose:** Manage e-invoice generation and IRN tracking for eligible businesses.

**Roles:** Support Executive, CA, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: GST > E-Invoice Management]
---
[Eligibility alert: "23 businesses have turnover > ₹5Cr — e-invoicing mandatory"]

[E-Invoice queue table]
  [Columns: Business | GSTIN | Invoice No | Date | Party | Amount | IRN Status | Generated | Actions]
  [IRN Status: Pending / Generated / Cancelled / Error]
  [Actions: "Generate IRN" | "Cancel IRN" | "Download" | "View QR"]

[Bulk operations]
  [Select all pending → "Bulk Generate IRN" button]

[Error handling section]
  [Invoices with generation failures]
  [Error message per invoice]
  [Retry button per failed invoice]

[IRN detail panel (click row)]
  [Full invoice data]
  [IRN: displayed large monospace]
  [QR code display]
  [Download PDF with embedded QR]
  [Cancel reason form (if cancelling)]
```

**Key Components:**
- Table, StatusBadge, PrimaryButton, AlertBanner
- QR code display, AmountDisplay

**Navigation:**
- Arrives: Sidebar GST → E-Invoice, or invoice workflow
- Exits to: N/A (management view)

**Role permissions:**
- Support Executive + CA: Can generate/cancel IRN
- Operations Manager: Full access
- Data Entry Operator: View only
