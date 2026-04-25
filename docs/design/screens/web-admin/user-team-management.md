# Web Admin Screens: User & Team Management (Screens 84–90)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 84: User List

**Purpose:** Browse, search, filter, and manage all registered users (SME owners + employees).

**Roles:** Support Executive (view + contact), Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Dashboard > Users]
---
[Page header: "Users" | "48,234 total users" | PrimaryButton: "Export" | PrimaryButton: "Add User (manual)"]

[Filter bar]
  [TextInput: "Search by name, phone, PAN, GSTIN, email"]
  [Select: User Type — All / Business Owner / Employee / Both]
  [Select: Plan — All / Free / Basic / Pro / Enterprise]
  [Select: Status — All / Active / Inactive / Suspended / Deleted]
  [Select: State — All Indian states]
  [DatePicker: Joined date range]
  [Select: GST Compliance — Good / Poor / No GST]
  [Button: Reset / Apply]

[User table]
  [Columns: Avatar | Name | Phone | Email | User Type | Plan | GSTIN | State | Joined | Last Active | Status | Actions]
  [Name: link → User Detail]
  [Phone: tel: link]
  [Plan: Badge with color (Free=grey, Basic=blue, Pro=brand, Enterprise=gold)]
  [Status: Active (green) / Inactive (grey) / Suspended (red)]
  [Actions: "View" | "Suspend" | "Delete" (with confirmation)]

[Pagination: 50/100 per page]
[Bulk actions: Select → Export / Suspend / Send notification / Assign tag]
```

**Key Components:**
- Table (sortable, filterable), Avatar, Badge, FilterBar
- PrimaryButton, SecondaryButton, Pagination

**Navigation:**
- Arrives: Sidebar Users → User List, or Dashboard quick links
- Exits to: User Detail (Screen 85) on row click or "View"

**Role permissions:**
- Support Executive: View, contact (cannot delete or suspend)
- Operations Manager: Full except cannot delete
- System Admin: Full access including hard delete

---

## Screen 85: User Detail

**Purpose:** Complete user profile view with documents, transactions, subscription history, audit logs.

**Roles:** Support Executive (limited), CA (financial tabs), Operations Manager, System Admin

**Layout:**
```
[Full-width page layout]
[Breadcrumb: Users > [User Name]]
---
[User header card: elevated, gradient subtle]
  [Avatar 80px | Name text-2xl font-bold | Status badge | Plan badge]
  [Phone | Email | Joined date | Last active: "2 hours ago"]
  [Business: [Business Name] | GSTIN | State]
  [PAN: XXXXX****X (masked)]

[Actions bar]
  [SecondaryButton: "Send Notification"]
  [SecondaryButton: "Start Chat"]
  [GhostButton: "Suspend Account" — warning color]
  [GhostButton: "Delete Account" — error color — System Admin only]

[Tab navigation: Profile | Documents | GST Returns | ITR History | Loans | Subscription | Audit Log]

[Profile tab]
  [Business details card: type, industry, address, turnover]
  [Employee details card (if employee type): employer, employment type]
  [Devices: list of logged-in devices with revoke options]
  [Language preference: badge]
  [Notification preferences: summary]

[Documents tab]
  [Document list table — all user's documents]
  [Filter by category/status/date]
  [Same DocumentCard view as mobile, admin can view/download]

[GST Returns tab]
  [All GSTR-1 and GSTR-3B filings history]
  [Status, period, filed date, net tax, ARN]
  [Links to detailed return view]

[ITR History tab]
  [All ITR filings by FY]
  [Status, form, regime, refund/due, acknowledgment]

[Loans tab]
  [All loan applications]
  [Status per bank, amounts, decisions]

[Subscription tab]
  [Current plan, renewal date]
  [Payment history table: date, amount, plan, invoice download]
  [Usage: documents uploaded / returns filed / chat sessions]

[Audit Log tab]
  [All actions by/on this user: login, logout, document upload, GST filing, etc.]
  [Columns: Timestamp | Action | By (user or admin) | IP | Details]
```

**Key Components:**
- Tab navigation, Card (profile sections), Table (per tab)
- Avatar, Badge, AmountDisplay, StatusBadge
- SecondaryButton, GhostButton (actions)

**Navigation:**
- Arrives: User List row click
- Exits to: Document Review, GST Return Review, ITR detail as context

**Role permissions:**
- Support Executive: Profile + Documents + GST + ITR tabs (view only)
- CA: Documents + GST Returns + ITR History (full detail)
- Operations Manager: All tabs, can suspend
- System Admin: All tabs + Audit Log + delete

---

## Screen 86: Organization Management

**Purpose:** Manage multi-org setup — users who manage multiple businesses.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Users > Organizations]
---
[Summary: "1,234 organizations | 156 users with multiple orgs"]

[Filter: Active / Inactive | By state | By industry]

[Organization table]
  [Columns: Org Name | Primary Owner | Members | GSTIN(s) | Plan | Created | Status | Actions]
  [Members: count badge, click to see member list]
  [Actions: "View" | "Edit" | "Merge" (for duplicate cleanup) | "Deactivate"]

[Organization detail panel / page]
  [Org profile: name, type, GSTINs, address]
  [Members list: role per member (owner / member / guest)]
  [Add member: TextInput search by phone/email + role assignment]
  [Remove member: with confirmation]
  [Audit: org creation, member changes log]
```

**Key Components:**
- Table, Badge (member count), PrimaryButton, GhostButton

**Navigation:**
- Arrives: Sidebar Users → Organizations
- Exits to: User Detail (member profile) or back

---

## Screen 87: Staff List

**Purpose:** View and manage all internal staff (operators, CAs, support executives).

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Team > Staff]
---
[Page header: "Team Members" | Count | PrimaryButton: "Invite Staff Member"]

[Filter: Role / Status / Department]

[Staff table]
  [Columns: Avatar | Name | Email | Role | Status | Current Queue | Completed Today | Avg Handle Time | Satisfaction | Actions]
  [Role: Badge — CA / Support Exec / Data Entry / Ops Manager / System Admin / Bank Rep]
  [Current Queue: count of assigned items]
  [Status: Online (green) / Away (yellow) / Offline (grey)]
  [Actions: "View Profile" | "Edit Role" | "Deactivate"]

[Invite Staff modal]
  [TextInput: Email]
  [Select: Role]
  [Select: Department/Specialization]
  [PrimaryButton: "Send Invite" — sends email with setup link]
```

**Key Components:**
- Table, Avatar, Badge (role, status), PrimaryButton
- InviteModal (TextInput + Select)

**Navigation:**
- Arrives: Sidebar Team → Staff List
- Exits to: Staff performance detail

**Role permissions:**
- Operations Manager: Can view, invite, change roles (not above own level)
- System Admin: Full access

---

## Screen 88: Role & Permission Management

**Purpose:** Define and manage roles and their granular permissions.

**Roles:** System Admin only

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Team > Roles & Permissions]
---
[Roles list: left panel 300px]
  [Role cards: Data Entry Operator | Support Executive | CA | Operations Manager | System Admin | Partner Bank Rep]
  [Click role: loads permission matrix on right]
  [PrimaryButton: "Create Custom Role"]

[Right: Permission matrix for selected role]
  [Role name (editable for custom roles)]
  [Role description]
  
  [Permission groups with toggle per permission]
  
  [Group: Documents]
    [Toggle: View documents]
    [Toggle: Review and edit OCR]
    [Toggle: Approve documents]
    [Toggle: Delete documents]
  
  [Group: GST]
    [Toggle: View returns]
    [Toggle: Edit returns]
    [Toggle: File returns]
    [Toggle: Access notice tracker]
  
  [Group: ITR]
    [Similar granular toggles]
  
  [Group: Loans]
    [Toggle: View applications]
    [Toggle: Update status]
    [Toggle: Submit to bank]
  
  [Group: Users]
    [Toggle: View user profiles]
    [Toggle: Edit user profiles]
    [Toggle: Suspend/delete users]
  
  [Group: Team]
    [Toggle: View staff]
    [Toggle: Invite staff]
    [Toggle: Manage roles]
  
  [Group: Settings]
    [Toggle: View settings]
    [Toggle: Edit settings]
    [Toggle: Feature flag management]
  
  [Group: Reports & Analytics]
    [Toggle: View operational reports]
    [Toggle: Export data]
    [Toggle: View financial reports]
  
  [Group: Audit]
    [Toggle: View audit logs]
    [Toggle: Export audit logs]

  [Save button: PrimaryButton "Save Role Permissions"]
```

**Key Components:**
- Toggle (per permission), Card (role), PrimaryButton

**Navigation:**
- Arrives: Sidebar Team → Roles & Permissions
- Exits to: N/A (settings page)

---

## Screen 89: Workload Distribution

**Purpose:** View and balance work distribution across team members in real-time.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Team > Workload]
---
[Date selector: Today | This Week]

[Department filter: All | Document Review | GST | ITR | Loans | Chat]

[Workload grid: Staff rows × Queue type columns]
  [Columns: Staff Name | Role | Docs Queue | GST Queue | ITR Queue | Chat | Total | Status]
  [Each queue cell: count — colored by load level]
    [Green: 0-10 items | Yellow: 11-20 | Orange: 21-30 | Red: 31+]
  [Total column: aggregate count]

[Drag-and-drop rebalancing: hover assignment → "Transfer N to [staff]" option]

[Auto-balance button: PrimaryButton "Auto-Rebalance" — algorithm distributes evenly]

[Capacity alerts]
  [Warning: "3 staff members are overloaded. 2 staff members have capacity."]
  [Suggested reassignment list]
```

**Key Components:**
- Grid/table with color-coded cells, PrimaryButton (auto-balance)
- AlertBanner, Badge (load color)

**Navigation:**
- Arrives: Sidebar Team → Workload, or Dashboard team widget
- Exits to: N/A (management view)

---

## Screen 90: KPI Dashboard

**Purpose:** Team performance metrics — callback KPIs, SLA adherence, operational metrics.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Team > KPIs]
---
[Date range: Last 7D / 30D / 90D / Custom]
[Team filter: All / GST Team / ITR Team / Loan Team / Chat Team]

[SLA Compliance section]
  [MetricCard: "Document Review SLA %" — target 95%]
  [MetricCard: "GST Filing SLA %" — target 95%]
  [MetricCard: "ITR Verification SLA %" — target 95%]
  [MetricCard: "Callback Response SLA %" — target 95%]

[Callback KPIs section (GST + ITR)]
  [MetricCard: "GST FCR Rate" — target >70%]
  [MetricCard: "ITR FCR Rate" — target >75%]
  [MetricCard: "Avg Call Duration (GST)" — target 5-12 min]
  [MetricCard: "Avg Call Duration (ITR)" — target 8-12 min]
  [MetricCard: "Customer Satisfaction" — target >4.5/5 stars]
  [MetricCard: "First Response Time (Chat)" — target <4 hours]

[Trend charts]
  [Line chart: KPIs over time — FCR / Satisfaction / SLA %]
  [Team vs target lines clearly marked]

[Individual staff KPI table]
  [Columns: Name | Role | Documents | Callbacks | FCR | Avg Duration | Satisfaction | SLA %]
  [Sort by any column]
  [Export: CSV]

[Alert: Staff members below KPI targets highlighted in orange/red rows]
```

**Key Components:**
- MetricCard, Chart (line), Table, AlertBanner
- DateRangePicker, Select (team filter), GhostButton (export)

**Navigation:**
- Arrives: Sidebar Team → KPIs, or Dashboard team widget link
- Exits to: Staff Profile (click staff row for drill-down)
