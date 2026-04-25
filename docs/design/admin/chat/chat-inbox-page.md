# Chat Inbox Page (Admin)

> Phase 6F · Track F2 · Path: `/chat` · Roles: ADMIN, CA, LOAN_OFFICER, OPS.

## 1. Purpose
Operational queue for incoming threads. Users (CA / OPS) see threads filtered by category and assignment. Bulk-assign and bulk-mark-read.

## 2. User goal
"As a CA, I want to see only the threads assigned to me with category 'tax-query', sorted by oldest unread first, so I can clear my inbox."

## 3. Layout (≥ 1024px)

Two-column split:
- **Left rail (320px fixed)**: filters + thread list.
- **Right pane (flex)**: empty placeholder until a thread is opened. Once opened, see [`chat-thread-detail.md`](./chat-thread-detail.md).

Below 1024px → list-only; tapping a thread navigates to `/chat/{threadId}`.

### 3.1 Topbar (above split)
- Page title "Chat" + total unread count chip.
- Right side: "Compose" primary button (opens new-thread modal — escalate to user).
- Search input (`cmd+/` focus); searches subject + last message body.

### 3.2 Filter rail
Sticky top of left column. Sections:
- **Assignment**: `All`, `Assigned to me`, `Unassigned`, `Assigned to team`.
- **Status**: `Open`, `Pending user`, `Resolved`, `Escalated`.
- **Category**: `All`, `tax-query`, `gst-notice`, `loan`, `general`, `feature-request`, `bug`. Multi-select chips.
- **Date**: DateRangePicker (FY-aware).

Reset link top-right of rail.

### 3.3 Thread list
Each row (preview card, ~88px tall):
| Element | Detail |
|---|---|
| Avatar (40px) | User initials or photo; overlay green dot if user is online (typing-presence). |
| Header line | User name (bold) + CategoryBadge + time-ago (right). Unread = bolder. |
| Subject | Single line, ellipsis. |
| Preview | Last message body, 1 line, ellipsis. Sender name prefix ("You: " / "Aditi: "). |
| Right strip | Unread count chip + status dot + assigned-CA avatar (if any). |

States:
- Unread: thicker font, left border `--brand-500` 3px.
- Selected (right pane open): bg `--surface-sunken`.
- Hover: bg `--surface-sunken/60`.
- Typing (someone is typing in this thread): "typing…" italic in preview slot, overrides the body preview.

Sort: default = oldest unread first; toggle: newest first / oldest first / alphabetical.

### 3.4 Bulk actions
Row checkbox left edge appears on hover. Selecting one or more activates a SelectionToolbar (sticky top of list):
- Assign to: combobox of users in same role scope.
- Mark resolved.
- Mark unread / read.
- Reassign category.
- Archive.

## 4. Empty / loading / error
- Loading: 8 skeleton rows with shimmer.
- Empty (no threads at all): EmptyState `empty.chat.inbox` ("Inbox zero" — calm, congratulatory).
- Empty (filter excludes all): EmptyState "No threads match these filters" + "Clear filters" CTA.
- Error: inline error banner + retry button; recent threads (cached) still listed.

## 5. Real-time behavior
- New message in any visible thread: row pulses (200ms) and re-sorts to top of unread (if "oldest first" sort) or stays in place (if user prefers stable).
- Live-region announces "{{user}} sent a message in {{subject}}" politely (debounced 1s, max 1 announcement / 3s).
- Typing indicator: see §3.3 row override.

## 6. Keyboard shortcuts (page-specific)
- `j` / `k` next/prev thread.
- `Enter` open thread in right pane.
- `e` mark resolved.
- `r` reply (focus right pane composer).
- `a` assign (open assign popover).
- `1`–`6` toggle category filter.
- `c` compose new thread.

## 7. Accessibility
- List is `role="list"`; rows `role="listitem"` and `<a>`.
- Unread count chip has `aria-label="{{n}} unread"`.
- Selected row `aria-current="true"`.
- Filter rail `role="region" aria-label="Filters"`.
- Live region polite for new messages.

## 8. Responsive
- < 1024px: list-only; thread navigates to detail route.
- < 768px: filter rail collapses into a top bottom-sheet trigger ("Filters · 2"), category becomes horizontal scroll chip row.

## 9. i18n keys
- `chat.inbox.title`, `chat.inbox.compose`
- `chat.inbox.filter.assignment.{all|me|unassigned|team}`
- `chat.inbox.filter.status.{open|pendingUser|resolved|escalated}`
- `chat.inbox.filter.category.{taxQuery|gstNotice|loan|general|featureRequest|bug}`
- `chat.inbox.empty.zero`, `chat.inbox.empty.filtered`
- `chat.inbox.bulk.assign`, `chat.inbox.bulk.markResolved`, `chat.inbox.bulk.archive`
- `chat.thread.preview.you`, `chat.thread.preview.typing` ("typing…")
- en/hi/bn provided; ±40% length headroom.

## 10. Telemetry
- `chat.inbox.viewed { filtersActive: count }`
- `chat.thread.opened { categoryId, role }`
- `chat.bulk.action { kind, count }`

## 11. Components used
ChatInboxList, FilterRail, SelectionToolbar, CategoryBadge (new), Avatar, StatusBadge, DateRangePicker, Combobox, EmptyState (`empty.chat.inbox`), Skeleton.
