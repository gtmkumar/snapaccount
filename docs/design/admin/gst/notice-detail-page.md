# NoticeDetailPage — Admin Spec

> **Phase:** 6B (GST Completion)
> **Owner:** ui-ux-agent
> **Route:** `/admin/gst/notices/:noticeId`
> **Code target:** `src/admin/src/pages/gst/NoticeDetailPage.tsx`
> **Design system:** extends `docs/design/component-library.md`, `docs/design/tokens.json`. No new tokens.

---

## 1. Purpose

Working surface for a single GST notice: read the source PDF, draft a response (human-in-the-loop, no direct GSTN submit), attach supporting documents, track status and audit trail, and trigger a callback to the org owner if clarification is needed.

## 2. User goal

> "As a CA, I need to read the notice, gather the org's response with attachments, record what I sent, and prove who did what when."

## 3. Layout (≥1280px) — three-column working surface

```
┌─ TopBar ───────────────────────────────────────────────────────────┐
├─ Sidebar ┬─ Breadcrumb: GST › Notices › GST/24/ASMT/0931 ──────────┤
│          │ ┌─ Header strip ───────────────────────────────────┐   │
│          │ │ GST/24/ASMT/0931  ASMT-10                        │   │
│          │ │ GSTIN 27ABCDE1234F1Z5 · Acme Traders Pvt Ltd     │   │
│          │ │ [StatusBadge] [DueDateChip Critical · D-2]       │   │
│          │ │ [⚙ More ▾] [Assign ▾] [Mark ▾]    [Save Draft]   │   │
│          │ └──────────────────────────────────────────────────┘   │
│          │ ┌──────────────┬──────────────────┬─────────────────┐  │
│          │ │ PDF Viewer   │ Response Composer│ Sidebar (right) │  │
│          │ │              │                  │ ┌ Metadata ────┐ │  │
│          │ │ [Page 1 of 4]│ [Subject ………… ] │ │ Type: ASMT-10│ │  │
│          │ │ [zoom -+ fit]│ [Rich text body] │ │ Recvd: 15Apr │ │  │
│          │ │ [download ↓] │                  │ │ Due: 27 Apr  │ │  │
│          │ │              │ ── Attachments ──│ │ Officer: …   │ │  │
│          │ │   <pdf>      │ [+ Add files]    │ └──────────────┘ │  │
│          │ │              │ • invoice.pdf ✓  │ ┌ Audit Trail ─┐ │  │
│          │ │              │ • ledger.pdf  …  │ │ StatusTimeline│ │  │
│          │ │              │                  │ │ vertical      │ │  │
│          │ │              │ [Save draft]     │ │ with actor    │ │  │
│          │ │              │ [Mark Responded] │ └──────────────┘ │  │
│          │ │              │ [Request callback│                   │  │
│          │ │              │  from org →]     │ ┌ Linked items ─┐ │  │
│          │ └──────────────┴──────────────────┴ │ • Callback #12│ │  │
│          │                                     │ • Return GSTR1│ │  │
│          │                                     └──────────────┘ │  │
└──────────┴─────────────────────────────────────────────────────────┘
```

Column widths at 1440px: PDF 480px · Composer flex · Sidebar 320px. PDF column user-resizable via vertical splitter (persists in localStorage).

## 4. Responsive

| Breakpoint | Layout |
|---|---|
| ≥1280 | 3 columns as above |
| 1024–1279 | 2 columns: PDF + Composer; sidebar collapses into `[Details]` tab toggle above composer |
| 768–1023 | Tabbed single column: `[PDF] [Response] [Details]` |
| <768 | Stacked sections; PDF rendered as inline list of page thumbnails with "Open full PDF" sheet |

## 5. Components used

| Region | Component | Source |
|---|---|---|
| Header | `PageHeader` + `StatusBadge` + `DueDateChip` | existing + 6B extension |
| PDF viewer | `PdfViewer` (NEW — see §6.1) | new primitive |
| Response composer | `RichTextEditor` (existing) + form fields + `AttachmentList` (NEW) | new primitive §6.2 |
| Audit trail | `StatusTimeline` (vertical, with `actor` prop from 6A) | existing |
| Sidebar metadata | `DefinitionList` | existing |
| Callback CTA | `RequestCallbackCTA` (from Phase 6E) | existing |
| Confirm dialogs | `ConfirmDialog` | existing |
| Toasts | `Toast` | existing |

## 6. New / extended primitives

### 6.1 PdfViewer (NEW)

**Purpose:** in-page PDF reader with zoom, page nav, print, download, and text-selection.

**Props:**
| Prop | Type | Default | Description |
|---|---|---|---|
| `src` | string | required | Signed GCS URL |
| `initialPage` | number | 1 | — |
| `onPageChange` | function | — | Telemetry hook |
| `printable` | boolean | true | Show print button |
| `downloadable` | boolean | true | Show download button |
| `height` | string | `100%` | — |

**Layout:**
- Toolbar (sticky top): `[‹ Page 1/4 ›] [-  100%  +] [Fit ▾] [↻] [⤓ Download] [⎙ Print]`
- Body: PDF rendering (recommend `react-pdf` / `pdfjs-dist`; backend exposes signed URL).
- Toolbar height 44px; all buttons 44×44 hit area.

**States:** loading (skeleton page rectangle + spinner), error ("Couldn't load PDF [Retry] [Open in new tab]"), empty (no PDF attached — show illustration "No source PDF for this notice").

**Accessibility:** PDF region gets `role="document" aria-label="Notice source PDF, {{n}} pages"`. Page nav buttons keyboard accessible. Selectable text layer enabled.

### 6.2 AttachmentList (NEW)

**Purpose:** list of files attached to a response, each row showing upload progress, retry, and remove.

**Row anatomy:**
```
┌──────────────────────────────────────────────────────┐
│ [📄] invoice-mar-2026.pdf       2.1 MB    [✓] [⋯]    │
│      ━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%               │
└──────────────────────────────────────────────────────┘
```

**Per-row states:**
| State | Visual | Affordance |
|---|---|---|
| Queued | grey icon, "Queued" label | [Cancel] |
| Uploading | progress bar `brand.500`, % text | [Cancel] |
| Success | `check-circle` `success.600`, file size | [Download] [Remove] |
| Failed | `alert-triangle` `error.600`, error msg | [Retry] [Remove] |
| Virus-scan pending | spinner + "Scanning…" | disabled |
| Virus-scan failed | `error` row + banner | [Remove] only |

**Rules:**
- Accept: `application/pdf, image/jpeg, image/png` — max 10MB per file, max 10 files per response.
- File names truncated middle: `invoice-march-…26.pdf`.
- Retry uses same upload session id; exponential backoff handled by client lib.
- All rows in `<ul role="list">`; row 44px min height.

## 7. Response composer

### 7.1 Fields

| Field | Component | Required | Notes |
|---|---|---|---|
| Subject | `TextInput` | yes | Default: "Re: {{noticeNumber}}" |
| Body | `RichTextEditor` | yes | Markdown-backed; toolbar = bold, italic, lists, link, undo/redo. No raw HTML paste. |
| Submission channel | `Select` | yes | `Filed on GSTN portal manually`, `Sent via email to officer`, `Other (specify)` |
| Reference / acknowledgement | `TextInput` | conditional | Required if channel ≠ "Other"; placeholder per channel |
| Date sent | `DatePicker` | yes (when marking Responded) | Defaults to today |
| Attachments | `AttachmentList` | optional | At least one recommended — soft warning, not blocker |

### 7.2 Auto-save

- Body and subject auto-save as draft every 5s after last keystroke (debounced).
- Footer caption: "Draft saved at 14:32 IST" with `aria-live="polite"`.
- On network error: pause + banner "Draft not saved — [Retry]". Local copy preserved in `localStorage` keyed by `noticeId`.

### 7.3 Action footer (sticky)

```
[Cancel]                       [Save draft]  [Mark as Responded ▸]
```

`Mark as Responded` opens `ConfirmDialog`:
- Title: "Mark notice as Responded?"
- Body summary: who, when, channel, attachment count.
- Buttons: `[Back]` `[Confirm]`.
- Result: status → `RESPONDED`, audit event written, success toast "Notice marked as Responded", page refreshes audit trail.

## 8. Status transitions (state machine)

```
RECEIVED ──▶ UNDER_REVIEW ──▶ RESPONDED ──▶ CLOSED
    │              │              │
    └──── (skip) ──┘              └── officer outcome (manual)
```

| Action | Allowed from | New status | Required fields |
|---|---|---|---|
| Assign to CA | RECEIVED, UNDER_REVIEW | unchanged + `assignee` set | CA picked |
| Mark Under Review | RECEIVED | UNDER_REVIEW | none |
| Mark Responded | UNDER_REVIEW (or RECEIVED with confirmation) | RESPONDED | composer §7.1 required fields |
| Reopen | RESPONDED | UNDER_REVIEW | reason (textarea) |
| Mark Closed | RESPONDED | CLOSED | outcome enum + optional note |

Disallowed transitions: button disabled with tooltip explaining why ("Notice must be Under Review first").

## 9. Deadline countdown (header pill)

`DueDateChip` (see list page §6.1) re-rendered every minute via interval. When `< 24h`: chip pulses 1× every 4s and adds `aria-live="polite"` updates at the hour boundary ("Due in 3 hours"). On overdue, chip swaps to `error` variant; sticky header gains a `slate.50` → `error.50` background tint to make the entire page state visually unmistakable.

## 10. Audit trail

`StatusTimeline` vertical, `actor` prop populated. Event types rendered:

| Event | Icon | Sample line |
|---|---|---|
| `notice.received` | inbox | "Notice received from GSTN portal" |
| `notice.uploaded` | upload | "{{actor}} uploaded the notice PDF" |
| `notice.assigned` | user-plus | "{{actor}} assigned to {{assignee}}" |
| `notice.status.changed` | flag | "{{actor}} changed status: Received → Under Review" |
| `notice.draft.saved` | edit | "Draft auto-saved" — collapsed by default; expandable group |
| `notice.attachment.added` | paperclip | "{{actor}} attached {{filename}}" |
| `notice.responded` | send | "{{actor}} marked as Responded via {{channel}}" |
| `notice.callback.requested` | phone-call | "{{actor}} requested a callback from org owner" |
| `notice.closed` | check-circle | "{{actor}} closed: {{outcome}}" |

Drafts collapse into "12 draft saves" pill expandable on click. All other events always visible. Timeline accepts a "Show only major events" filter chip.

## 11. Sidebar — Linked items

- **Callback** (if §10 callback was requested): card linking to `/admin/callbacks/:id` with current `StatusBadge`.
- **Related GST return**: if `notice.return_period` set, show `Return GSTR-1 / Mar 2026 [↗]` linking to `GstReturnReviewPage`.
- **Org page**: link to org profile (Phase 6F).

## 12. States

- **Loading:** skeleton matching layout; PDF column shows page outline; composer shows 4 grey bars; sidebar shows 6 grey bars.
- **Not found:** full-page `EmptyState` with `file-x` icon + `[Back to notices]`.
- **Permission denied:** `lock` empty state, no edit affordances.
- **Stale (someone else changed status while editing):** banner `warning`: "{{actor}} updated this notice {{relativeTime}}. [Reload]". Composer is locked until reload.

## 13. Accessibility

- Three columns each in their own `<section aria-labelledby>` so screen readers can jump.
- PDF viewer: `role="document"`, page change announced via `aria-live="polite"`.
- Composer: `<form>` with submit handler; `aria-busy` on save.
- Each attachment row has `aria-label` summarizing name + status + size.
- Confirm dialog: focus trapped, Esc cancels, returns focus to invoking button.
- Color is never the only signal: status uses badge label, due-date chip uses text countdown, attachment success uses both color and check icon.
- All controls ≥ 44 × 44 pt touch target.

## 14. i18n keys

```
admin.gst.notice.detail.title
admin.gst.notice.detail.breadcrumb
admin.gst.notice.detail.actions.assign
admin.gst.notice.detail.actions.markUnderReview
admin.gst.notice.detail.actions.markResponded
admin.gst.notice.detail.actions.reopen
admin.gst.notice.detail.actions.close
admin.gst.notice.detail.actions.requestCallback
admin.gst.notice.detail.composer.subject
admin.gst.notice.detail.composer.body
admin.gst.notice.detail.composer.channel
admin.gst.notice.detail.composer.channel.gstn
admin.gst.notice.detail.composer.channel.email
admin.gst.notice.detail.composer.channel.other
admin.gst.notice.detail.composer.reference
admin.gst.notice.detail.composer.dateSent
admin.gst.notice.detail.composer.attachments
admin.gst.notice.detail.composer.attach.add
admin.gst.notice.detail.composer.attach.retry
admin.gst.notice.detail.composer.attach.remove
admin.gst.notice.detail.composer.draft.saved
admin.gst.notice.detail.composer.draft.error
admin.gst.notice.detail.confirm.respond.title
admin.gst.notice.detail.confirm.respond.body
admin.gst.notice.detail.confirm.respond.confirm
admin.gst.notice.detail.audit.heading
admin.gst.notice.detail.audit.collapseDrafts
admin.gst.notice.detail.linked.callback
admin.gst.notice.detail.linked.return
admin.gst.notice.detail.linked.org
admin.gst.notice.detail.toast.responded
admin.gst.notice.detail.toast.assigned
admin.gst.notice.detail.toast.statusChanged
```

`en`, `hi`, `bn` shipped together. RichTextEditor toolbar tooltips localized.

## 15. Telemetry

- `gst.notice.detail.viewed` { noticeId, status, daysUntilDue }
- `gst.notice.detail.pdf_paged` { noticeId, page }
- `gst.notice.detail.attachment_uploaded` { sizeBytes, mime }
- `gst.notice.detail.attachment_failed` { reason }
- `gst.notice.detail.draft_saved` { length }
- `gst.notice.detail.responded` { channel, attachmentCount, secondsToRespond }
- `gst.notice.detail.callback_requested`

## 16. Handoff notes

- New primitives required for frontend-dev: `PdfViewer`, `AttachmentList`, `DueDateChip`, `SelectionToolbar`.
- Backend: signed URL expiry on PDFs ≥ 10 minutes (PdfViewer caches first render). Rotate on refresh.
- Virus-scan integration assumed (matches DocumentService pattern); if not yet wired, frontend renders state but treats every upload as `Success` after 200 OK.
