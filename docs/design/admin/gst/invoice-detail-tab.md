# GstReturnReviewPage — Invoice Detail Tab (Phase 6B addition)

> **Phase:** 6B (GST Completion)
> **Owner:** ui-ux-agent
> **Code target:** `src/admin/src/pages/gst/GstReturnReviewPage.tsx` — add new tab `Invoice Detail`.
> **Existing spec:** `docs/design/admin/gst-return-review-deltas.md` (Phase 6A — ARN + audit trail).
> **Design system:** extends `docs/design/component-library.md`. No new tokens.

---

## 1. Purpose

Phase 6A added return-level review (summary, ARN, audit). Phase 6B requires invoice-level visibility for **GSTR-1**: every invoice that rolls up into the return must be reviewable, line-items editable, and HSN/SAC discoverable via search before submission.

## 2. User goal

> "As an admin / CA reviewing GSTR-1, I need to drill from the return summary into individual invoices, fix line-item issues (HSN, taxable value, rate), and see those edits reflected in the rolled-up summary before I submit."

## 3. Tab placement

Existing tabs on `GstReturnReviewPage`: `[Summary] [ITC Reconciliation] [Audit Trail]`.

Add a new tab between `Summary` and `ITC Reconciliation`:

```
[Summary] [Invoice Detail (142)] [ITC Reconciliation] [Audit Trail]
```

- Tab visible only when `return.type ∈ {GSTR-1, GSTR-1A}`.
- Count badge in tab label = invoice count for the period; updates live on edit/add.
- Tab order is keyboard-navigable (Left/Right arrow on tablist).

## 4. Layout (≥1024px)

```
┌─ Tab body ─────────────────────────────────────────────────────────┐
│ ┌─ Toolbar ───────────────────────────────────────────────────┐  │
│ │ [Search invoice no.] [Customer ▾] [POS ▾] [Status ▾]        │  │
│ │                            [Bulk import ▾] [+ Add invoice]  │  │
│ └─────────────────────────────────────────────────────────────┘  │
│ ┌─ Master list (left, 360px) ┬─ Detail panel (right, flex) ──┐  │
│ │ Inv# 0042 · ₹1,18,000      │ Header: Invoice 0042            │  │
│ │   27ABCDE1234F1Z5  [⚠]     │   Customer 27ABCDE1234F1Z5      │  │
│ │ Inv# 0041 · ₹  88,500      │   Date 12/03/2026 · POS Maha    │  │
│ │ Inv# 0040 · ₹  56,200      │   [StatusBadge: Validated]      │  │
│ │ ...                        │                                 │  │
│ │                            │ ── Line items ────── [+ Add]──  │  │
│ │                            │ # │HSN/SAC│Desc│Qty│Rate│Tax₹│ │  │
│ │                            │ 1 │[7308] │ … │10 │1000│1800│⋮│  │
│ │                            │ 2 │[7308] │ … │ 5 │ 950│ 855│⋮│  │
│ │                            │                                 │  │
│ │                            │ ── Tax breakdown (read-only)──  │  │
│ │                            │ Taxable ₹1,00,000               │  │
│ │                            │ CGST 9% ₹9,000                  │  │
│ │                            │ SGST 9% ₹9,000                  │  │
│ │                            │ IGST   ₹0                       │  │
│ │                            │ Total  ₹1,18,000                │  │
│ │                            │                                 │  │
│ │                            │ [Validate] [Save] [Mark Final]  │  │
│ └────────────────────────────┴─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

≤1023px: master list collapses to a back-stacked list view (click invoice → full-screen detail with `[‹ Back to list]`).

## 5. Components used

| Region | Component | Source |
|---|---|---|
| Tab list | `Tabs` | existing |
| Master list | `VirtualList` | existing |
| Detail header | `DefinitionList` + `StatusBadge` | existing |
| Line-item table | `EditableDataGrid` (NEW — see §6.1) | new primitive |
| HSN/SAC field | `HsnSacTypeahead` (NEW — see §6.2) | new primitive |
| Tax breakdown | `TaxBreakdownTable` | existing (component-library 6.6) |
| Toolbar filters | `Select` × N + `SearchInput` | existing |
| Bulk import | `BulkImportModal` (composes `Modal` + `FileUpload` + `MappingPreviewTable`) | existing pattern |

## 6. New / extended primitives

### 6.1 EditableDataGrid (NEW — generic, reused beyond GST)

**Purpose:** spreadsheet-like inline editing with keyboard navigation, validation, and undo.

**Props (highlights):**
| Prop | Type | Description |
|---|---|---|
| `columns` | `ColumnDef[]` | per-column editor (`text \| number \| currency \| date \| select \| typeahead`), validator, formatter |
| `rows` | `Row[]` | data |
| `onChange` | `(rows) => void` | — |
| `onCommit` | `(rowId, patch) => Promise` | server save (per-row autosave) |
| `readOnly` | boolean | whole-grid lock |
| `density` | `compact \| comfortable` | row height 36 / 44 px |

**Behavior:**
- Click cell → enters edit mode (matching the column's editor).
- Enter commits and moves down; Tab commits and moves right; Esc cancels and reverts.
- Per-cell validation surfaces a red underline + tooltip on invalid; saves blocked at row level until valid.
- Per-row state badge in gutter: `dirty` (orange dot), `saving` (spinner), `saved` (green tick fades after 1s), `error` (red dot + retry).
- Undo (Cmd/Ctrl-Z) per cell while editing; once committed, undo via `[Revert row]` in row menu.

### 6.2 HsnSacTypeahead (NEW — Combobox variant)

**Purpose:** debounced search of HSN (goods) / SAC (services) codes against `gst.hsn_sac_codes`.

**Props:**
| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `{ code, description }` | — | Controlled value |
| `onChange` | function | — | — |
| `kind` | `hsn \| sac \| any` | `any` | Filters source |
| `disabled` | boolean | false | — |
| `error` | string | — | Inline validation msg |
| `recentCodes` | `string[]` | `[]` | Cached MRU codes shown when input empty |

**Behavior:**
- Trigger looks like a `TextInput` showing `{code} · {short description}` once selected.
- On focus with empty value: dropdown shows `Recently used` list (up to 8 codes).
- Typing debounces **300ms** then fires `GET /gst/hsn-sac/search?q=…&kind=…`.
- Up to **10** results shown. Each row:
  ```
  ┌────────────────────────────────────────────────┐
  │ 7308    Structures of iron / steel             │
  │         Heading                                │
  └────────────────────────────────────────────────┘
  ```
- Headings rendered with `font-weight: 600`, sub-codes indented.
- Highlight matched substrings (`<mark>` style: `bg-warning.100`).
- Keyboard:
  - Up/Down — move active option (wraps).
  - Enter — select active option, close dropdown.
  - Tab — same as Enter.
  - Esc — close dropdown, retain previous value.
  - PageDown/PageUp — jump 5 rows.
- Active row visually: `bg-indigo.50` + 2px left bar `indigo.500`. WCAG verified.
- Empty results: row "No matches for 'cmt'. [Browse full list ↗]" — link opens an external CBIC reference modal.
- Loading: row with shimmer + "Searching…".
- Network error: row "Search unavailable. [Retry]".

**Accessibility:**
- Combobox pattern (WAI-ARIA 1.2): `role="combobox" aria-expanded aria-controls aria-activedescendant`.
- Listbox: `role="listbox"`. Each option: `role="option" aria-selected`.
- Screen reader announces `"{n} results"` on update via `aria-live="polite"`.
- Recently-used group: `role="group" aria-label="Recently used codes"`.

**i18n:**
```
admin.gst.hsn.placeholder
admin.gst.hsn.recent
admin.gst.hsn.searching
admin.gst.hsn.empty            // "No matches for {{q}}"
admin.gst.hsn.browseFull
admin.gst.hsn.error.network
```

### 6.3 EditableDataGrid columns for line items

| Column | Editor | Validator |
|---|---|---|
| # | read-only counter | — |
| HSN/SAC | `HsnSacTypeahead` | required, 4–8 digit code, must exist in catalog |
| Description | `TextInput` | required, max 200 chars |
| Qty | `NumberInput` (3 decimals) | > 0 |
| Unit | `Select` (UQC list: NOS, KGS, MTR, …) | required |
| Rate (₹) | `CurrencyInput` (INR, 2 decimals) | ≥ 0 |
| Discount % | `NumberInput` | 0–100 |
| Taxable value | computed read-only `qty × rate × (1 − disc/100)` | — |
| GST rate | `Select` (0, 5, 12, 18, 28; configurable) | required |
| CGST / SGST / IGST | computed read-only based on POS vs supplier state | — |
| Total | computed read-only | — |
| Row menu | duplicate, delete, revert | — |

Recompute happens client-side on every commit; final source of truth = backend on save.

## 7. Toolbar & filters

| Filter | Component | Options |
|---|---|---|
| Search | `SearchInput` | matches invoice number, customer name, customer GSTIN |
| Customer | `Combobox` searchable | unique customers in this period |
| POS (place of supply) | `Select` | Indian state codes |
| Status | `Select` (multi) | DRAFT, VALIDATED, ERROR, FINAL |

`[Bulk import ▾]` opens menu: `From CSV…`, `From Tally export…`, `From Excel…` — all open `BulkImportModal` with the right parser preset. After parse, mapping preview table lets user fix column mapping; on confirm, invoices created in `DRAFT` and validation runs.

`[+ Add invoice]` opens a slide-over panel with the same fields as the detail header + a single empty line item, then drops the user into edit mode.

## 8. Status pills (invoice-level)

| Status | Variant | Meaning |
|---|---|---|
| `DRAFT` | neutral | Newly added or imported, not yet validated |
| `VALIDATED` | info | Passes server-side validation rules (GSTIN format, totals, HSN required) |
| `ERROR` | error | Validation failed — error list rendered in detail |
| `FINAL` | success | Locked, included in submission payload |

Errors render as `AlertBanner type=error` block with structured rules: each row links to the offending cell (focuses cell on click).

## 9. Cross-tab interaction

- Editing an invoice marks the return state as `DIRTY` (existing return-level indicator). Summary tab badge shows "Recalculating…" until backend recompute returns.
- Idempotent recompute endpoint (per phase scope §7) is called on tab change away from Invoice Detail with pending dirty rows; toast confirms "Summary updated".
- Audit Trail tab gains entries `invoice.added`, `invoice.line_changed`, `invoice.deleted`, `invoice.bulk_imported {count}` — written by backend, read-only display.

## 10. States

- **Loading:** master list shimmer (8 placeholder rows); detail panel skeleton.
- **Empty (no invoices):** master list shows EmptyState illustration + `[+ Add invoice]` and `[Bulk import ▾]` CTAs.
- **No selection:** detail panel shows hint "Select an invoice from the list to view and edit its line items."
- **Save failed:** row gutter `error` dot; toast "Couldn't save row 3 — [Retry]"; row stays in dirty state.
- **Concurrent edit conflict:** banner "{{actor}} edited this invoice {{relativeTime}}. [Reload to continue]" — grid locks until reload.

## 11. Accessibility

- Tabs follow WAI-ARIA tab pattern. Tab badge pluralization through `aria-label="Invoice Detail, 142 invoices"`.
- Editable grid: each cell is `role="gridcell"`. Editing cell adds `aria-readonly="false"`. Validation errors `aria-invalid` + `aria-describedby` to error tooltip.
- Keyboard map documented in an in-page `[?]` button (popover) per WAI guidance.
- HsnSacTypeahead: full WAI-ARIA combobox compliance (see §6.2).
- All cells / buttons ≥ 44 × 44 pt at default density; compact density (36 px) is opt-in via toggle, with a warning that smaller hit targets reduce mobile-web usability.

## 12. i18n keys

```
admin.gst.return.tabs.invoiceDetail
admin.gst.return.invoices.toolbar.search
admin.gst.return.invoices.toolbar.customer
admin.gst.return.invoices.toolbar.pos
admin.gst.return.invoices.toolbar.status
admin.gst.return.invoices.toolbar.bulkImport
admin.gst.return.invoices.toolbar.addInvoice
admin.gst.return.invoices.empty.title
admin.gst.return.invoices.empty.body
admin.gst.return.invoices.empty.import
admin.gst.return.invoices.empty.add
admin.gst.return.invoices.column.hsn
admin.gst.return.invoices.column.description
admin.gst.return.invoices.column.qty
admin.gst.return.invoices.column.unit
admin.gst.return.invoices.column.rate
admin.gst.return.invoices.column.discount
admin.gst.return.invoices.column.taxable
admin.gst.return.invoices.column.gstRate
admin.gst.return.invoices.column.cgst
admin.gst.return.invoices.column.sgst
admin.gst.return.invoices.column.igst
admin.gst.return.invoices.column.total
admin.gst.return.invoices.row.duplicate
admin.gst.return.invoices.row.delete
admin.gst.return.invoices.row.revert
admin.gst.return.invoices.status.draft
admin.gst.return.invoices.status.validated
admin.gst.return.invoices.status.error
admin.gst.return.invoices.status.final
admin.gst.return.invoices.toast.saved
admin.gst.return.invoices.toast.imported
admin.gst.return.invoices.toast.summaryUpdated
admin.gst.return.invoices.error.conflict
```

`en`, `hi`, `bn`. Hindi/Bengali column headers may exceed default width — use `text-overflow: ellipsis` + `title` tooltip; allow user-resized columns persisted to localStorage.

## 13. Telemetry

- `gst.return.invoiceTab.viewed` { returnId, count }
- `gst.return.invoice.opened` { invoiceId }
- `gst.return.invoice.edited` { invoiceId, field }
- `gst.return.invoice.saved` { invoiceId, durationMs }
- `gst.return.hsn.searched` { q, resultCount, ms }
- `gst.return.hsn.selected` { code, fromRecent }

## 14. Handoff notes

- New primitives required: `EditableDataGrid`, `HsnSacTypeahead`. Both should land in `src/admin/src/components/` for reuse.
- Coordinate with backend on `POST /gst/invoices/bulk-import` mapping preview payload shape — design assumes server returns `{ rows: [...], unmappedColumns: [...], inferredMapping: {...} }`.
- Coordinate with db-engineer on `gst.hsn_sac_codes` description column ranking — recommend using `description_tsvector` rank + prefix match on `code`.
