# Admin — ItrPage (4-tab refresh)

> Phase: 6D | Owner: ui-ux-agent | Date: 2026-04-25
> Owns: `src/admin/src/pages/ItrPage.tsx` (frontend-dev implementation target).

---

## Purpose

Top-level CA workspace for ITR. Replaces the placeholder `ItrPage` with a 4-tab structure mirroring the GST module's tabbed pattern (Phase 6B) for CA familiarity.

## CA Goal

"One landing page that shows me what's waiting for my review, lets me drill into a computation, lists what's ready to file, and surfaces tax notices."

---

## Page-level shell

```
┌─ AdminLayout (sidebar + header) ──────────────────────────────────────┐
│  PageHeader  "ITR — Income Tax"   [filter: AY dropdown] [refresh]     │
│  ────────────────────────────────────────────────────────────────────│
│  Tabs  [Verification queue (4)]  [CA computation panel]  [Filing queue (12)] [Notice tracker (3)]│
│  ────────────────────────────────────────────────────────────────────│
│  Active tab content                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

- Sticky tabs at `top-16`.
- Numeric badge per tab counts pending items.
- AY dropdown applies global filter to all tabs (defaults to current AY).

---

## Tab 1 — Verification Queue

Filings submitted by users awaiting CA review.

```
┌──────────────────────────────────────────────────────────────────────┐
│  KPI strip (4 cards)                                                 │
│   [Awaiting review: 4] [SLA breached: 1] [Avg time to review: 2.3 d] │
│   [Total filings AY 2026-27: 47]                                     │
│  ────────────────────────────────────────────────────────────────────│
│  DataTable                                                           │
│   columns: User | PAN | ITR form | Submitted | SLA | Last touched | Action │
│   row tap → drill into ItrFilingDetailPage                           │
│   row right cell: button "Open" or "Claim" (if unassigned)           │
└──────────────────────────────────────────────────────────────────────┘
```

- **SLA column** — pill (`Badge` variant): green (< 24h), amber (24–48h), red (> 48h breached).
- Bulk actions: assign-to-CA, reassign.
- Filters: AY, ITR form, regime, assignee.

---

## Tab 2 — CA Computation Panel

Embedded version of the dual-pane editor (full spec in `ca-tax-computation-panel.md`). When no filing is selected, this tab shows a "Pick a filing from the verification queue" empty state with quick-pick chips of the most urgent 3 cases.

---

## Tab 3 — Filing Queue

CA-approved filings ready to be submitted to IT portal (currently manual upload of ITR-V).

```
DataTable
 columns: User | ITR form | AY | Tax / Refund | Approved on | Filing status | Action
 status badges: APPROVED / FILED / E_VERIFIED / REFUND_TRACKED
 actions: Mark filed (opens modal to upload ITR-V from portal) | Mark e-verified | View
```

The "Mark filed" modal:
- File picker (PDF) for ITR-V.
- Required fields: Acknowledgment number, Filed on date.
- Submit → `POST /itr/filings/{id}/mark-filed`.

---

## Tab 4 — Notice Tracker

Mirror of GST notice tracker. List of all incoming IT notices for users in the CA's portfolio.

```
DataTable
 columns: User | Notice section | Demand/Refund | Severity | Received | Deadline | Status | Action
 row tap → admin notice detail page (parallel to gst notice detail)
```

- Severity pills: red (156, 143(2)), amber (139(9), 245), blue (143(1)).
- Filter: severity, section, status.
- Bulk: assign to junior CA.

---

## Empty states

- **Verification queue empty** — Illustration + "Inbox zero! No filings waiting for review."
- **Filing queue empty** — "No filings ready to file. Approve filings in the verification queue first."
- **Notice tracker empty** — "No notices yet for AY {ay}."

## Loading states

- Skeleton table rows (8 rows) per tab.
- KPI cards shimmer.

## Error states

- Inline error banner with retry; tabs stay clickable.

---

## i18n keys

```
itr.admin.page.title
itr.admin.tabs.{verificationQueue|computationPanel|filingQueue|noticeTracker}
itr.admin.kpi.awaitingReview / .slaBreached / .avgTimeToReview / .totalFilings
itr.admin.verification.column.{user|pan|form|submitted|sla|lastTouched|action}
itr.admin.filing.column.{taxOrRefund|approvedOn|filingStatus}
itr.admin.filing.markFiledModal.heading / .ackPlaceholder / .filedOnPlaceholder / .submit
itr.admin.notice.column.{section|severity|demand|deadline}
itr.admin.empty.{verification|filing|notice}
```

---

## Accessibility

- Tabs are real `<Tabs>` (Radix or shadcn pattern) with arrow-key navigation.
- DataTable rows are keyboard-traversable.
- Severity pills paired with icon + text.
- AY dropdown has `aria-label`.

---

## Responsive

- Desktop primary surface; min width 1024px.
- Tablet (768–1024px): KPI strip wraps to 2x2; DataTable horizontal scroll.
- Mobile: not a target — admin module is desktop-first per existing convention.
