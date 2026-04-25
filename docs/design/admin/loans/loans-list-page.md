# Admin — LoansPage

> Phase: 6C | Owner: ui-ux-agent | Date: 2026-04-25

---

## Purpose

The full operations view of every loan application across all orgs (with role-gated visibility). Replaces the existing stub. Loan officers, CAs, and admins triage, assign to partner banks, and follow up via this page.

## User Goal

"Show me everything in flight, sorted by what needs my attention. Let me filter, bulk-assign, and dive into one quickly."

---

## Layout

```
┌─ TopNav (Phase 6 base) ──────────────────────────────────┐
│  PageHeader  "Loans"   [+ New manual app]                │
│  KpiStrip                                                  │
│   [Total apps 248] [Submitted 47] [Under review 88]      │
│   [Awaiting docs 21] [Approved 56] [Disbursed 36]        │
│  ─────────────────────────────────────────────────────── │
│  FilterBar                                                 │
│   [Status ▾] [Bank ▾] [Amount range] [Date range]        │
│   [Owner ▾] [Search by org/PAN/ref]   [Export ▾]         │
│  ─────────────────────────────────────────────────────── │
│  SelectionToolbar (when ≥1 row selected)                  │
│   "{n} selected"  [Bulk assign to bank ▾]                 │
│   [Bulk export PDF]  [Bulk close]                         │
│  ─────────────────────────────────────────────────────── │
│  DataGrid                                                  │
│   Columns:                                                 │
│    ☐  ID     Org           Product       Amount    Tenure │
│    Status  Bank   Submitted   Days in stage   Owner   ⋯  │
│   Sticky header. Default sort: Days in stage desc.        │
│  Pagination 25 / 50 / 100                                  │
└────────────────────────────────────────────────────────── ┘
```

---

## Components used

- `PageHeader` (admin shell).
- `KpiStrip` — reuses Phase 6E KPI tile primitive; 6 tiles wrap on small screens.
- `FilterBar` — reuses Phase 6B admin filter pattern. All filters URL-synced.
- `SelectionToolbar` — Phase 6B floating toolbar primitive.
- `DataGrid` — TanStack Table; column resize, virtualized for 1k+ rows.
- `StatusBadge` — Phase 6C variant table (see component-library addendum).
- `BankAdapterTypeBadge` (new) — small chip in `Bank` column showing email / REST / oauth.

## Columns

| Column | Width | Notes |
|---|---|---|
| ☐ checkbox | 40 | Bulk-select |
| ID | 120 | App reference, click → detail |
| Org | 200 | Tooltip with PAN + GSTIN |
| Product | 220 | "{Bank} · {Product}" with logo |
| Amount | 120 | Right-align, Indian grouping |
| Tenure | 90 | "24 mo" |
| Status | 140 | StatusBadge |
| Bank | 160 | Logo + name + AdapterTypeBadge |
| Submitted | 130 | DD MMM YYYY HH:mm IST |
| Days in stage | 110 | Color cue: ≤3 neutral, 4–7 warning, >7 error |
| Owner | 140 | Avatar + name |
| ⋯ | 48 | Row menu: View / Reassign / Close |

## Filters

- Status: multi-select chips (DRAFT / SUBMITTED / UNDER_REVIEW / DOCS_REQUESTED / APPROVED / REJECTED / DISBURSED / CLOSED).
- Bank: multi-select bank picker (logos).
- Amount range: dual slider (₹1L – ₹50L).
- Date range: from/to with presets (Today / 7d / 30d / FY).
- Owner: assigned officer.
- Search: hits org name, PAN, GSTIN, app ID, bank ref no.
- Export: CSV (current filter) / PDF summary report.

## Bulk actions

- **Bulk assign to bank** — only allowed when all selected rows are `SUBMITTED` or `DRAFT`. Disabled with tooltip otherwise.
- **Bulk export PDF** — generates a zip of all selected packages. Background job; toast on completion.
- **Bulk close** — admin-only; requires confirm modal with reason field.

## Role gating

- Visible to roles: `LOAN_OFFICER`, `ADMIN`, `CA`.
- `CA` role sees only apps where they are assigned reviewer.
- `LOAN_OFFICER` sees apps for assigned banks.
- `ADMIN` sees all.
- Bulk-close hidden unless `ADMIN`.

## States

- **Empty** — Empty state with illustration "No loan applications yet." + tip "Encourage users to apply via the mobile app."
- **Loading** — skeleton 5 rows.
- **Filtered empty** — "No loans match these filters." + Clear button.
- **Error** — banner + Retry.
- **Live update** — when a SignalR event arrives, the row pulses 800ms; if the row falls outside current page, KpiStrip updates and toast "1 update — refresh to see latest".

## Responsive

- ≥1280px: full grid as above.
- 768–1279px: collapse Tenure + Days-in-stage columns into row tooltip.
- <768px: switch to `LoanRowCard` mobile-web variant (logo + headline metrics + status badge); selection via long-press.

## i18n keys

```
admin.loans.title
admin.loans.cta.newManual
admin.loans.kpi.total / .submitted / .underReview / .awaitingDocs / .approved / .disbursed
admin.loans.filter.status / .bank / .amount / .date / .owner / .search / .export
admin.loans.bulk.assign / .export / .close / .selected
admin.loans.col.{id|org|product|amount|tenure|status|bank|submitted|days|owner}
admin.loans.empty.title / .body
admin.loans.error / .retry
```

## Accessibility

- DataGrid: full keyboard nav (arrows + Enter), `aria-rowcount`, `aria-rowindex`, sortable headers `aria-sort`.
- Checkbox column has accessible label "Select row {id}".
- Filters announce active state via `aria-pressed`.
- Live updates use `aria-live='polite'`.
- Color-only status cues paired with badge icon + text.
- WCAG AA contrast verified for all StatusBadge variants.

## Telemetry

- `admin.loans.viewed`, `admin.loans.filterChanged {field}`, `admin.loans.rowOpened {id}`, `admin.loans.bulkAssign {count, bankId}`, `admin.loans.exported {count, format}`.
