# Web Admin Screens: Reports & Analytics (Screens 100–103)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 100: Operational Reports

**Purpose:** Platform-wide operational metrics — processing volumes, SLA adherence, team productivity.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Reports > Operational]
---
[Date range selector: Last 7D / 30D / 90D / Custom]
[Group by: Day / Week / Month]
[Export: SecondaryButton "Export CSV" | "Export PDF"]

[Section: Document Processing]
  [MetricCard: Total Documents Received]
  [MetricCard: Documents Processed]
  [MetricCard: Avg Processing Time]
  [MetricCard: OCR Auto-processed % (>80% confidence)]
  [MetricCard: Manual Review Required %]
  [Chart: Bar — Documents received vs processed per period]
  [Chart: Pie — OCR confidence distribution]

[Section: GST Operations]
  [MetricCard: Returns in Queue (current)]
  [MetricCard: Returns Filed]
  [MetricCard: On-time Filing % — target >95%]
  [MetricCard: Late Filings — count]
  [MetricCard: Avg Return Review Time]
  [MetricCard: ITC Mismatches Resolved]
  [Chart: Line — Returns filed per month vs deadline count]

[Section: ITR Operations]
  [MetricCard: ITR Verifications Completed]
  [MetricCard: ITR Filings Submitted]
  [MetricCard: Avg Verification Time]
  [MetricCard: E-Verification Completion Rate]
  [MetricCard: Notice Responses Sent]
  [Chart: Funnel — ITRs initiated → Documents verified → Computed → Filed → E-verified]

[Section: Callback Performance]
  [MetricCard: Total Callbacks Handled]
  [MetricCard: GST FCR Rate — target >70%]
  [MetricCard: ITR FCR Rate — target >75%]
  [MetricCard: Avg Call Duration GST — target 5-12 min]
  [MetricCard: Avg Call Duration ITR — target 8-12 min]
  [MetricCard: Customer Satisfaction — target >4.5/5]
  [Chart: Line — FCR rate and satisfaction trends over time]

[Section: Loan Operations]
  [MetricCard: Applications Received]
  [MetricCard: Documents Packages Generated]
  [MetricCard: Applications Submitted to Banks]
  [MetricCard: Approvals Received]
  [MetricCard: Approval Rate %]
  [MetricCard: Avg Processing Time (application to bank submission)]

[Section: Chat Operations]
  [MetricCard: Conversations Handled]
  [MetricCard: Avg First Response Time]
  [MetricCard: Resolution Rate %]
  [MetricCard: Video Calls Completed]
  [MetricCard: CSAT Score]
```

**Key Components:**
- MetricCard (many), Chart (bar, line, pie, funnel), Table
- DateRangePicker, Select (group by), SecondaryButton (export)

**Navigation:**
- Arrives: Sidebar Reports → Operational, or Dashboard link
- Exits to: Drill-down specific screens (click metric → filtered queue)

**Data refresh:** On-demand + scheduled daily snapshot at midnight IST

---

## Screen 101: Financial Reports (Platform Revenue)

**Purpose:** SnapAccount's own financial health — subscription revenue, payment analytics.

**Roles:** System Admin, Operations Manager (limited — no revenue targets visible to ops)

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Reports > Financial]
---
[FY Selector: FY 2024-25 / FY 2023-24]
[Date range within FY]
[Export: "Export for Accountant"]

[Revenue Overview]
  [MetricCard: MRR — ₹82.3L]
  [MetricCard: ARR — ₹9.87Cr]
  [MetricCard: Total Revenue (YTD) — AmountDisplay]
  [MetricCard: Revenue Growth MoM — %]
  [MetricCard: Net Revenue (after refunds) — AmountDisplay]
  [MetricCard: Refund Rate — %]

[Revenue by Plan chart: Stacked bar — Free conversions + Basic + Pro + Enterprise per month]

[Payment Health]
  [MetricCard: Total Payments Received]
  [MetricCard: Failed Payments — count + value]
  [MetricCard: Recovery Rate (retries) — %]
  [MetricCard: Razorpay Processing Fees — AmountDisplay]

[Subscription Cohort Analysis]
  [Table: Cohort (signup month) × Retention month]
  [Color: green = high retention, red = churn]

[Revenue Forecast (AI)]
  [Line chart: Actual MRR + projected MRR (next 3 months)]
  [Confidence interval bands]

[GST on Revenue]
  [Platform's own GST liability on subscription revenue]
  [Taxable revenue | GST rate (18%) | GST payable]
  [Note: "Includes GST on subscription services. Consult your CA for filing."]
```

**Key Components:**
- MetricCard, Chart (stacked bar, line with confidence interval, cohort heatmap)
- AmountDisplay, Table (cohort), DateRangePicker

---

## Screen 102: User Analytics

**Purpose:** User acquisition, activation, engagement, retention analytics.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Reports > User Analytics]
---
[Date range + segment by: User type / State / Plan / Acquisition source]

[Acquisition funnel]
  [Funnel chart: App Installs → Phone Registered → Profile Complete → First Document → First Filing]
  [Drop-off % at each step shown]
  [Identifies biggest friction points]

[User growth chart]
  [Line chart: Cumulative users + New users per period (dual axis)]
  [Monthly active users (MAU) trend]

[Feature adoption table]
  [Columns: Feature | Users Using | % of Total | Avg Sessions/Week]
  [Rows: Document Upload | GST Filing | ITR Filing | Loan Hub | Expert Chat | Reports | AI Chat]
  [Sort by adoption %, export]

[Geographic distribution]
  [India state map: color-coded by user density]
  [Top 10 states table: State | Users | % GST Filers | MRR contribution]

[User behavior patterns]
  [Avg documents uploaded per month per active user]
  [Avg time from document upload to GST filing]
  [Peak usage hours (heatmap: day × hour)]

[Retention analysis]
  [Day 1 / 7 / 30 / 90 retention rates]
  [Cohort retention curves]

[Churn analysis]
  [Churned users by last action]
  [Exit survey reasons (if collected)]
```

**Key Components:**
- Funnel chart, Line chart, Map (India SVG), Heatmap
- MetricCard, Table, DateRangePicker, Select (segment)

---

## Screen 103: Compliance Report

**Purpose:** Platform compliance status — DPDP Act, data retention, audit completeness.

**Roles:** System Admin, Operations Manager (limited)

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Reports > Compliance]
---
[Compliance score card: prominent, large]
  [Overall: 94% compliant — circular progress indicator, green]
  [Last audit: date]
  [Next review: date]
  [PrimaryButton: "Generate Compliance Report PDF"]

[Section: DPDP Act 2023 Compliance]
  [Checklist of requirements — green check or red X per item]
  [✓ Explicit consent collected for data processing]
  [✓ Right to erasure implemented and tested]
  [✓ Data localization: all data in GCP asia-south1 (Mumbai)]
  [✓ Consent records audit trail maintained]
  [✓ Privacy policy last updated: [date]]
  [✗ Breach notification procedure: Last test: >90 days ago — WARNING]
  [Data export requests: N pending / N completed this month]
  [Account deletion requests: N pending / N completed]

[Section: Data Retention Compliance]
  [7-year retention policy status]
  [Documents retention: % within policy]
  [Financial records retention: % within policy]
  [Oldest records: date]
  [Auto-archival policy: active / inactive]
  [Next archival run: date]

[Section: Security Compliance]
  [Failed login attempts last 30 days: count]
  [Suspicious activity flags: count]
  [Admin accounts without MFA: count — warning if > 0]
  [Last penetration test: date]
  [SSL certificate expiry: date]
  [API rate limiting: active]

[Section: RBI / Banking Compliance (Loan data)]
  [Consent records for all loan applications: ✓]
  [Consent revocations processed within SLA: ✓]
  [Data shared with banks: audit trail ✓]

[Section: GST / IT Compliance (User filings)]
  [E-invoicing enablement for eligible businesses: N/M enabled]
  [Late filing rate: % — below 5% target]

[Compliance issues list]
  [Any red X items from above: detailed description + recommended action]
  [Assign to: staff member | Due date | Priority badge]
```

**Key Components:**
- Circular ProgressBar (compliance score), Checklist (green/red items)
- AlertBanner (compliance issues), MetricCard, PrimaryButton (PDF export)
- Table (issues list with assignments)

**Navigation:**
- Arrives: Sidebar Reports → Compliance
- Exits to: Audit Log (click audit trail links), User Management (consent requests)

**Role permissions:**
- System Admin: Full access + can generate and export compliance report
- Operations Manager: View only, cannot export full compliance report (contains sensitive config)
