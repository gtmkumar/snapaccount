# GstReturnReviewPage — Phase 6A Design Deltas

> **Scope:** Phase 6A confirmation + minor additions to the existing admin GST return review flow.
> **Existing spec:** `docs/design/screens/web-admin/gst-operations.md` (GstReturnReviewPage section)
> **Existing code reference:** `src/admin/src/pages/gst/GstReturnReviewPage.tsx`
> **Design system:** extends — does not replace — tokens in `docs/design/tokens.json` and components in `docs/design/component-library.md`.

---

## 1. Gap check against Phase 6A exit criteria

Phase 6A requires the admin page to (a) capture the GSTN-returned **ARN** after filing and (b) expose an **audit-trail** panel of every state transition. The existing `GstReturnReviewPage` design covers the return grid, line-item viewer, ITC reconciliation panel, and approve/reject CTAs, but it does **not** call out:

| Gap | Severity | Action |
|---|---|---|
| ARN capture field + persistence state (saving / saved / conflict) | Must-add | New section in right rail, see §2 |
| Audit-trail panel (who approved / rejected / amended, when, note) | Must-add | New collapsible panel below ITC reconciliation, see §3 |
| "Revision needed" note composer visible to user | Nice-to-have | Already covered by existing reject-modal — no change |
| Real-time sync indicator when OCR-derived numbers refresh | Nice-to-have | Use existing `Toast` info variant — no new design |

Everything else from the existing spec remains as-is. **No screen rewrite required.**

---

## 2. ARN Capture Field — additive spec

### 2.1 Placement
Right rail, directly under the "Filing Status" `StatusBadge` block, above the "Actions" button group. Only visible when `status ∈ {FILED, REVISION_NEEDED}`.

### 2.2 Layout

```
┌─ Right Rail (320px on desktop, full-width below 1024) ──┐
│  Filing Status                                           │
│  [StatusBadge: FILED]                                    │
│                                                          │
│  ── ARN (Acknowledgement Ref. No.) ─────────────────┐   │
│  ┌──────────────────────────────────────────────┐   │   │
│  │ AA270320250000123                            │   │   │
│  └──────────────────────────────────────────────┘   │   │
│  Returned by GSTN at 14:32 IST on 18 Apr 2026       │   │
│  [Copy] [Open GSTN portal ↗]                        │   │
│  ──────────────────────────────────────────────────┘   │
│                                                          │
│  Actions …                                               │
└──────────────────────────────────────────────────────────┘
```

### 2.3 States
| State | Visual | Notes |
|---|---|---|
| Empty (pre-filing) | Section hidden | Gate on status |
| Capturing | `TextInput` editable with placeholder `AA270000000000000`, monospace, uppercase, 15 chars | Admin/ops role only |
| Saving | Input disabled + `Spinner` inline, `Toast` info "Saving ARN…" | TanStack mutation pending |
| Saved | Static label with monospace font, copy affordance, neutral-50 background | Read-only after save |
| Error | `AlertBanner` type=error inline above input with retry | Blocks further action |
| Conflict (ARN already set) | `AlertBanner` type=warning: "ARN was set by <user> at <time>. Replace?" | Requires confirm modal |

### 2.4 Tokens / Components
- Field container uses `color.surface.subtle` background with `radius.lg`, `spacing.4` padding.
- ARN text uses `typography.fontFamily.mono`, `fontSize.base`, `fontWeight.semibold`.
- Copy button: existing `IconButton` with `clipboard` icon, 44×44 hit target.
- No new tokens required.

### 2.5 Validation
- Regex: `^[A-Z]{2}\d{2}[A-Z0-9]{12}$` (ARN is 2 alpha + 2 digits + 12 alphanumeric = 16 chars, aligned with GSTN spec; adjust if backend defines stricter).
- Auto-uppercase on blur.
- On validation fail: inline error text in `color.error.600`, `fontSize.xs`.

### 2.6 i18n keys
```
admin.gst.return.arn.label
admin.gst.return.arn.placeholder
admin.gst.return.arn.savedAt
admin.gst.return.arn.save
admin.gst.return.arn.copy
admin.gst.return.arn.copied
admin.gst.return.arn.openPortal
admin.gst.return.arn.invalid
admin.gst.return.arn.conflict
```

### 2.7 Accessibility
- `<label for="arn-input">` association.
- `aria-describedby` points to helper text (timestamp) and error when present.
- `aria-live="polite"` on the "Saving / Saved" state region.
- Copy button: `aria-label="Copy ARN to clipboard"`; shows "Copied" via `aria-live="polite"` announcement.
- Focus order: input → Save → Copy → Open portal.

---

## 3. Audit-Trail Panel — additive spec

### 3.1 Placement
Collapsible panel below the ITC Reconciliation block, above the fixed action footer. Default collapsed on ≤1024px, expanded on ≥1280px. Remembers last state in `localStorage`.

### 3.2 Layout

```
┌─ Audit Trail (12 events) ─────────────────── [▾] ──┐
│                                                     │
│  ● 18 Apr 2026 · 14:32 IST                          │
│    FILED by SnapAccount System                      │
│    ARN received: AA270320250000123                  │
│    Previous status: PENDING_APPROVAL                │
│  │                                                  │
│  ● 18 Apr 2026 · 14:28 IST                          │
│    APPROVED by ca-kumar@snapaccount.in              │
│    Note: "ITC reconciled, ready to file"            │
│  │                                                  │
│  ● 17 Apr 2026 · 19:10 IST                          │
│    AMENDED by ops-priya@snapaccount.in              │
│    3 line items corrected · diff link               │
│  │                                                  │
│  ● ... (Load more)                                  │
└─────────────────────────────────────────────────────┘
```

### 3.3 Row anatomy
- **Timeline marker dot**: `color.module.gst` for GST events, `color.success.500` for APPROVED, `color.warning.500` for REVISION_NEEDED, `color.error.500` for REJECTED; 10×10 circle with 2px inner ring.
- **Connector line**: `color.neutral.200`, 2px, between dots.
- **Timestamp**: `fontSize.xs`, `color.neutral.500`, rendered in IST with `DD MMM YYYY · HH:mm IST` (matches Indian market convention established in memory).
- **Actor**: email or display name; "System" for automated events; bold.
- **Action verb**: `fontWeight.semibold`, `color.neutral.900`.
- **Detail line**: `fontSize.sm`, `color.neutral.600`; truncate with tooltip on overflow.
- **Diff link** (on AMENDED): opens a side-sheet showing before/after line items (no new design; reuse existing `Modal` component with 640px width).

### 3.4 States
| State | Visual |
|---|---|
| Loading | 3× `SkeletonText` rows with alternating widths |
| Empty | `EmptyState` variant: "No audit events yet. Events will appear as the return moves through its lifecycle." — `color.neutral.400` illustration |
| Error | Inline `ErrorState` with retry |
| Paginated (>20 events) | "Load more" `GhostButton` at bottom; progressive loading |

### 3.5 Tokens / Components
- Container: `Card` component with `shadow.xs`, `radius.lg`, `spacing.5` padding.
- Reuses existing `StatusTimeline` component (§6.3 in component library) with minor extension:
  - **New prop (add to `StatusTimeline`):** `actor?: { name, avatarUrl? }` — renders `Avatar` size=xs inline before the actor name.
  - Document as "Phase 6A" addition to `StatusTimeline` in `component-library.md` (non-breaking prop).

### 3.6 i18n keys
```
admin.gst.return.audit.title
admin.gst.return.audit.count
admin.gst.return.audit.loadMore
admin.gst.return.audit.empty
admin.gst.return.audit.event.filed
admin.gst.return.audit.event.approved
admin.gst.return.audit.event.rejected
admin.gst.return.audit.event.amended
admin.gst.return.audit.event.revisionRequested
admin.gst.return.audit.system
admin.gst.return.audit.diffLink
```

### 3.7 Accessibility
- Wrap in `<section aria-labelledby="audit-title">`.
- Use `<ol>` for the event list so screen readers announce order.
- Each event row announces as: `"<action> by <actor>, <relative time>. <detail>"`.
- Collapsible header: `aria-expanded` toggled; focus visible ring at `color.brand.500`.
- Diff link opens modal with `role="dialog"` and first focus on close button.

---

## 4. Responsive behavior

- **≥1280px:** three-column layout (line items | ITC | right rail), audit panel expanded.
- **1024–1279px:** two-column (main | right rail). Audit panel collapses to summary strip.
- **768–1023px (tablet):** single column, right rail becomes full-width section below main, audit panel stays collapsed.
- **<768px:** same single column; ARN capture and audit panel become full-width sections.

---

## 5. Implementation notes for frontend-dev

- No new tokens needed. No new top-level components required.
- ARN field uses the existing `TextInput` primitive from `component-library.md` §1.1 with `type="text"`, `autoCapitalize`, and `maxLength=16`.
- Audit panel uses existing `Card` + extended `StatusTimeline`.
- Data binding:
  - ARN: `PATCH /gst/returns/{id}/arn` via TanStack Query mutation.
  - Audit events: `GET /gst/returns/{id}/audit` via TanStack Query (stale-time 30s, refetch on focus).

---

## 6. Status

| Item | Status |
|---|---|
| ARN capture field | **Needs implementation** — design complete, ready for frontend-dev |
| Audit-trail panel | **Needs implementation** — design complete, ready for frontend-dev |
| StatusTimeline `actor` prop extension | **Good to implement** — non-breaking; document in component library append section |
| Everything else on GstReturnReviewPage | **No change** — existing spec covers it |

*End of Phase 6A deltas for GstReturnReviewPage.*
