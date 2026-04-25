# Mobile — ItrNoticeInboxScreen + ItrNoticeDetailScreen

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25
> Mirrors GST notice pattern (Phase 6B) for consistency.

---

## Purpose

Notices from the Income Tax department (intimations u/s 143(1), defective return notice u/s 139(9), demand u/s 156, scrutiny u/s 143(2), etc.) flow to the user via a parallel inbox-and-detail pattern shared with GST. CA-assisted reply is the MVP path.

## User Goal

"Tell me when the IT department sends me anything, what it means, and what I need to do."

---

# Screen 1 — ItrNoticeInboxScreen

## Layout

```
┌─ Header  "Notices · ITR"  [filter icon] ──────────┐
│  TabBar  [All] [Unread] [Action needed] [Closed]   │
│  ─────────────────────────────────────────────── │
│  FlatList of NoticeRow                            │
│   NoticeRow                                       │
│    icon (severity color)                          │
│    title  "Intimation u/s 143(1)"                 │
│    sub    "AY 2025-26 · Received 12 Apr 2026"     │
│    chip   Badge variant=warning "Action needed"   │
│    chevron                                        │
│   …                                               │
│  EmptyState (no notices)                          │
│   icon mailbox  "No notices yet."                 │
└───────────────────────────────────────────────────┘
```

### Tabs

- **All** — every notice for the user.
- **Unread** — unviewed.
- **Action needed** — notices with response deadline > today and not yet responded.
- **Closed** — responded or auto-closed.

### NoticeRow

- 80pt height.
- Severity icon: `red exclamation` (demand/scrutiny), `amber warning` (defective), `blue info` (intimation 143(1) refund/no-demand).
- Tap → `ItrNoticeDetailScreen`.

---

# Screen 2 — ItrNoticeDetailScreen

## Layout

```
┌─ Header  [back]  "Notice u/s 143(1)"  [share] ────┐
│  HeaderCard                                       │
│   severity row + "AY 2025-26 · Demand of ₹4,200"  │
│   StatusBadge  "Action needed by 11 May"          │
│   CountdownPill "9 days left"                     │
│  ─────────────────────────────────────────────── │
│  Section "Summary (in plain language)"            │
│   "The IT department has assessed your filing.    │
│    They've raised a demand of ₹4,200 because of   │
│    a mismatch in TDS reported. You need to either │
│    pay or respond with a clarification."          │
│  Section "Notice document"                        │
│   PdfPreviewCard  open → fullscreen PDF viewer    │
│  Section "Conversation with your CA"              │
│   ChatThread (existing component)                 │
│   composer at bottom                              │
│  Section "Actions"                                │
│   [Pay demand]   primary cta                      │
│   [Submit reply] secondary cta                    │
│   [Mark as resolved] ghost cta                    │
└───────────────────────────────────────────────────┘
```

---

## Notice categories handled

| Section | Category | Severity | Default plain-language explainer |
|---------|----------|----------|----------------------------------|
| 143(1) | Intimation | info / warning if demand | "IT has assessed your return." |
| 139(9) | Defective return | warning | "Some details in your filing are incomplete or inconsistent." |
| 156 | Demand | error | "IT is asking you to pay an outstanding amount." |
| 143(2) | Scrutiny | error | "Your return has been picked for scrutiny — your CA will guide you." |
| 245 | Adjustment | warning | "IT proposes to adjust an outstanding demand against your refund." |
| Other | — | info | Generic placeholder |

Backend supplies `category` so the UI can pick severity + explainer template. Plain-language strings live in i18n.

---

## Actions

- **Pay demand** — opens Razorpay flow (existing payment module). On success → notice status flips to `RESPONDED` and reply auto-posts in chat: "User paid ₹X via Razorpay on {date}".
- **Submit reply** — opens `ReplySheet`: free-text + optional doc attachments. Submits → backend marks `RESPONDED` and pushes to CA.
- **Mark as resolved** — confirmation modal "Are you sure you've resolved this notice?" → if yes, status `CLOSED`, conversation archived.

---

## States

- **Inbox loading** — Skeleton rows.
- **Inbox empty** — Empty state.
- **Detail loading** — Skeleton header + PDF placeholder.
- **Detail PDF unavailable** — Card shows "Original notice PDF unavailable. Contact your CA." with chat shortcut.
- **Detail action submitted** — Cta button shows spinner; on success, action area collapses with success card "Reply submitted on {date}".
- **Overdue notice** — CountdownPill switches to red, status badge "Overdue".

---

## i18n keys

```
itr.notice.inbox.title / .filter / .tabs.{all|unread|actionNeeded|closed}
itr.notice.inbox.empty.heading / .body
itr.notice.row.actionNeededBadge / .closedBadge / .receivedOn
itr.notice.detail.title  ("Notice u/s {section}")
itr.notice.detail.headerSummary
itr.notice.detail.statusBadge.{actionNeeded|responded|closed|overdue}
itr.notice.detail.countdown.{daysLeft|overdue}
itr.notice.detail.section.{summary|document|conversation|actions}
itr.notice.detail.cta.payDemand / .submitReply / .markResolved
itr.notice.replySheet.placeholder / .submit / .attach
itr.notice.markResolved.confirm
itr.notice.category.143_1 / .139_9 / .156 / .143_2 / .245 / .other
itr.notice.explainer.{categoryKey}
```

---

## Deep-link

`snapaccount://itr/notices/{noticeId}` opens detail screen directly. Push notification "New ITR notice received" tapped → deep-link.

---

## Accessibility

- Severity color paired with icon + label.
- ChatThread reuses Phase 6E patterns (existing component).
- PdfPreviewCard wrapped with `accessibilityLabel="Notice document, tap to open full screen"`.
- CountdownPill announced with units ("9 days left, due 11 May 2026").
