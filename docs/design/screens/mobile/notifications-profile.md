# Mobile Screens: Notifications & Profile (Screens 47–55)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 47: Notification Center

**Purpose:** View all in-app notifications with read/unread state.

**Layout:**
```
[TopNavBar: "Notifications" large title, "Mark all read" right — GhostButton if any unread]
---
[Filter tabs: All | GST | ITR | Documents | Loans | Chat | System]

[Notification list — grouped by date]

[Date group header: "Today" | "Yesterday" | "Apr 2, 2025"]

[NotificationItem]
  [Left: Category icon in colored circle bg — 40px]
    [GST: purple, ITR: teal, Docs: blue, Chat: green, System: grey]
  [Content:]
    [Title: text-base font-semibold (bold if unread)]
    [Body: text-sm text-neutral-500 — 2 lines max]
    [Timestamp: text-xs text-neutral-400 — relative]
  [Right: Unread dot (brand-500 6px) if unread]
  [Swipe left: "Delete" action]
  [Tap: Mark as read + navigate to relevant screen]

[Notification types and navigation targets:]
  [GST filing deadline approaching → GST Dashboard]
  [GSTR-3B filed successfully → Filing Confirmation]
  [ITC mismatch detected → GST ITC screen]
  [Document processed → Document Detail]
  [ITR e-verification reminder → E-Verification Screen]
  [Chat message received → Chat Detail]
  [Loan status update → Loan Status Tracking]
  [New document uploaded by CA → Document Detail]

[Empty state: "You're all caught up! No new notifications."]
[Bell illustration + empty state copy]
```

**Key Components:**
- FlatList (notifications), Badge (unread dot), FilterTabs
- CategoryIcon (colored), EmptyState

**Navigation:**
- Arrives: TopNavBar bell icon from Home Screen
- Exits to: Relevant screen based on notification type tap

**Key Interactions:**
- Pull-to-refresh: Fetches latest notifications
- Tap notification: Marks read + deep links to context
- Swipe left: Delete with undo toast "Notification deleted. UNDO"
- "Mark all read" clears all unread dots
- Long press: Context menu — Mark read/unread, Delete

---

## Screen 48: Notification Preferences

**Purpose:** Configure per-channel and per-event notification preferences.

**Layout:**
```
[TopNavBar: Back, "Notification Preferences" title]
---
[Section: "Notification Channels"]
  [Row: Push Notifications]
    [Label: "Push Notifications" + description: "Alerts on your phone"]
    [Toggle: ON/OFF — opens system settings if push not granted]

  [Row: SMS]
    [Label: "SMS" + description: "Text messages to +91 XXXXX"]
    [Toggle: ON/OFF]

  [Row: Email]
    [Label: "Email" + description: "Alerts to email@example.com"]
    [Toggle: ON/OFF]

  [Row: WhatsApp — shown only if enabled by admin]
    [Label: "WhatsApp" + description: "Messages to +91 XXXXX"]
    [Toggle: ON/OFF]

[Section: "GST Reminders"]
  [Row: Filing deadline alerts | Toggle]
  [Row: 7 days before due date | Toggle]
  [Row: 3 days before due date | Toggle]
  [Row: Day of deadline | Toggle]
  [Row: ITC mismatch alerts | Toggle]
  [Row: Late fee warnings | Toggle]

[Section: "ITR Reminders"]
  [Row: E-verification reminders | Toggle]
  [Row: Document checklist nudges | Toggle]
  [Row: Refund status updates | Toggle]
  [Row: Notice alerts | Toggle]

[Section: "Document Updates"]
  [Row: Document processed | Toggle]
  [Row: OCR review needed | Toggle]

[Section: "Loans & Chat"]
  [Row: Loan status updates | Toggle]
  [Row: Chat messages | Toggle]
  [Row: Appointment reminders | Toggle]

[Section: "Marketing"]
  [Row: Product updates and tips | Toggle — OFF by default]
  [Row: Offers and promotions | Toggle — OFF by default]
```

**Key Components:**
- Toggle (per row), Card (section wrapper), TopNavBar

**Navigation:**
- Arrives: Profile Screen → Notification Preferences
- Exits to: Back to Profile

**Key Interactions:**
- Toggling push to ON while permission denied: Opens system settings prompt
- All GST deadline reminders recommended ON — show brief warning if turned off

---

## Screen 49: Profile Screen

**Purpose:** View and manage user profile, quick access to settings.

**Layout:**
```
[TopNavBar: "Profile" large title, Edit icon right]
---
[Profile header card: gradient bg]
  [Avatar: 64px circular with edit overlay]
  [Name: text-xl font-bold]
  [Business name / Employee]
  [PAN: XXXXX9999X (masked partially)]
  [Member since: "SnapAccount member since March 2024"]
  [Subscription badge: "Pro Plan" or "Free"]

[Section: "Business / Personal Details"]
  [Row: Business Name | value | chevron → Edit]
  [Row: GSTIN | 15-char GSTIN | chevron]
  [Row: Phone | +91 XXXXXXXXXX | chevron → Device Mgmt]
  [Row: Email | email@example.com | chevron]

[Section: "Account"]
  [Row: Language → Language Settings]
  [Row: Notification Preferences → screen 48]
  [Row: Subscription & Billing → screen 53]
  [Row: Device Management → screen 51]

[Section: "Support"]
  [Row: Help & Support → screen 54]
  [Row: Chat with Expert → Chat Screen]
  [Row: Rate the App → App Store rating]

[Section: "Legal"]
  [Row: Terms of Service]
  [Row: Privacy Policy]
  [Row: About → screen 55]

[Section: "Danger Zone"]
  [Row: Deactivate Account — warning orange]
  [Row: Delete Account (Right to Erasure) — error red]
  [Both require confirmation dialogs]

[Bottom: "Sign Out" GhostButton — brand-600 text, no icon]
```

**Key Components:**
- Avatar, Card (sections), Row items with chevron, Toggle, Badge (subscription)
- PrimaryButton (edit), GhostButton (sign out)

**Navigation:**
- Arrives: BottomTabBar → More → Profile
- Exits to: All linked sub-screens

---

## Screen 50: Business Details Edit

**Purpose:** Edit business profile information.

**Layout:**
```
[TopNavBar: Back/Cancel, "Edit Business Details" title, Save right]
---
[Form fields — all editable]
  [TextInput: Business Name]
  [TextInput: GSTIN — with re-verify button if changed]
  [Select: Business Type]
  [Select: Industry]
  [TextInput: Address Line 1]
  [TextInput: Address Line 2]
  [Select: State]
  [TextInput: PIN Code]
  [TextInput: Annual Turnover (approx)]
  [TextInput: Website (optional)]
```

**Key Components:** TextInput, Select, PrimaryButton (save), GhostButton (cancel)

**Navigation:**
- Arrives: Profile screen → Edit icon or Business Details row
- Exits to: Profile Screen (on save)

**Key Interactions:**
- GSTIN change: Triggers re-verification API call, shows pending badge
- Save: Validates all fields, shows toast on success

---

## Screen 51: Device Management

**Purpose:** View and manage logged-in devices (max 2 active devices).

**Layout:**
```
[TopNavBar: Back, "Devices" title]
---
[Current device card — highlighted]
  [Device icon: phone]
  [Device name: "Redmi Note 12 (This device)"]
  [Last active: "Active now"]
  [IP: partial masked]
  [Location: "Mumbai, India"]
  [No revoke button for current device]

[Other devices list]
  [Device card: "Samsung Galaxy S23"]
  [Last active: "2 days ago"]
  [Location: "Delhi, India"]
  [SecondaryButton: "Remove Device" — confirmation required]

[Max devices notice]
  [Info: "You can have up to 2 active devices. Remove a device to log in on another."]

[All devices log out]
  [GhostButton: "Log out of all devices" — nuclear option with confirmation]
```

**Key Components:** Card, SecondaryButton, GhostButton, AlertBanner

**Navigation:** Profile Screen → Device Management

**Indian UX note:**
- Max 2 devices is a security feature — explain why, not just enforce it
- Show device info clearly so user can identify legitimate vs suspicious devices

---

## Screen 52: Language Settings

**Purpose:** Change the app interface language.

**Layout:**
Same as Screen 6 (Language Selection) but with current language pre-selected.

```
[TopNavBar: Back, "Language" title, Save right]
---
[Current: "English (Current)" — checked]
[Language grid — same as Screen 6]
---
[Note: "Changing language will restart the app to apply changes."]
[PrimaryButton: "Save Language"]
```

---

## Screen 53: Subscription & Billing

**Purpose:** View current plan, upgrade options, billing history.

**Layout:**
```
[TopNavBar: Back, "Subscription" title]
---
[Current plan card: brand-gradient]
  [Plan name: "Pro Plan" text-xl font-bold white]
  [Price: "₹999/month" or "₹9,999/year"]
  [Renewal date: "Renews May 1, 2025"]
  [Features list: bullet points]
  [SecondaryButton: "Manage Plan" (white outline)]

[Feature comparison section]
  [Free | Basic | Pro | Enterprise cards]
  [Feature rows with tick/cross per plan]
  [Current plan highlighted]
  [PrimaryButton: "Upgrade to Pro" (if not on Pro)]

[Payment Method]
  [Card: "Razorpay • Visa ****1234"]
  [GhostButton: "Update payment method"]

[Billing History]
  [Invoice row per payment: Date | Amount | Plan | Download invoice]
```

**Key Components:**
- Card, Badge, PrimaryButton, SecondaryButton, AmountDisplay
- ProgressBar (usage meter if applicable)

**Navigation:** Profile → Subscription & Billing

---

## Screen 54: Help & Support

**Purpose:** Access help resources and support channels.

**Layout:**
```
[TopNavBar: Back, "Help & Support" title]
---
[Search bar: "Search for help..." — searches FAQs]

[Quick help cards: 2-column grid]
  [Card: "How to upload a document?"]
  [Card: "How to file GSTR-3B?"]
  [Card: "What is Form 16?"]
  [Card: "How to e-verify ITR?"]

[Contact support section]
  [Row: Chat with Support — opens chat screen]
  [Row: Call Support — tel: link (business hours shown)]
  [Row: Email Support — opens email client]
  [Row: WhatsApp Support — if enabled]

[FAQ accordion sections]
  [GST FAQs / ITR FAQs / Documents FAQs / Loan FAQs]

[Report a bug]
  [GhostButton: "Report Issue" — opens feedback form]
```

---

## Screen 55: About / Legal

**Purpose:** App information, version, legal documents.

**Layout:**
```
[TopNavBar: Back, "About" title]
---
[App logo + "SnapAccount" name]
[Version: "v1.0.0 (Build 100)"]
[Tagline: "Technology + Human Service for Indian SMEs"]

[Links list]
  [Row: Terms of Service → WebView]
  [Row: Privacy Policy → WebView]
  [Row: DPDP Act Rights → WebView — "Your data rights under DPDP Act 2023"]
  [Row: Licenses → WebView]
  [Row: Cookie Policy → WebView]

[Data section]
  [Row: Request Data Export — triggers export job, email delivery]
  [Row: Request Account Deletion → Confirmation flow with reason selection]

[Social links]
  [LinkedIn | Twitter/X | Instagram icons]

[Footer: "SnapAccount © 2025. Made with ❤️ in India."]
[GST Reg / Company CIN: displayed for legal compliance]
```

**Key Components:** Card, GhostButton, WebView (for legal docs)

**Indian UX / Legal notes:**
- DPDP Act 2023 rights must be clearly listed — right to access, correct, erase data
- Data export request and account deletion must be functional (not just displayed)
- Company registration details (CIN/GST) required under Indian IT Act for apps collecting user data
