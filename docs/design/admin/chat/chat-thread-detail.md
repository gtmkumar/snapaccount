# Chat Thread Detail (Admin)

> Phase 6F · Track F2 · Path: `/chat/{threadId}` (full-page on mobile-web; right pane on desktop) · Roles: ADMIN, CA, LOAN_OFFICER, OPS (subject to thread participation).

## 1. Purpose
Real-time conversation view between an internal user (CA/OPS) and an end-user, with attachments, typing indicator, read receipts, category routing, status transitions, and audit-quality history.

## 2. User goal
"Reply to a tax query, attach a clarification doc, mark the thread resolved, and have the user see my message and read receipt within 500ms."

## 3. Layout

Three vertical regions:
1. **Header (sticky top)**: 64px tall.
2. **Messages list (flex-1, scrollable)**.
3. **Composer (sticky bottom)**.

### 3.1 Header
| Slot | Content |
|---|---|
| Left | Back button (mobile-web only) · Avatar + user name + Phone last-4 chip · "Open profile" link |
| Center | Subject (truncate); CategoryBadge below |
| Right | StatusBadge (Open/Pending/Resolved/Escalated) · Assign-to dropdown · Overflow `⋯` menu (Archive, Export PDF, Mark spam, Print) |

Status transitions are gated:
- `Open` → `Pending user` (CA awaits user reply).
- `Open` / `Pending user` → `Resolved`.
- Any → `Escalated` (raises to higher tier; opens a comment field).
- `Resolved` → `Reopened` if user replies (auto, system message inserted).

A `StatusTimeline` (compact horizontal) is hidden by default; click status chip to peek.

### 3.2 Messages list

#### 3.2.1 Bubble alignment
- Sender = current user → right-aligned, `--brand-500` bg, `--brand-on-primary` text.
- Sender = other party → left-aligned, `--surface-sunken` bg, `--text-primary` text.
- System messages (status change, assignment) → centered chip (italic, neutral).

#### 3.2.2 Bubble structure
- Max width 70% of pane.
- Content top: text (markdown-lite: bold, italic, list, link auto-linked, emoji native).
- Content bottom: time (12px, `--text-tertiary`) + ReadReceipt indicator on own messages (•/✓/✓✓).
- Attachments below text (see §3.2.4).

#### 3.2.3 ReadReceipt
- Sent (queued offline / not yet ack): single open circle.
- Delivered (server ack): single check.
- Read (recipient has surfaced thread + scrolled past): double check `--brand-300`.
- Tooltip on hover: timestamp.

#### 3.2.4 Attachments
Reuses `AttachmentList` from Phase 6B (gst.notices). Each attachment row:
- Icon by mime, filename, size, status (uploading/scanning/ready/error).
- Click opens `PdfViewer` modal for PDFs, image-lightbox for images, downloads otherwise.
- Virus-scan badge surfaced from server.

#### 3.2.5 Day separators
Centered chip "Today", "Yesterday", "12 Apr 2026". DD/MM/YYYY format.

#### 3.2.6 Reply / Edit / Delete
- Long-press / hover row: action bar appears (Reply, Copy, Edit-own, Delete-own).
- Edited messages show "(edited)" suffix.
- Deleted = tombstone "Message deleted" (admin can see hash + audit pointer).

#### 3.2.7 Typing indicator
Below last message, animated three-dots bubble + "{{user}} is typing…". Ephemeral; disappears 3s after last typing event. Multiple typers: "Aditi and Ravi are typing…".

### 3.3 Composer
- Multiline TextArea (auto-grow up to 6 lines, scroll after).
- Placeholder: "Type a message…  Press Enter to send, Shift+Enter for new line".
- Slot icons left of input:
  - Attach (paperclip): opens file picker; multi-select; max 10 files.
  - Emoji picker.
  - "Insert canned reply" (for OPS): templates by category.
- Right: Send primary button (disabled while empty).
- Below input: small row "Sending as {{role}} — {{name}}" + character count if > 1500.

Drag-drop: dropping files onto the messages list shows a fullscreen drop zone overlay.

## 4. Real-time mechanics
- SignalR group per `threadId`.
- On mount: subscribe; on unmount: leave.
- Receive: append; if user not at bottom, show floating "↓ N new messages" pill.
- Typing: debounce local input changes 600ms → emit `typingStart`; emit `typingEnd` after 3s idle or on send.
- Optimistic send: bubble appears immediately with status "sending" (open circle); reconciles to delivered.
- Reconnect: auto-reconnect with exponential backoff (1, 2, 4, 8, 16s); banner "Reconnecting…" appears after 4s.

## 5. Empty / loading / error
- Loading: header skeleton + 5 alternating bubble skeletons + composer skeleton.
- Empty (new thread): `empty.chat.thread` illustration + "Send the first message".
- Error (load fail): banner with retry; composer disabled.
- Send error: bubble shows red retry icon; tap retries; right-click shows "Delete from queue".

## 6. Keyboard shortcuts
| Key | Action |
|---|---|
| `Enter` | Send |
| `Shift+Enter` | New line |
| `Esc` | Blur composer / close attachment dropzone |
| `cmd/ctrl + Up` | Edit own most recent message |
| `cmd/ctrl + r` | Toggle Resolved |
| `cmd/ctrl + e` | Escalate (focus reason field) |
| `j` / `k` | Navigate previous/next thread (returns to inbox if at edges) |
| `r` | Reply to focused bubble |

## 7. Accessibility
- Messages list `role="log" aria-live="polite" aria-relevant="additions"` — new messages announced.
- Each bubble `role="article"` with `aria-label="Message from {{sender}} at {{time}}"`.
- Read receipts have `aria-label` (e.g., "Read at 14:32").
- Typing indicator `aria-live="polite"` + `aria-atomic="true"` — announces start/stop.
- Composer: `aria-label="Reply"`, `aria-multiline="true"`.
- Color is never sole signal: alignment + label distinguishes self vs other; status chips include text.

## 8. Responsive
- Desktop: right pane of inbox split.
- < 1024px: full-page route.
- < 768px: composer becomes single-line that expands on focus; emoji + canned moved into "+" menu.

## 9. i18n keys
- `chat.thread.placeholder`, `chat.thread.send`, `chat.thread.sendAs`
- `chat.thread.typing.one`, `chat.thread.typing.many` ({{users}})
- `chat.thread.status.{open|pending|resolved|escalated|reopened}`
- `chat.thread.system.assigned`, `chat.thread.system.statusChanged`
- `chat.thread.attach.too_many` (max 10), `chat.thread.attach.size_exceeded`
- `chat.thread.error.send`, `chat.thread.error.load`
- `chat.thread.readReceipt.sent|delivered|read`

## 10. Privacy / audit
- All messages persist server-side; deletion is soft (tombstone visible to ADMIN).
- Export PDF generates a transcript with header (subject, participants, period) and footer "Exported by {{name}} at {{time}} — page X of Y". Reuses ReportService.
- Attachments are virus-scanned before download enabled.

## 11. Components used
ChatBubble (new), TypingIndicator (new), ReadReceipt (new), MessageInput (new), CategoryBadge (new), StatusBadge, AttachmentList, PdfViewer, FilePicker, EmojiPicker, DropdownMenu, Toast, Skeleton, EmptyState.
