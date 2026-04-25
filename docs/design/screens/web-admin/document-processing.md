# Web Admin Screens: Document Processing (Screens 59–62)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 59: Document Queue

**Purpose:** List of all documents pending operator review, with SLA tracking.

**Roles:** Data Entry Operator (own assignments), Operations Manager, System Admin

**Layout:**
```
[Sidebar + Top bar standard layout]
[Breadcrumb: Dashboard > Documents > Queue]
---
[Page header]
  [Title: "Document Queue" text-2xl font-bold]
  [Subtitle: "48 documents pending review | 3 SLA breaches"]

[Filters bar]
  [Select: Category — All / Sales Bill / Purchase Bill / Expense / Bank Statement / Salary Slip]
  [Select: Status — All / Uploaded / OCR Complete / In Review]
  [Select: Assigned to — All / Me / Unassigned / [Staff name]]
  [DatePicker range: Uploaded between]
  [Select: OCR Confidence — All / High (>80%) / Medium / Low (<50%)]
  [Button: "Reset Filters" — GhostButton]
  [Button: "Apply" — PrimaryButton]

[Bulk actions bar — visible when rows selected]
  [Selected count: "5 selected"]
  [SecondaryButton: "Assign to Me"]
  [SecondaryButton: "Assign to..."]
  [SecondaryButton: "Export Selected"]

[Document queue table]
  [Columns: Checkbox | Document ID | User | Category | Uploaded At | OCR Confidence | Status | SLA | Assigned To | Actions]

  [Table rows]
  [OCR Confidence cell: colored dot + percentage]
    [Green 80%+ | Yellow 50-80% | Red <50%]
  [SLA cell: time remaining badge]
    [Green: >2hr | Yellow: <2hr | Red: Overdue]
  [Actions: "Review" PrimaryButton small | "Assign" GhostButton]

[Pagination: 25/50/100 per page, prev/next, jump to page]
```

**Key Components:**
- Table with sortable columns, Checkbox (bulk select), Filters
- Badge (OCR confidence, SLA), PrimaryButton, SecondaryButton, GhostButton
- Pagination

**Navigation:**
- Arrives: Dashboard widget, Sidebar Documents → Queue
- Exits to: Document Review Screen (Review button click)

**Key Interactions:**
- Table header click: Sort by that column
- Row click: Opens Document Review Screen
- "Assign to Me": Bulk assigns selected documents to current user
- "Assign to...": Opens staff selector modal
- SLA column: Auto-sorts by most urgent (overdue first)
- Column customization: Right-click header to show/hide columns
- Export: Downloads CSV of visible rows

**Role permissions:**
- Data Entry Operator: Can see unassigned + own assignments; can claim documents
- Operations Manager: Can see all, reassign, export
- System Admin: Full access

---

## Screen 60: Document Review

**Purpose:** Split-screen OCR verification — original document image left, extracted data right.

**Roles:** Data Entry Operator, CA (for financial verification), Operations Manager

**Layout:**
```
[Full-screen layout, no sidebar in review mode — maximize workspace]

[Top bar: Back to Queue | "Document ID: D-20250401-1234" | User: "Rajesh Kumar (rajesh@biz.com)" | StatusBadge: OCR_COMPLETE | Actions: Assign | Timer: "SLA: 1h 23m remaining" | Save | Submit]

[Two-panel split: 50/50 or draggable divider]

[LEFT PANEL: Document Viewer]
  [Image viewer with zoom controls: + / - / fit / rotate]
  [Multi-page: tabs at bottom "Page 1 / Page 2 / Page 3"]
  [Annotation tools: 
    Circle/highlight tool — click to mark area on image
    Comment tool — attach note to area]
  [OCR field overlay: faint colored rectangles showing where OCR detected each field]
    [Hover overlay: shows field name + extracted value + confidence]
  [Image quality indicators: brightness, blur detection]

[RIGHT PANEL: OCR Data Editor]
  [Document category badge + change category option]
  
  [Extracted fields form]
  [Each field:]
    [Label: field name]
    [Value: editable TextInput, pre-filled with OCR result]
    [Confidence indicator: colored dot beside label]
    [Source: "OCR" or "Manual" badge — changes to "Manual" when edited]

  [Standard fields for Sales/Purchase Bill:]
    [Invoice Number | Invoice Date | Vendor/Customer Name]
    [Vendor GSTIN | HSN/SAC Code | Description]
    [Taxable Amount | GST Rate (Select) | CGST | SGST | IGST | Total Amount]
    [Payment Mode | Payment Status]

  [Validation messages: inline per field]
    [Green check: "GSTIN format valid"]
    [Red X: "Amount mismatch — total doesn't match tax calculations"]
    [Orange: "GSTIN not found in GST portal (verify manually)"]

  [Notes / flags section]
    [TextInput: "Add note for CA / team member"]
    [Flag for callback: Checkbox "Flag for human callback"]
    [Flag reason: Select — "Missing info / Rate mismatch / ITC issue / Other"]
    [OCR feedback: Checkbox "Flag OCR error for model improvement"]
    [TextInput: "Describe OCR error" — shown if checkbox ticked]

  [Action buttons]
    [PrimaryButton: "Approve & Process"]
    [SecondaryButton: "Save Draft"]
    [GhostButton: "Reject Document" — opens rejection reason modal]
    [GhostButton: "Request Re-upload from User"]
```

**Key Components:**
- Image viewer (react-pdf or custom), TextInput (all fields editable)
- Select (GST rate, document category), StatusBadge, AlertBanner
- Split-panel layout, Annotation tools
- PrimaryButton, SecondaryButton, GhostButton

**Navigation:**
- Arrives: Document Queue row click or "Review" button
- Exits to:
  - "Approve & Process" → Next document in queue (or back to queue)
  - "Reject" → Queue with rejected status
  - "Request Re-upload" → Triggers notification to user

**Key Interactions:**
- Left panel annotation: Click on image area to link to right panel field (scroll to field)
- Right panel field click: Highlights corresponding OCR region on left image
- Keyboard shortcuts: Alt+N = Next document, Alt+P = Previous, Alt+S = Save, Alt+A = Approve
- Tab navigation: Tab through all fields without mouse
- Auto-save: Draft saves every 30 seconds
- GST rate auto-recalculates tax amounts on change
- "Request Re-upload": Pre-fills notification message with specific reason

**Role permissions:**
- Data Entry Operator: Can review and edit OCR data, flag issues; cannot approve final financial data
- CA: Can review financial accuracy, approve journal entries
- Operations Manager: Full access including reassignment

---

## Screen 61: Bulk Document Assignment

**Purpose:** Assign multiple documents to team members efficiently.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Modal or full-page overlay]
[Header: "Bulk Assignment — 24 documents selected"]

[Assignment method selection]
  [Radio: "Assign to specific person"]
  [Radio: "Round-robin among team" (auto-distribute evenly)]
  [Radio: "By specialization" (e.g., GST docs to GST team)]

[If specific person:]
  [Select: Staff member — searchable dropdown with current workload shown]
  [Staff option shows: Name | Role | Current queue size | Availability]
  [e.g., "Anjali Singh | Data Entry | 12 pending | Available"]

[If round-robin:]
  [MultiSelect: "Select team members" — shows current queue sizes]
  [Distribution preview: "Each will receive ~8 documents"]

[Assignment notes]
  [TextInput: "Notes for assigned team" — optional]
  [Checkbox: "Notify assigned staff via email/notification"]

[PrimaryButton: "Assign Documents"]
[GhostButton: "Cancel"]
```

**Key Components:** RadioGroup, Select (staff with workload), MultiSelect, PrimaryButton, GhostButton

**Navigation:**
- Arrives: Document Queue bulk select → "Assign to..." button
- Exits to: Document Queue (updated assignments reflected)

---

## Screen 62: OCR Confidence Report

**Purpose:** Analytics on OCR accuracy to identify patterns and improvement areas.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Dashboard > Documents > OCR Report]
---
[Date range selector: last 7D / 30D / 90D / custom]
[Segment by: Document Category | OCR Engine | Time period]

[Summary KPI cards]
  [MetricCard: "Avg OCR Confidence" — percentage]
  [MetricCard: "High Confidence (>80%)" — percentage]
  [MetricCard: "Documents Requiring Manual Review" — count]
  [MetricCard: "OCR Feedback Reports" — count]

[Confidence distribution chart]
  [Histogram: X-axis confidence 0-100%, Y-axis count]
  [Three zones highlighted: red <50, yellow 50-80, green >80]

[By category breakdown table]
  [Columns: Category | Count | Avg Confidence | Auto-processed % | Manual Override %]
  [Rows: Sales Bill, Purchase Bill, Expense Receipt, Bank Statement, Salary Slip]

[OCR Error Patterns]
  [Most common error types from operator feedback]
  [Bar chart: Handwritten text / Low image quality / Foreign language / Faded text / etc.]

[Improvement suggestions section]
  [AI-generated suggestions based on feedback patterns]
  [e.g., "83% of low-confidence receipts are from restaurants — consider adding restaurant receipt template"]
```

**Key Components:**
- MetricCard, Chart (histogram + bar), Table, AlertBanner
- DateRangePicker, Select (segment by)

**Navigation:**
- Arrives: Sidebar Documents → OCR Report, or Dashboard alert link
- Exits to: N/A (analytics view)
