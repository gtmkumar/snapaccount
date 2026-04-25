# Mobile Screens: GST Filing (Screens 17–24)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 17: GST Dashboard

**Purpose:** Central hub for all GST filing activity — pending returns, ITC alerts, deadlines.

**Layout:**
```
[TopNavBar: "GST Filing" large title, Calendar icon right (deadline view)]
---
[Deadline alert banner — if within 7 days]
  [Warning-type: "GSTR-3B for March 2025 due in 3 days"]
  [PrimaryButton: "File Now" small]

[Current GSTIN selector]
  [Dropdown: GSTIN — if user has multiple]
  [Small: "15XXXXX1234X1ZX • Regular Dealer"]

[Metrics row: horizontal scroll]
  [MetricCard: "ITC Available" — AmountDisplay, brand]
  [MetricCard: "Output Tax" — AmountDisplay, error-colored]
  [MetricCard: "Net Payable" — AmountDisplay, highlight]
  [MetricCard: "Pending Returns" — count, warning]

[Section: "Pending Actions"]
  [Return cards — sorted by deadline urgency]

  [ReturnCard: GSTR-3B — March 2025]
    [StatusBadge: DRAFT]
    [Due: 20 Apr 2025 — "5 days left" warning chip]
    [Summary: Sales ₹X.XL | ITC ₹XX,XXX | Payable ₹XX,XXX]
    [PrimaryButton: "Review & File"]

  [ReturnCard: GSTR-1 — March 2025]
    [StatusBadge: PENDING_APPROVAL]
    [Due: 11 Apr 2025 — "Overdue" error chip]
    [SecondaryButton: "View Return"]

[Section: "ITC Mismatch Alerts" — if any]
  [AlertBanner: warning-type with count]
  [GhostButton: "Review Mismatches"]

[Section: "Recent Filings"]
  [Filed return rows with date + receipt number]
  ["View All" GhostButton]

[Section: "GST Notices" — if any pending]
  [Count badge + "View Notices" link]
```

**Key Components:**
- MetricCard, AmountDisplay, StatusBadge, AlertBanner
- Card (return cards), PrimaryButton, SecondaryButton, GhostButton
- DeadlineChip (custom status: days remaining in color)

**Navigation:**
- Arrives: BottomTabBar → GST tab (or Home screen GST card)
- Exits to:
  - "Review & File" → GSTR-3B Summary Screen
  - "View Return" → GSTR-1 Invoice List Screen
  - "Review Mismatches" → ITC Mismatch detail (links to web admin or shows mobile-optimized view)
  - "View Notices" → GST Notice List Screen

**Key Interactions:**
- Pull-to-refresh: Syncs GST data from portal
- Return card swipe right: Quick preview of summary
- GSTIN switcher: Changes all data to that GSTIN's context

**Loading state:** Skeleton metric cards + skeleton return cards

**Empty state (no pending returns):** Green success illustration "All returns filed and up to date!"

**Indian UX notes:**
- GSTR-3B deadline is 20th of following month — highlight prominently
- GSTR-1 deadline is 11th — highlight separately
- ITC mismatch is a compliance risk — use warning color prominently
- Never say "0 due" if there is an upcoming deadline — always show next deadline even if nothing overdue

---

## Screen 18: GSTR-3B Summary & Edit

**Purpose:** Review and edit GSTR-3B auto-calculated values before approval.

**Layout:**
```
[TopNavBar: Back, "GSTR-3B — March 2025" title, Help icon right]
[StatusBadge: DRAFT — top right of content area]
---
[Period info: "Tax Period: March 2025 | GSTIN: 15XXXXX"]
[Alert: "Auto-calculated from your documents. Please verify before submission."]

[Section 3.1: Outward Supplies (Sales)]
  [TaxBreakdownTable]
  [Rows: Taxable Value | IGST | CGST | SGST for each rate (0/5/12/18/28%)]
  [Totals row]
  [GhostButton: "Edit Values" — opens editable inline mode]

[Section 4: Input Tax Credit (ITC)]
  [Row: ITC from GSTR-2A/2B auto-match ₹XX,XXX]
  [Row: ITC claimed ₹XX,XXX]
  [Mismatch warning if they differ: "₹2,340 difference detected"]

[Section 6: Net Tax Payable]
  [Calculation: Output Tax - ITC = Net Payable]
  [AmountDisplay xl — prominent, in warning/error color if positive]
  [Note: "Pay this via GST Portal before filing"]

[Bank details for payment — optional section]

[Late fee warning — if overdue]
  [Error banner: "Late fee: ₹200/day applied from 21 Apr 2025"]
---
[Bottom action bar]
  [SecondaryButton: "Save Draft"]
  [PrimaryButton: "Submit for Approval" → changes to "File Directly" if no workflow]
```

**Key Components:**
- TaxBreakdownTable, AmountDisplay, AlertBanner
- GSTRateChip, PrimaryButton, SecondaryButton
- InlineEdit mode for table cells

**Navigation:**
- Arrives: GST Dashboard "Review & File" tap
- Exits to:
  - "Submit for Approval" → GST Approval Screen
  - "Save Draft" → Back to GST Dashboard (DRAFT state)

**Key Interactions:**
- "Edit Values" mode: Table cells become editable TextInput
- Tap ITC mismatch: Navigates to reconciliation detail
- Help icon: Opens contextual help sheet explaining each section
- Tax amount auto-recalculates when any value is edited

**Indian UX notes:**
- IGST = Inter-state, CGST+SGST = Intra-state — show which applies based on user's state
- Allow manual override with audit note (required for compliance)
- Late fee calculation visible in real-time once deadline passed

---

## Screen 19: GSTR-1 Invoice List & Edit

**Purpose:** Review and manage all sales invoices for GSTR-1 filing.

**Layout:**
```
[TopNavBar: Back, "GSTR-1 — March 2025" title, Filter + Add icon right]
---
[Summary bar: "47 invoices | Taxable: ₹X.XL | Tax: ₹XX,XXX"]

[Filter tabs: B2B | B2C | Credit Notes | Debit Notes | HSN Summary]

[Invoice list — InvoiceRow per item]
  [Invoice No | Date | Party Name | Taxable | GST | Total | Status]
  [GSTRateChip per row]
  [Edit icon per row]

[Pagination / infinite scroll: 50 per page]
---
[Add Invoice FAB — bottom right]
```

**Key Components:**
- InvoiceRow, GSTRateChip, StatusBadge, FAB
- TaxBreakdownTable (HSN Summary tab), Filter chips

**Navigation:**
- Arrives: GST Dashboard GSTR-1 card
- Exits to: GST Approval Screen (after review complete)

**Key Interactions:**
- Tap invoice row: Expand for full details
- Edit icon: Opens inline edit for that invoice's fields
- FAB: Add manual invoice (form sheet)
- Filter tabs: Switch invoice type view
- Swipe left on invoice: Delete with confirmation

---

## Screen 20: GST Approval Screen

**Purpose:** Final review and approval before GST return is filed by the operations team.

**Layout:**
```
[TopNavBar: Back, "Approve GST Return" title]
---
[Return summary card]
  [Type: GSTR-3B | Period | GSTIN]
  [Key amounts: Taxable | ITC | Net Payable — large AmountDisplay]
  [StatusTimeline: Draft → Pending Approval → Approved → Filed]

[Checklist card]
  [Checkbox: "I confirm the sales figures are correct"]
  [Checkbox: "I confirm the ITC values are accurate"]
  [Checkbox: "I understand the net tax payable"]
  [Checkbox: "I authorize SnapAccount to file on my behalf"]

[Consent declaration text]
  [Legal text: brief, plain language declaration]
  [GSTIN, business name, period visible in declaration]

[Disclaimer note: "Once approved, our team will file within 24 hours of the deadline."]
---
[Bottom action bar]
  [GhostButton: "Request Changes" — sends back to review]
  [PrimaryButton: "Approve & Submit" — enabled only when all checkboxes ticked]
```

**Key Components:**
- StatusTimeline, Checkbox, AmountDisplay, AlertBanner
- PrimaryButton, GhostButton, Card

**Navigation:**
- Arrives: From GSTR-3B Summary ("Submit for Approval")
- Exits to: Filing Confirmation Screen (on Approve)

**Key Interactions:**
- All 4 checkboxes must be ticked for Approve button to enable
- "Request Changes" opens text input for specific change request message

---

## Screen 21: Filing Confirmation & Receipt

**Purpose:** Confirmation screen after GST return is filed successfully.

**Layout:**
```
[Full screen success animation: green checkmark lottie]
[Heading: "GSTR-3B Filed Successfully!" text-2xl font-bold text-success-600]
[Subtext: "March 2025 return has been filed with GSTN"]

[Receipt card]
  [ARN (Acknowledgment Reference Number): monospace text, large]
  [Filed on: datetime]
  [Net tax paid: AmountDisplay]
  [Copy ARN button]

[Actions]
  [PrimaryButton: "Download Receipt PDF"]
  [SecondaryButton: "Share on WhatsApp"]
  [GhostButton: "Back to GST Dashboard"]
```

**Key Components:** AmountDisplay, PrimaryButton, SecondaryButton, GhostButton

**Navigation:**
- Arrives: GST Approval flow complete
- Exits to: GST Dashboard (Go Back or after sharing)

**Indian UX note:** ARN is a government-issued reference number — display prominently, offer easy copy. Users often need to share this with accountants.

---

## Screen 22: GST Notice List

**Purpose:** View and track all received GST notices.

**Layout:**
```
[TopNavBar: Back, "GST Notices" title]
---
[Filter chips: All | Pending Response | Responded | Closed]

[Notice cards list]
  [NoticeCard per item]
  [Notice type | Date received | Reference number]
  [StatusBadge: Pending / Responded / Closed]
  [Brief description text]
  [Due date for response — warning color if upcoming]
  [PrimaryButton: "Respond" (if pending) | GhostButton: "View" (if closed)]

[Empty state: "No GST notices. You're compliant!"]
```

**Key Components:** Card, StatusBadge, AlertBanner (for urgent notices), PrimaryButton

**Navigation:**
- Arrives: GST Dashboard "View Notices"
- Exits to: Notice detail view with response workflow

---

## Screen 23: E-Invoice Generation

**Purpose:** Generate IRN (Invoice Reference Number) for e-invoicing mandated for turnover > ₹5 Crore.

**Layout:**
```
[TopNavBar: Back, "E-Invoice" title, Info icon (threshold info)]
---
[Info banner: "E-invoicing mandatory for your business. IRN generated via NIC portal."]

[Invoice search / select]
  [TextInput: "Search invoice by number or party"]
  [Invoice list — pending IRN generation]

[Selected invoice detail]
  [All invoice fields: Party GSTIN, HSN, amounts, tax breakdowns]
  [Validation status: Green ticks or red X for required fields]

[PrimaryButton: "Generate IRN" — validates and calls NIC API]

[Generated IRN section (after generation)]
  [IRN: long alphanumeric string]
  [QR Code image: encoded invoice data]
  [Acknowledgment number and date]
  [PrimaryButton: "Download E-Invoice PDF"]
  [SecondaryButton: "Share"]
```

**Key Components:**
- TextInput (search), InvoiceRow, StatusBadge, PrimaryButton
- QR Code display, AmountDisplay, GSTRateChip

**Navigation:**
- Arrives: GST Dashboard or invoice list action
- Exits to: Filing confirmation or back to GST Dashboard

---

## Screen 24: E-Way Bill Generation

**Purpose:** Generate e-way bill for goods movement exceeding ₹50,000 in value.

**Layout:**
```
[TopNavBar: Back, "E-Way Bill" title]
---
[Form sections]

[From / To details]
  [TextInput: "Consigner GSTIN"]
  [TextInput: "Consignee GSTIN"]
  [TextInput: "Transport distance (km)"]
  [Select: "Mode of Transport" — Road / Rail / Air / Ship]
  [TextInput: "Vehicle Number" — for road transport]
  [TextInput: "Transporter ID / GR Number"]

[Goods details]
  [Select: "HSN Code"]
  [TextInput: "Description of goods"]
  [TextInput: "Quantity"]
  [Select: "Unit" — Nos / Kg / Ltr / etc]
  [AmountDisplay: Taxable value + Tax amounts (auto from invoice)]

[PrimaryButton: "Generate E-Way Bill"]

[Generated E-Way Bill (after generation)]
  [EWB Number: large, monospace]
  [Valid from / Valid until dates]
  [Distance-based validity note: "Valid for X days based on Ykm distance"]
  [Download / Share / Print buttons]
```

**Key Components:**
- TextInput, Select, AmountDisplay, GSTRateChip, PrimaryButton
- AlertBanner ("₹50,000 threshold note")

**Navigation:**
- Arrives: Invoice detail action or GST Dashboard
- Exits to: Confirmation or back to Dashboard

**Indian UX note:**
- E-Way Bill validity is distance-based (100km/day for road) — auto-calculate and display clearly
- Vehicle number format validation (Indian RTO format)
