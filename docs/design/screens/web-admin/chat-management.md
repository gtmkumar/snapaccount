# Web Admin Screens: Chat Management (Screens 80–83)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 80: Chat Dashboard

**Purpose:** Real-time overview of all active conversations, queue status, and CA availability.

**Roles:** CA (own conversations), Support Executive, Operations Manager, System Admin

**Layout:**
```
[Standard admin layout — chat section highlighted in sidebar]
[Breadcrumb: Dashboard > Chat]
---
[Real-time status bar: "Live — auto-refreshing" with green dot]

[KPI cards row]
  [MetricCard: "Active Conversations" — count, live]
  [MetricCard: "Queue (Unassigned)" — count, warning if >5]
  [MetricCard: "Avg Wait Time" — minutes, red if >15 min]
  [MetricCard: "Resolved Today" — count, success]
  [MetricCard: "Avg Response Time" — minutes]

[Two-column layout]

[LEFT (35%): Conversation queue list]
  [Tabs: Active | Queue | Resolved Today]

  [Active tab: conversations in progress]
    [ConversationItem per chat]
    [User name + category badge (GST/ITR/Loan/General)]
    [Assigned CA: avatar + name]
    [Last message preview: truncated]
    [Time in conversation]
    [Unread count badge]

  [Queue tab: unassigned conversations]
    [Unassigned conversations — sorted by wait time]
    [Wait time chip: orange/red if high]
    [Category badge: determines which CA specialty needed]
    [PrimaryButton: "Claim" or "Assign to CA" dropdown]

  [Search bar: filter by user name or query type]

[RIGHT (65%): Active conversation detail]
  [Chat interface (same as Screen 81 below) — shows currently selected conversation]
  [If no selection: "Select a conversation from the left panel"]
```

**Key Components:**
- MetricCard (live data), ConversationItem (list), Chat interface
- Badge (category, unread), PrimaryButton, FilterTabs

**Navigation:**
- Arrives: Dashboard chat widget, Sidebar Chat → Dashboard
- Exits to: Full Chat Interface (Screen 81) for focused view

**Key Interactions:**
- Left panel conversation click: Loads conversation in right panel (no page navigation)
- "Claim" in queue: Assigns conversation to current CA/executive
- "Assign to CA": Opens CA selector modal with specialty filter
- Real-time: New messages, new queue items appear live via SignalR
- Queue badge on sidebar icon increments in real-time

**Role permissions:**
- CA: Sees own active conversations; can claim from queue based on specialty
- Support Executive: Can see all, claim, assign to any CA
- Operations Manager: Full view + can reassign conversations

---

## Screen 81: Chat Interface (Admin Side)

**Purpose:** Full chat UI for CA/support staff to communicate with users.

**Roles:** CA (primary), Support Executive, Operations Manager (read)

**Layout:**
```
[Full-screen layout or 2-panel with conversation list on left]

[Chat header]
  [User info: Name | Business Name | Subscription plan badge | "GST Customer since 2024"]
  [Query category: Badge "GST" / "ITR" / "Loans" / "Compliance"]
  [Quick links: → User Profile | → Their Documents | → Their GST Returns]
  [Actions: "Assign to another CA" | "Mark Resolved" | "Escalate" | "More..."]

[Chat area — scrollable, newest at bottom]
  [User messages: left-aligned, grey bubble]
  [Admin messages: right-aligned, brand-500 bubble]
  [System messages: centered grey text (assignment, escalation events)]
  [AI messages: left-aligned, purple bubble with AI sparkle icon]
  [Timestamps + read receipts]
  [File/image attachments: thumbnail or file card]

[Context panel — collapsible right sidebar in full layout]
  [User quick info: PAN, GSTIN, phone, plan, language]
  [Relevant documents: last 3 uploaded, with links]
  [Related GST/ITR status: current filing status]
  [Previous chat history: last 3 conversations, collapsed]
  [Notes: sticky notes CA has added about this user]

[Input area]
  [TextInput: multiline, "Type message..."]
  [Quick reply templates: chip-style suggestions]
    [e.g., "Your GSTR-3B is ready" | "We need Form 16" | "Your loan docs are ready"]
  [Attachment button: opens file picker]
  [Send button: brand-500]
  [Canned responses: "/" shortcut triggers template search]

[AI assistance tools — CA-facing only]
  [AI suggest button: "AI Draft" — generates response suggestion based on context]
  [User shows response suggestion in grayed text, CA can accept/edit/discard]
  [Knowledge base search: "Search docs" — searches internal CA knowledge base]
```

**Key Components:**
- Chat messages (user/admin/AI/system), TextInput (multiline)
- Context panel (quick info), CannedResponses, PrimaryButton
- FileAttachment, Avatar, StatusBadge

**Navigation:**
- Arrives: Chat Dashboard conversation selection
- Exits to:
  - "Mark Resolved" → Conversation closed, returns to queue view
  - "User Profile" link → User Detail (Screen 85)
  - "Their Documents" → Document viewer

**Key Interactions:**
- Real-time via SignalR — messages appear instantly
- Typing indicator sent while CA is typing
- Read receipts: Delivered on server receipt, Read on user opening
- Quick reply templates: Click chip to populate input (editable before send)
- "/" in input: Opens template search overlay
- AI Draft: One-click AI response based on conversation context (CA reviews before sending)
- Image attachment: Opens inline viewer (lightbox)
- Canned responses management: "Edit templates" link in input area

**Role permissions:**
- CA: Full access — can message, close, escalate
- Support Executive: Can message, can assign to CA specialty
- Operations Manager: Can read, can reassign; should not impersonate CA

---

## Screen 82: Video Call Calendar

**Purpose:** Admin-side view of all upcoming video consultations and appointment management.

**Roles:** CA (own appointments), Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Chat > Video Calls]
---
[Calendar view selector: Month | Week | Day]

[Month view (default)]
  [Standard calendar grid: 7 columns, 4-5 rows]
  [Appointment dots on dates with bookings]
  [Color-coded: green=confirmed, yellow=pending, grey=completed, red=cancelled]

[Week view — detailed]
  [Time grid: 8 AM – 8 PM]
  [Day columns: Monday–Friday]
  [Appointment blocks: user name + CA name + duration]
  [Click appointment: opens detail panel]
  [Empty slot: click to manually book appointment]

[Right sidebar: Upcoming today]
  [List of today's appointments]
  [AppointmentCard per item]
    [Time | User | Duration | Topic | Join Link]
    [PrimaryButton: "Join Call" — active 10 min before]
    [GhostButton: "Reschedule" | "Cancel"]

[CA availability settings]
  [Manage CA: Set availability hours, block times, vacation]
  [Per-CA calendar for Operations Manager view]

[Appointment detail panel (click appointment)]
  [User: name, phone, topic notes]
  [CA: assigned CA]
  [Platform: Google Meet link]
  [Status: Confirmed / No Show / Completed]
  [Rating (if post-call): stars]
  [Notes from CA]
```

**Key Components:**
- Calendar (month/week/day views), AppointmentCard
- PrimaryButton, GhostButton, Badge (status color)

**Navigation:**
- Arrives: Sidebar Chat → Video Calls
- Exits to: Chat Interface (Schedule new chat after call), or User Profile

**Role permissions:**
- CA: Can see own appointments; can manage own availability
- Operations Manager: Can see all CAs' calendars, reassign appointments

---

## Screen 83: Chat Analytics

**Purpose:** Performance metrics for chat operations — response times, resolution rates, satisfaction.

**Roles:** Operations Manager, System Admin

**Layout:**
```
[Standard admin layout]
[Breadcrumb: Chat > Analytics]
---
[Date range selector: Last 7D / 30D / 90D / Custom]
[Segment by: CA / Query Type / User Segment]

[KPI summary row]
  [MetricCard: "Total Conversations" count]
  [MetricCard: "Avg First Response Time" minutes — vs target <15 min]
  [MetricCard: "Avg Resolution Time" hours]
  [MetricCard: "CSAT Score" avg rating out of 5]
  [MetricCard: "Escalation Rate" %]

[Response time distribution chart]
  [Histogram: X-axis response time buckets, Y-axis count]
  [Target line at 15 minutes]

[Query category breakdown]
  [Pie chart: GST / ITR / Loans / Compliance / General split]
  [Table: Category | Count | Avg Time | Resolution % | CSAT]

[CA performance table]
  [Columns: CA Name | Conversations | Avg Response | Avg Resolution | CSAT | Escalations]
  [Sortable, export to CSV]

[User satisfaction trends]
  [Line chart: CSAT score over time]
  [Low-rated conversations list: "Review these 5 conversations with rating ≤ 2"]

[Peak hours heatmap]
  [7-day × 24-hour grid showing conversation volume]
  [For staffing optimization]
```

**Key Components:**
- MetricCard, Chart (histogram, pie, line, heatmap), Table
- DateRangePicker, Select (segmentation), GhostButton (export)

**Navigation:**
- Arrives: Sidebar Chat → Analytics
- Exits to: N/A (read-only analytics)

**Role permissions:**
- Operations Manager: Full access
- System Admin: Full access
- CA: Can see own performance metrics only (not other CAs)
