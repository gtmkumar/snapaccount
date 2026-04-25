# Web Admin Screens: Subscription Management & System Configuration (Screens 91–99)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 91: Plan Configuration

**Purpose:** Create, edit, and configure subscription plans — prices, features, limits.

**Roles:** System Admin, Operations Manager (view only)

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Subscriptions > Plans]
---
[Page header: "Subscription Plans" | PrimaryButton: "Create New Plan"]

[Plans grid: card per plan]
  [PlanCard: Free]
    [Name | Price: ₹0/month | Subscribers: count badge]
    [Feature list: toggles/limits per feature]
    [EditButton]
    [Archive button (if no active subscribers)]

  [PlanCard: Basic, Pro, Enterprise — same structure]

[Plan editor — modal or side panel on Edit/Create]

  [Section: Basic Info]
    [TextInput: Plan name]
    [TextInput: Display tagline]
    [RadioGroup: Billing — Monthly | Annual | Both]
    [TextInput: Monthly price (INR)]
    [TextInput: Annual price (INR) with "X months free" auto-calc]
    [Toggle: "Is this a public plan?" — hidden plans for special customers]
    [Toggle: "Allow trial?" | TextInput: "Trial days" (if yes)]
    [Toggle: "Is this the default free plan?" — one plan max]

  [Section: Feature Limits]
    [Row per feature: Feature name | Limit type | Limit value]
    [Document uploads per month: Select (unlimited / number) + TextInput]
    [GST returns per FY: Select + TextInput]
    [ITR filings per FY: Select + TextInput]
    [Expert chat messages: Select + TextInput]
    [Video consultations: Select + TextInput]
    [Storage (GB): Select + TextInput]
    [Team members: Select + TextInput]
    [API access: Toggle on/off]
    [Tally export: Toggle]
    [Priority support: Toggle]
    [AI features: Toggle]

  [Section: Display Features]
    [Feature bullets shown on pricing page]
    [Reorderable list of feature strings]
    [Add feature bullet: TextInput + Add button]

  [Save / Cancel]
```

**Key Components:**
- Card (plan grid), Form (plan editor), Toggle (per feature), Select, TextInput
- PrimaryButton, SecondaryButton

**Navigation:**
- Arrives: Sidebar Subscriptions → Plans
- Exits to: Subscriber List (plan card subscriber count click)

---

## Screen 92: Subscriber List

**Purpose:** View all subscribers, their plan status, and billing health.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Subscriptions > Subscribers]
---
[Summary: "8,234 paying subscribers | ₹82.3L MRR"]

[Filter: Plan / Status / Payment Health / State / Joined date]

[Subscriber table]
  [Columns: User | Plan | Status | MRR | Billed Since | Next Renewal | Payment | Churned At | Actions]
  [Status: Active / Trial / Cancelled / Expired / Paused]
  [Payment: Healthy (green) / Failed (red) / Retrying (yellow)]
  [Actions: "View User" | "Change Plan" | "Cancel" | "Pause" | "Refund"]
```

---

## Screen 93: Revenue Dashboard

**Purpose:** Subscription revenue analytics — MRR, ARR, churn, LTV.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Subscriptions > Revenue]
---
[KPI cards]
  [MetricCard: MRR — ₹82.3L]
  [MetricCard: ARR — ₹9.87Cr]
  [MetricCard: Active Subscribers — 8,234]
  [MetricCard: Churn Rate — 2.3%/month]
  [MetricCard: Avg Revenue Per User (ARPU)]
  [MetricCard: Avg Customer LTV]

[Revenue trend chart: Line — MRR growth over 12 months]

[Plan mix donut chart: % of revenue by plan tier]

[Churn analysis]
  [Churn by reason: upgrade/downgrade/cancellation/payment failure]
  [Cohort retention table: month 1/3/6/12 retention by signup cohort]

[New vs Churned subscribers chart: stacked bar]

[Trial conversion: funnel chart — trial starts → paid conversions]
```

**Key Components:**
- MetricCard, Chart (line, donut, bar, funnel), Table
- DateRangePicker, AlertBanner

---

## Screen 94: Invoice Management

**Purpose:** View and manage subscription invoices generated for users.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Subscriptions > Invoices]
---
[Filter: Status / Date range / Plan / Amount]

[Invoice table]
  [Columns: Invoice No | User | Plan | Period | Amount | Status | Issued | Due | Paid On | Actions]
  [Status: Paid (green) / Pending / Failed / Refunded / Void]
  [Actions: "Download PDF" | "Resend to user" | "Refund" | "Void"]

[Monthly summary card]
  [Total invoiced | Total collected | Pending | Failed]

[Failed payment recovery section]
  [Failed invoices list with retry button per invoice]
  [Bulk retry button: "Retry all failed invoices from last 30 days"]
```

---

## Screen 95: Notification Template Manager

**Purpose:** Create and manage notification templates for all channels (push, SMS, email, WhatsApp).

**Roles:** System Admin, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: System > Notification Templates]
---
[Filter: Channel / Event Type / Language / Status]

[Template table]
  [Columns: Template Name | Channel | Event | Language | Status | Last Modified | Actions]
  [Channel badges: Push / SMS / Email / WhatsApp]
  [Actions: "Edit" | "Preview" | "Duplicate" | "Archive"]
  [PrimaryButton: "Create Template"]

[Template editor — full-width modal or page]

  [Section: Basic Info]
    [TextInput: Template name (internal)]
    [Select: Channel — Push / SMS / Email / WhatsApp]
    [Select: Event trigger — GST Deadline / ITR Reminder / Document Processed / etc.]
    [Select: Language — all 10 Indian languages + English]
    [Toggle: Active / Inactive]

  [Section: Content]
    [For Push notification:]
      [TextInput: Title (max 65 chars)]
      [TextInput: Body (max 240 chars)]
      [Select: Notification category (for iOS grouping)]
      [TextInput: Deep link URL]

    [For SMS:]
      [TextArea: Message (max 160 chars per segment, shows segments)]
      [DLT Template ID: TextInput (mandatory for India TRAI compliance)]

    [For Email:]
      [TextInput: Subject line]
      [RichTextEditor: Email body with HTML support]
      [Attachments: toggle options]

    [For WhatsApp:]
      [Select: Approved template (from WhatsApp Business Manager)]
      [Variable mapping: {variable_name} → data field mapping]

  [Variable substitution panel]
    [List of available variables: {user_name}, {gstin}, {due_date}, {amount}, etc.]
    [Click to insert at cursor]

  [Preview panel]
    [Real-time preview with sample values]
    [Device mockup for push / SMS / email preview]
    [Preview language selector]

  [Save / Cancel]
```

**Key Components:**
- Table, Form (template editor), RichTextEditor, TextArea
- Badge (channel), Select, Toggle, PrimaryButton
- Preview panel (device mockup)

---

## Screen 96: Tax Rate Configuration

**Purpose:** Manage versioned GST rates and income tax slabs — temporal tables with effective dates.

**Roles:** System Admin only

**Layout:**
```
[Standard admin layout]
[Breadcrumb: System > Tax Configuration]
---
[Tabs: GST Rates | Income Tax Slabs | TDS Rates | Cess & Surcharge]

[GST Rates tab]
  [Warning banner: "Tax rate changes require immediate deployment. Verify with GST Council notification before saving."]

  [Current active rates table]
  [Row: Rate 0% | Effective from: 2017-07-01 | Status: Active | Products/Services: list]
  [Row: Rate 5% | ... ]
  [Row: Rate 12% | ... ]
  [Row: Rate 18% | ... ]
  [Row: Rate 28% | ... ]

  [Add new rate version: PrimaryButton "Schedule Rate Change"]
  [Rate change form:]
    [Select: Affected rate (e.g., 18%)]
    [TextInput: New rate value]
    [DatePicker: Effective from date]
    [TextArea: Notification reference (GST Council notification number)]
    [TextArea: Description of change]
    [Save as PENDING until effective date, then auto-activates]

[Income Tax Slabs tab]
  [Select: FY selector | Select: Regime (Old/New)]
  [Slab table: Income Range From | Income Range To | Rate % | Effective FY]
  [Add/Edit slab: Form with validation]
  [Section 87A rebate: configure threshold + rebate amount]
  [Standard deduction: configure amount per FY]

[Historical versions: view past rate configurations for audit purposes]
```

**Key Components:**
- Table (versioned), Form (rate change), Select (FY/regime), DatePicker
- AlertBanner (critical warning), PrimaryButton

---

## Screen 97: HSN/SAC Code Manager

**Purpose:** Manage HSN (goods) and SAC (services) code database used in GST invoicing.

**Roles:** System Admin, Operations Manager

**Layout:**
```
[Standard admin layout]
[Breadcrumb: System > HSN/SAC Codes]
---
[Tabs: HSN Codes (Goods) | SAC Codes (Services)]

[Search: TextInput "Search code or description"]
[Filter: Chapter / Rate / Status]

[Code table]
  [Columns: Code | Description | Default GST Rate | Chapter | Status | Actions]
  [Searchable and filterable]
  [Actions: "Edit default rate" | "Deactivate"]

[Bulk import: SecondaryButton "Import from CSV" — for GST council updates]

[Manual add: PrimaryButton "Add Code"]
  [Form: Code | Description | Rate | Chapter | Notes]
```

---

## Screen 98: System Health Dashboard

**Purpose:** Monitor platform health — API response times, error rates, queue depths, infrastructure.

**Roles:** System Admin only

**Layout:**
```
[Standard admin layout]
[Breadcrumb: System > Health]
---
[Status bar: "All systems operational" (green) or "Degraded" (yellow) or "Outage" (red)]
[Auto-refresh: every 30 seconds]

[Service health cards — one per microservice]
  [Auth Service | Document Service | GST Service | ITR Service | Loan Service | Chat Service | Notification Service | Report Service | Subscription Service | AI Service]
  [Per card: Status indicator | Avg response time | Error rate last 1h | Uptime 24h]

[Infrastructure metrics]
  [Database: connections / query time / replication lag]
  [Redis: memory / hit rate / latency]
  [Pub/Sub: message backlog per topic]
  [Cloud Run: container count / CPU / memory per service]

[Alert history: last 24 hours]
  [Incident list: severity / service / start / end / impact]

[External dependencies status]
  [GST Portal API: status / avg response]
  [Income Tax Portal API: status]
  [Razorpay: status]
  [Firebase Auth: status]
  [Google Document AI: status]
  [Sarvam AI: status]

[Logs quick view: last 20 error logs with link to Cloud Logging]
```

**Key Components:**
- StatusCard (per service), MetricCard, AlertBanner (incidents)
- Chart (real-time time-series), Table (alert history)

---

## Screen 99: Audit Log Viewer

**Purpose:** Browse, search, and export the immutable audit trail of all system actions.

**Roles:** System Admin, Operations Manager (limited)

**Layout:**
```
[Standard admin layout]
[Breadcrumb: System > Audit Log]
---
[Filter bar]
  [TextInput: Search by user / action / resource]
  [Select: Action type — Login / Logout / Create / Update / Delete / View / Export / File Return / File ITR / etc.]
  [Select: Actor type — End User / Admin Staff / System (automated)]
  [Select: Service — Auth / Document / GST / ITR / Loan / Chat / etc.]
  [DatePicker: Date range]
  [Select: User (specific user search)]
  [PrimaryButton: "Export Filtered" — CSV/JSON]

[Audit log table]
  [Columns: Timestamp (IST) | Actor | Actor Type | Action | Resource | Resource ID | IP | Device | Details | Outcome]
  [Timestamp: precise to millisecond]
  [Actor: linked user name]
  [Action: color-coded badge: Create (green) / Update (blue) / Delete (red) / View (grey) / Login (brand)]
  [Details: expandable JSON row with full payload]
  [Outcome: Success / Failed / Partial]

[Detail drawer: click row → shows full audit event JSON]
  [All fields: timestamp, actor, service, action, resource ID, before state, after state, IP, user agent, session ID]

[Immutability note: "Audit logs are append-only and cannot be edited or deleted."]

[Pagination: 100 per page, can jump to date]
```

**Key Components:**
- Table (large, paginated), Filters, Badge (action type)
- DetailDrawer (JSON viewer), PrimaryButton (export)

**Navigation:**
- Arrives: Sidebar System → Audit Log, or User Detail audit tab

**Role permissions:**
- System Admin: Full access including export
- Operations Manager: Can view logs for their team members and operational actions; cannot view System Admin actions or export without approval
