# Mobile Screens: Expert Chat (Screens 42–46)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 42: Chat List (Conversations)

**Purpose:** Browse all chat conversations with CAs and support team.

**Layout:**
```
[TopNavBar: "Expert Chat" large title, Compose icon right (new query)]
---
[AI Quick Answer banner — floating card]
  [Icon: AI sparkle]
  [Text: "Have a quick question? Ask AI — instant answers for common queries"]
  [GhostButton: "Ask AI"]

[Filter tabs: All | GST | ITR | Compliance | Loans | General]

[Conversation list — FlatList, pull-to-refresh]

[ConversationItem per thread]
  [Avatar: CA initials/photo, 44px, with online dot if active]
  [Top row: CA Name | Timestamp (relative: "2 min ago")]
  [Subject line: e.g. "GSTR-3B for March 2025" — text-base font-medium]
  [Preview: Last message text, truncated 1 line — text-sm text-neutral-500]
  [Right: Unread badge (count) — brand-500 circle]
  [Status indicator if CA typing: "Typing..." text-xs text-neutral-400 italic]

[Swipe left on item: "Archive" action]
[Swipe right on item: "Mark as read/unread" action]

[Empty state (no conversations):]
  [Illustration: Expert consultant]
  [Title: "Talk to a CA"]
  [Description: "Get expert advice on GST, ITR, compliance, and loans"]
  [PrimaryButton: "Start Conversation"]
```

**Key Components:**
- Avatar, Badge (unread count), FilterTabs, PrimaryButton
- FlatList with ConversationItem, AlertBanner (AI suggestion)

**Navigation:**
- Arrives: BottomTabBar → Chat tab
- Exits to:
  - Conversation tap → Chat Detail Screen
  - "Start Conversation" / compose → New query category selection sheet
  - "Ask AI" → AI chat interface (inline or new screen)

**Key Interactions:**
- Pull-to-refresh: Fetches latest messages via SignalR or REST
- New message indicator: Badge auto-clears on conversation open
- Unread count shown in BottomTabBar badge

---

## Screen 43: Chat Detail (WhatsApp-Style)

**Purpose:** Real-time chat interface between user and CA/support expert.

**Layout:**
```
[TopNavBar: Back, CA name + "CA — GST Specialist" subtitle, Avatar right, Video call icon right]
  [CA online status: green dot if active | "Last seen 2 min ago" if not]
---
[Chat area — FlatList, inverted — newest at bottom]
  [User messages: right-aligned, brand-500 bubble, white text]
  [CA messages: left-aligned, white bubble, grey border, dark text]
  [Timestamp: below each message, text-xs text-neutral-400]
  [Read receipts: single grey tick = sent, double grey = delivered, double blue = read]
  [Message types:]
    [Text bubble]
    [Image attachment: thumbnail with tap-to-expand]
    [PDF attachment: grey card with file icon, name, size, "Open" button]
    [System message: centered grey text "Query assigned to CA Priya Sharma — 10:34 AM"]
    [Typing indicator: three animated dots in CA bubble]

[Input area — sticky bottom, above keyboard]
  [TextInput: "Type a message..." — multiline, auto-grows to 4 lines max]
  [Left actions: Attachment icon (file/image picker), Camera icon]
  [Right: Send button (arrow icon, brand-500, enabled when text/file present)]
```

**Key Components:**
- FlatList (chat messages), TextInput (multiline), Avatar
- IconButton (attachment, camera, send)
- Image viewer, PDF viewer, TypingIndicator

**Navigation:**
- Arrives: Chat List tap
- Exits to:
  - Video Call Booking (video call icon tap)
  - Full-screen image viewer (image message tap)
  - PDF viewer (PDF attachment tap)

**Key Interactions:**
- Real-time via SignalR WebSocket connection
- Typing indicator: Fires on first keypress, debounced 2s to stop
- Read receipts: Delivered when message received by server; Read when screen in focus
- Attachment: Opens bottom sheet with Camera / Gallery / Files / Documents (from vault) options
- "Share from Document Vault": Sends document securely as attachment (signed URL)
- Long press message: Context menu — Copy / Reply / Forward / Delete (own messages) / Report
- Swipe right on message: Reply to that specific message (message preview in input)
- Image long press: Save to gallery option
- Connection lost: "Reconnecting..." banner appears, messages queued

**Loading state:** Chat history loads with skeleton bubbles

**Empty state (new conversation):**
- Starter prompts: "Common questions: What documents do I need for GSTR-3B? | When is my ITR deadline?"

**Indian UX notes:**
- WhatsApp-like UX is intentional — highest familiarity for Indian users
- Sarvam AI translation: Messages can be sent/received in regional language if enabled
- Attach from Document Vault: Secure, no need to re-download and re-upload sensitive docs
- Most queries will be in Hindi or regional languages — ensure proper rendering

---

## Screen 44: Video Call Booking

**Purpose:** Schedule a video consultation appointment with a CA.

**Layout:**
```
[TopNavBar: Back, "Book Video Call" title]
---
[CA selector — if not already in context]
  [CA profile cards with specialization and rating]

[Selected CA card]
  [Avatar: 64px, large]
  [CA Name, Designation, Rating: ★★★★½ (4.5)]
  [Specialization badges: "GST Filing", "ITR", "Compliance"]
  [Brief bio: 2 lines]

[Select Date]
  [Calendar picker: month view, tap date]
  [Available dates: brand-500 highlight]
  [Unavailable: grey strikethrough]
  [Today: today marker]

[Select Time Slot — shown after date selected]
  [Grid of time slots: 9:00 AM | 9:30 AM | 10:00 AM | ...]
  [Available: white card with border]
  [Booked: grey, disabled]
  [Selected: brand-500 bg, white text]

[Session type]
  [Radio: "30 minutes — Quick consultation (₹0 / Included in plan)"]
  [Radio: "60 minutes — Full session (₹299 for Basic plan)"]

[Topic/Notes — optional]
  [TextInput multiline: "What do you want to discuss?"]
  [Character count: 200 max]

[Confirm section]
  [Summary: Date, Time, Duration, CA Name]
  [Google Meet / Zoom: "Meeting link will be sent via SMS and email"]
  [PrimaryButton: "Confirm Appointment"]
```

**Key Components:**
- DatePicker (calendar view), TimeSlot grid cards, RadioGroup
- Avatar, Badge (specialization), TextInput, PrimaryButton

**Navigation:**
- Arrives: Chat Detail (video icon), or Chat List → New appointment
- Exits to: Appointment List (after confirmation)

**Key Interactions:**
- Date selection triggers time slot load (API call)
- Time slot tap selects instantly (visual feedback)
- Calendar swipe: Navigate months

**Indian UX note:**
- Session pricing visible upfront — no surprise charges
- Google Meet preferred (widely used in India, free for users)

---

## Screen 45: Appointment List

**Purpose:** View upcoming and past video call appointments.

**Layout:**
```
[TopNavBar: Back, "Appointments" title, + Book New icon right]
---
[Tabs: Upcoming | Past]

[Upcoming appointments list]

[AppointmentCard]
  [Date: "Tomorrow, Apr 5, 2025 • 10:00 AM" — text-base font-semibold]
  [CA: Avatar + "CA Priya Sharma — GST Specialist"]
  [Duration: "30 min" chip]
  [Platform: Google Meet icon]
  [Topic: "GSTR-3B March 2025 review"]
  [Action buttons row:]
  [PrimaryButton: "Join Call" — enabled 10 min before scheduled time]
  [GhostButton: "Reschedule"]
  [GhostButton: "Cancel" — red text, confirmation required]

[Past appointments]
  [AppointmentCard: muted, no join button]
  [Rating prompt if not rated: "How was your session?" ★★★★★ stars]
  [If rated: rating shown]
  [GhostButton: "View Chat Transcript" — if recorded]

[Empty state: "No upcoming appointments. Book a consultation with a CA."]
```

**Key Components:**
- Card, Avatar, Badge, PrimaryButton, GhostButton, StarRating (1-5)

**Navigation:**
- Arrives: Chat Detail (video icon), or BottomTabBar More → Appointments
- Exits to:
  - "Join Call" → External (Google Meet / Zoom deep link)
  - "Reschedule" → Video Call Booking with existing slot pre-selected
  - "Book New" → Video Call Booking fresh

**Key Interactions:**
- Countdown timer on upcoming appointment card (if within 60 min)
- "Join Call" opens Google Meet / Zoom with pre-generated meeting link
- Cancellation requires confirmation + reason (for CA scheduling purposes)
- Rating: 5-star tap → optional text feedback → submit

---

## Screen 46: CA Profile & Rating

**Purpose:** View full CA profile, specializations, ratings, and past reviews.

**Layout:**
```
[TopNavBar: Back, "CA Profile" title]
---
[Hero section: gradient bg]
  [Avatar: 80px circular]
  [Name: text-2xl font-bold]
  [Designation: "Chartered Accountant | ICAI Member"]
  [Registration: "CA Reg: XXXXXXXX"]
  [Overall rating: ★★★★½  (4.6/5 • 284 reviews)]

[Specialization badges row: horizontal scroll]
  [Badge: "GST Filing" | "ITR" | "Business Compliance" | "Startup Advisory"]

[Stats row]
  [MetricCard mini: "5+ years experience"]
  [MetricCard mini: "284 sessions"]
  [MetricCard mini: "96% FCR rate"]

[About section]
  [Text: CA's brief bio, 3-4 lines]

[Languages]
  [Chips: English | Hindi | Gujarati]

[Availability]
  [Weekly schedule: Mon-Fri 9AM–6PM IST]

[Reviews section]
  [Review cards: reviewer name, date, stars, comment]
  ["Show all reviews" GhostButton]

[Bottom actions]
  [PrimaryButton: "Book Video Call"]
  [SecondaryButton: "Start Chat"]
```

**Key Components:**
- Avatar, Badge (specialization), MetricCard (stats), StarRating
- Card (reviews), PrimaryButton, SecondaryButton

**Navigation:**
- Arrives: Chat List CA avatar tap, or Appointment card CA name tap
- Exits to: Video Call Booking or Chat Detail

**Indian UX note:**
- ICAI registration number builds trust — always display for CAs
- Languages spoken is important for regional users — Hindi/regional speakers prefer CAs who speak their language
- FCR (First Contact Resolution) rate shown — key quality metric
