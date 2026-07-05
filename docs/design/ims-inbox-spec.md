# GSTN IMS (Invoice Management System) Inbox — UI Spec (Admin Web + Mobile)

> **Status:** Implementation-ready spec. GAP-101 / board #32 (HIGH). Mandatory regulatory surface from **1 Apr 2026**.
> **Owner:** ui-ux-agent (this spec) · frontend-dev (`src/admin`) · mobile-dev (`mobile/src`) · qa-web / qa-mobile (a11y + behaviour gates).
> **Grounding (read on branch `2026-06-10-s5t4`):** backend endpoints `backend/Services/FinanceService/Finance.WebApi/Endpoints/Gst/GstIms.cs`; entity/state-machine `GstService.Domain/Entities/ImsInvoice.cs`; API contracts `docs/api/endpoints.md` §GstService-IMS; design system `docs/design/tokens.json` (v2.1.0), `docs/design/component-library.md`, `docs/design/design-elevation-spec.md`, `docs/design/accessibility-standard.md`.
> **a11y is a regulatory mandate on this surface:** WCAG 2.1 AA + IS 17802 (RBI/SEBI/Supreme-Court-2025 mandate per `accessibility-standard.md` §0). Every rule in that doc is binding here; where this spec and the a11y spec touch the same token, the a11y rule wins.

---

## 0. Regulatory model the UI must encode (single source of truth)

This is the mental model the whole UI must teach the user, drawn from `ImsInvoice.cs` + endpoints doc:

- Each **supplier-reported inward invoice** appears in the IMS inbox per period. The taxpayer must take ONE of three actions on each before **GSTR-2B is generated on the 14th of the following month**:
  - **ACCEPTED** → ITC flows into GSTR-2B.
  - **REJECTED** → ITC does NOT flow; supplier must amend via GSTR-1A.
  - **PENDING_KEPT** → acknowledged but deferred (taxpayer will decide later).
- **PENDING** = no action yet (the default after sync).
- **Deemed acceptance:** any invoice still `PENDING` or `PENDING_KEPT` at GSTR-2B generation is **automatically deemed ACCEPTED** (`deemedAccepted = true`, `status = ACCEPTED`). The UI must make this consequence unmissable, because "doing nothing" silently claims the ITC.
- **State machine (terminal transitions enforced server-side — UI must mirror, never offer illegal actions):**
  - `PENDING → ACCEPTED | REJECTED | PENDING_KEPT`
  - `PENDING_KEPT → ACCEPTED | REJECTED` (can still act)
  - `ACCEPTED` is terminal → **cannot be rejected** (server returns `409 ImsInvoice.InvalidTransition`). UI hides "Reject" and surfaces **"Fix via GSTR-1A"** instead.
  - `REJECTED` is terminal → **cannot be accepted** (409). UI hides "Accept", surfaces **"Fix via GSTR-1A"**.
  - All three actions are **idempotent** (re-applying the same status = success no-op).
- **GSTR-1A** is the ONLY correction route once a terminal/filed state is reached. The rejected-invoice follow-up list lives here (§9).

**EXACT status vocabulary (use verbatim — do not invent labels in code; these are the API `status` string values):**
`PENDING` · `ACCEPTED` · `REJECTED` · `PENDING_KEPT`
Action string values (request `action` field): `"ACCEPTED"`, `"REJECTED"`, `"PENDING_KEPT"`.
GSTR-1A statuses: `DRAFT` · `SUBMITTED` · `FILED`. Amendment types: `B2B_AMENDMENT` · `B2BA` · `CDNR_AMENDMENT` · `CDNRA`.

> **Reason on reject — backend contract verdict (verified in `GstIms.cs` + `ImsInvoice.Reject`):** `reason` is **OPTIONAL** server-side (`string? Reason = null`, `Reject(actionedBy, reason)` accepts null). **UX decision: make rejection reason REQUIRED in the client** (min 3 chars) for audit quality and GSTR-1A follow-up traceability — it is stored to `RejectionReason` and surfaces in the action log. This is a client-enforced field, not a server 400; document it as such so backend isn't asked to add a guard.

---

## 1. Information architecture & navigation placement

### 1.1 Admin web (`src/admin`)
- **Sidebar → GST → "IMS Inbox"** as a new item directly under the existing GST group (alongside "Filing Queue", "Return Review"). GST module accent = **Violet `module.gst #7C3AED`** (`tokens.json`).
- **Breadcrumb:** `Dashboard › GST › IMS Inbox`. Detail: `Dashboard › GST › IMS Inbox › INV-001`.
- **Routes:**
  - `/gst/ims` — inbox list (Screen IMS-W1)
  - `/gst/ims/:invoiceId` — invoice detail + action log (Screen IMS-W2, drawer or page)
  - `/gst/ims/gstr1a` — GSTR-1A amendments list (Screen IMS-W3)
- **Permission gating (hide nav item / disable actions when absent):** list+detail require `gst.ims.read`; accept/reject/keep-pending require `gst.ims.action`; sync requires `gst.ims.sync`; GSTR-1A list `gst.gstr1a.read`, create `gst.gstr1a.create`. Use the existing RBAC-gated nav pattern (hide item if no `gst.ims.read`).
- **Organisation context:** every call needs `organizationId`. Admin operates per-business — use the existing business/GSTIN context selector already used by the GST Filing Queue; do not add a second selector.

### 1.2 Mobile (`mobile/src`)
- **GST tab** (existing bottom-tab destination, `GstDashboardScreen`) gains an **"IMS Inbox" entry card** in the Pending Actions section, badged with the live PENDING count and an urgency dot when within the deemed-acceptance window. This is the primary entry point.
- **Stack screens** under the GST navigator:
  - `ImsInboxScreen` (IMS-M1) — list
  - `ImsInvoiceDetailScreen` (IMS-M2) — detail + action log + per-invoice actions
  - `Gstr1aAmendmentsScreen` (IMS-M3) — rejected follow-up list
- A deep-link / FCM tap (deadline reminder push) routes straight to `ImsInboxScreen` for the relevant period.
- GSTIN selector reuses the `GstDashboardScreen` GSTIN dropdown when the user holds multiple GSTINs.

---

## 2. Summary header (both surfaces)

Backed by `GET /gst/ims/summary?organizationId=&period=MMYYYY` →
`{ period, pending, accepted, rejected, pendingKept, total, deemedAccepted, gstr2bGenerationDeadline, gstr2bGenerationPast, totalPendingValue, totalAcceptedValue, totalRejectedValue }`.

### 2.1 Period selector
- Format shown to user: **"March 2026"**; value sent to API: **`MMYYYY` = `032026`**. Helper must convert both ways (see i18n/format §11).
- Default to the **current open period** (latest month whose 14th has not passed) on first load. Persist last-selected period in session.
- Admin: a `Select` (component-library §1.6) listing the last 12 periods, newest first.
- Mobile: a horizontally-scrollable month pill row OR a bottom-sheet month picker (reuse the GST dashboard period pattern). 44pt targets.

### 2.2 Status count cards (KPI row)
Four `MetricCard`s (component-library §2.2), one per status, each showing count + ₹ value where available:

| Card | Count source | Value source | Color token |
|---|---|---|---|
| Pending | `pending` | `totalPendingValue` | `warning` (Amber `#F59E0B`) |
| Accepted | `accepted` | `totalAcceptedValue` | `success` (Emerald `#10B981`; **text uses `success[700] #047857`** per a11y §4) |
| Rejected | `rejected` | `totalRejectedValue` | `error` |
| Pending-kept | `pendingKept` | — | `info` |

- A 5th inline stat: **"Total {total} invoices"**. Mobile: render the four as a 2×2 grid (not a horizontal scroll — these are decision-critical, must all be visible). Admin: single row, wraps at < 768px.
- Tapping a card **filters the list to that status** (sets the `status` query param) — announce the filter change via live region.
- Amounts use `AmountDisplay` (component-library §6.1): INR, Indian grouping (₹15,00,000), Western numerals in all locales (Indic typography rule, §10).

### 2.3 Sync-from-GSTN action + last-synced timestamp
- **"Sync from GSTN" button** (`SecondaryButton` web; `SecondaryButton`/icon-button mobile) → `POST /gst/ims/sync { organizationId, gstin, period }`. Requires `gst.ims.sync` (else hide).
- On success (`{ inserted, skipped, period }`): toast **"Synced — {inserted} new invoices, {skipped} unchanged"**, then **refetch** the list + summary. Sync is idempotent upsert (existing local action statuses are preserved — never overwritten), so re-syncing is always safe; communicate that in the button's `accessibilityHint`.
- **Last-synced timestamp:** show **"Last synced: 11 Jun 2026, 14:30"** (DD MMM YYYY, HH:mm, IST) next to the button. There is no dedicated `lastSyncedAt` field in the summary contract → **client stores the timestamp of the last successful `/sync` per (org, period)** in local state/SecureStore (mobile) / query cache meta (web). If never synced this session, show **"Not synced yet"** + a subtle prompt to sync.
- Rate limit is 30 req/min — debounce the button and show a spinner-in-button busy state; never allow double-fire.

### 2.4 Deemed-acceptance banner (the headline education element)
Driven by `gstr2bGenerationDeadline` + `gstr2bGenerationPast` + the days-until countdown (§4). Three states:

1. **Open window, deadline in future** → **Warning AlertBanner** (Amber): *"Action required by {DD MMM YYYY}. {pending + pendingKept} invoices are still pending. Anything not actioned by then will be **automatically accepted** when GSTR-2B is generated on the 14th."* Include an inline **"Learn how IMS works"** link → info modal/sheet (§5).
2. **Window past (`gstr2bGenerationPast = true`)** → **Info AlertBanner** (neutral/info): *"GSTR-2B for {Month YYYY} has been generated. Pending invoices were deemed accepted. To correct a rejection, use GSTR-1A."* Actions on still-PENDING items for this period are no longer meaningful — see §6.5.
3. **`deemedAccepted = true` in summary** (sweep already ran) → same as state 2, plus a **"Deemed accepted" tag** appears on the affected rows (§4).

Banner is dismissible per session but **re-appears each period** until the window passes. Never auto-hide a warning the user must act on.

---

## 3. Inbox list (Screen IMS-W1 / IMS-M1)

Backed by `GET /gst/ims/invoices?organizationId=&period=&status=&supplierGstin=&search=&page=&pageSize` → `{ items:[ImsInvoiceSummary], totalCount, page, pageSize }`.

### 3.1 Columns / row fields (use EXACT data)
`ImsInvoiceSummary` = `{ id, supplierGstin, supplierName, invoiceNumber, invoiceDate, invoiceValue, taxableValue, igstAmount, cgstAmount, sgstAmount, cessAmount, period, source, status, deemedAccepted, actionedAt, actionedBy }`.

**Admin — `DataTable` (component-library, sortable):**

| Column | Field | Render |
|---|---|---|
| ☐ (bulk select) | — | Checkbox; header = select-all-on-page |
| Supplier | `supplierName` | bold; 2nd line `supplierGstin` in **mono** (GSTIN convention) |
| Invoice | `invoiceNumber` | mono; 2nd line `invoiceDate` as **DD/MM/YYYY** |
| Taxable value | `taxableValue` | `AmountDisplay`, right-aligned |
| Tax | `igst+cgst+sgst+cess` | `AmountDisplay` sum, right-aligned; tooltip/expander shows the IGST/CGST/SGST/Cess split (`TaxBreakdownTable` §6.5) |
| Invoice value | `invoiceValue` | `AmountDisplay`, right-aligned, semibold |
| Source | `source` | `Tag` — "GSTR-1" / "IFF" |
| Status | `status` + `deemedAccepted` | **`StatusBadge` (new IMS map, §8)**; if `deemedAccepted` append a small "Deemed" tag |
| Deadline | countdown (§4) | `DueDateChip` — days-until-deemed-acceptance, color by urgency |
| Actions | — | Inline action buttons appropriate to current status (§6) |

- Default sort: **most urgent first** = ascending days-to-deadline, then PENDING before others. Sortable by supplier, invoice value, tax, status, date.
- Empty `cgst/sgst/igst` are `0.00` — never show "—" for a real zero; show ₹0 only inside the tax-split expander, and the summed Tax column shows the total.

**Mobile — `Card` list (one card per invoice), tappable to detail:**
```
[ImsInvoiceCard]
  [Row 1: supplierName (bold, wraps 2 lines)   ·   StatusBadge right]
  [Row 2: supplierGstin (mono, small, neutral[600])]
  [Row 3: "INV-001 · 15/03/2026" (mono number) ]
  [Row 4: Taxable ₹10,000 · Tax ₹1,800 · Total ₹11,800]  (AmountDisplay inline)
  [Row 5: Source tag (GSTR-1)   ·   DueDateChip ("Deemed in 3 days")]
  [Row 6 (action zone): Accept | Reject | Keep pending  — only legal actions for status]
```
- Whole card tappable → `ImsInvoiceDetailScreen`. Action buttons are **separate touch targets** (≥44pt) and stop card-tap propagation.
- Long supplier names wrap (Indic +30–40%, §10) — never truncate the GSTIN.

### 3.2 Filtering
- **Filter bar:** status chips (All / Pending / Accepted / Rejected / Pending-kept — counts from summary), `supplierGstin` filter, free-text `search` (matches supplier name / invoice no — debounce 300ms). All map to query params.
- Mobile: status filter = horizontally scrollable chip row + a "Filter" sheet for supplier/search.
- Active filters render as removable chips; "Clear all" resets.

### 3.3 Pagination
- `pageSize` default 20 (matches API default). Admin: page-size selector 20/50/100; numbered pagination. Mobile: infinite scroll / "Load more" appending pages (preserve any in-flight bulk selection across pages — see §6.4 cap note).

---

## 4. Days-until-deemed-acceptance countdown — urgency treatment

The deadline is `gstr2bGenerationDeadline` (the 14th of the following month). `daysLeft = dateDiff(deadline, today)` in IST. Render as a **`DueDateChip`** (existing custom pattern in GST screens; formalize for IMS):

| Condition | Chip label (en) | Color token | Icon | a11y |
|---|---|---|---|---|
| `gstr2bGenerationPast` OR `deemedAccepted` | "Deemed accepted" | `info` (neutral-info) | check-circle | `accessibilityLabel="Deemed accepted; GSTR-2B generated"` |
| status ∈ {ACCEPTED, REJECTED} (already actioned) | no countdown — show status only | — | — | countdown suppressed; row is settled |
| `daysLeft <= 0` (deadline today/passed but not yet swept) | "Due today" | `error` | alert-triangle | "Deemed acceptance due today" |
| `1 ≤ daysLeft ≤ 3` | "Deemed in {n} days" | `error` (red) | clock | "Auto-accepted in {n} days if no action" |
| `4 ≤ daysLeft ≤ 7` | "Deemed in {n} days" | `warning` (amber) | clock | same |
| `daysLeft > 7` | "Deemed in {n} days" | `neutral` | clock | same |

- **Never colour-only:** every chip pairs colour with an icon + text (a11y 1.4.1, X-1). 
- Countdown only matters for still-actionable rows (PENDING / PENDING_KEPT); suppress it once an explicit terminal action exists, but keep "Deemed accepted" for swept rows so the user understands why ITC flowed.
- The countdown number is the **focusable, announced** urgency signal — see SR labels §10.

---

## 5. Deemed-acceptance education (banner already in §2.4) — info modal/sheet content

Triggered by "Learn how IMS works" / "How does this work?". Admin = `Dialog`; mobile = bottom sheet. Content (server-supplied versioned regulatory text where available; chrome via `t()`):
- **What IMS is** (1 line) + the three actions and their ITC consequence.
- **The 14th-of-month cutoff** with the current period's exact date.
- **"Doing nothing = accepted"** stated plainly (the most important sentence — give it `display.section` weight).
- **Rejection → GSTR-1A** correction path.
- A "Got it" dismiss; never blocks the inbox.

This sheet doubles as the WCAG conforming explanation; its copy must exist in en/hi/bn (IS 17802 language parity).

---

## 6. Action flows

All actions: `POST /gst/ims/invoices/{id}/action { organizationId, actionedBy, action, reason? }` → `{ invoiceId, previousStatus, newStatus, changed, gstnRef? }`. Bulk: `POST /gst/ims/actions/bulk { organizationId, actionedBy, items:[{invoiceId, action, reason?}] }` → `{ totalRequested, changed, skipped, failed, results:[...] }`. `actionedBy` = current user id (from auth context — never user-entered).

### 6.1 Accept (single)
- Available only when status ∈ {PENDING, PENDING_KEPT} (and as idempotent no-op if already ACCEPTED — but hide the button when already accepted to avoid noise).
- **No confirmation dialog** for single accept (low-risk, reversible only via GSTR-1A but it is the "happy path" the regulator expects). Apply **optimistic update**: badge flips to ACCEPTED immediately, then reconcile with `newStatus`. On error, roll back + error toast.
- Success toast: **"Invoice {invoiceNumber} accepted"** + **Undo** (see §6.6).

### 6.2 Reject (single)
- Available only when status ∈ {PENDING, PENDING_KEPT}. **Hidden** when ACCEPTED (server would 409) — replace with "Fix via GSTR-1A" (§9).
- **Requires a confirmation step with a reason field** (client-required, §0). Modal/sheet:
  - Title: "Reject invoice {invoiceNumber}?"
  - Body: consequence text — *"ITC for this invoice will NOT be included in GSTR-2B. The supplier must correct it via a GSTR-1A amendment."*
  - **Reason** (`TextInput`, multiline, required, min 3 chars, maxlength ~250) with quick-pick chips for common reasons: "Price mismatch", "Goods not received", "Duplicate", "Tax rate wrong", "Not my purchase". Selecting a chip fills the field (still editable).
  - Confirm = `error`-styled button "Reject invoice"; Cancel.
- Send `action:"REJECTED", reason`. **Refetch** (do NOT optimistically flip reject — it carries a reason + downstream GSTR-1A implication; show busy state then reconcile). Success toast + Undo (§6.6).

### 6.3 Keep pending (single)
- Available only when status == PENDING (idempotent no-op if already PENDING_KEPT; hide button when already PENDING_KEPT). Not available from ACCEPTED/REJECTED (server 409).
- **No confirmation.** Optimistic flip to PENDING_KEPT. Tooltip/hint clarifies: *"You'll still need to accept or reject before the 14th, or it will be deemed accepted."* (PENDING_KEPT does NOT escape deemed acceptance — make this explicit so users don't think "keep pending" is a safe parking state.)

### 6.4 Bulk actions
- Select-all-on-page + individual checkboxes (admin); mobile = a "Select" mode toggling checkboxes on cards.
- **Cap: 100 invoices per request** (GSTN limit). If selection > 100, disable bulk submit and show *"Select up to 100 invoices per action"*; offer to act on the first 100.
- Bulk **Accept**, bulk **Reject** (single shared reason applied to all — same required-reason modal, body notes it applies to N invoices), bulk **Keep pending**.
- **Eligibility guard:** before sending, filter the selection to rows where the action is legal for their current status; show a pre-flight summary *"{n} will be {action}, {m} skipped (already settled)"*. This prevents predictable per-item 409s.
- Response handling: surface `{ changed, skipped, failed }` in a result toast/summary. If `failed > 0`, open a small results panel listing the failed `results[]` (invoice no + reason) so the user can retry those. **Refetch** list + summary after any bulk op (do not optimistically mutate a bulk set).
- Bulk reject reason is required (same client rule).

### 6.5 When the window has passed (`gstr2bGenerationPast`)
- Hide/disable Accept/Reject/Keep-pending on that period's rows; show the info banner (§2.4 state 2). Any correction routes to **GSTR-1A** (§9). Keep the rows visible read-only with their final status + "Deemed accepted" where applicable.

### 6.6 Optimistic vs refetch + undo window — explicit guidance
| Action | Strategy | Undo |
|---|---|---|
| Accept (single) | **Optimistic** flip + reconcile | **5s undo toast** → sends `action:"PENDING_KEPT"` if originally PENDING (or back to prior status captured from `previousStatus`). Because Accept→Reject is a 409, undo restores to the *pre-action* status, not to REJECTED. |
| Keep pending | **Optimistic** | 5s undo → restores PENDING |
| Reject | **Refetch** (no optimistic) | **5s undo toast** → sends the prior status action (PENDING/PENDING_KEPT) **only while still in the open window**; once swept, no undo. Reject is reversible pre-2B via re-action to PENDING_KEPT; after 2B only via GSTR-1A. |
| Bulk (any) | **Refetch** | No bulk undo (too ambiguous); rely on per-row re-action. |

- The "undo" is implemented as a follow-up action call to the prior status (the state machine allows PENDING_KEPT↔ACCEPTED/REJECTED while not swept). If the prior status was PENDING, undo sends `PENDING_KEPT` (there is no API transition *to* raw PENDING — document this: PENDING is only the sync-default; the closest reversible "un-action" is PENDING_KEPT). Make undo copy honest: **"Moved back to pending-kept."**
- Idempotency means a double-tap of the same action is safe; still debounce.

---

## 7. States — empty, loading, error

### 7.1 Loading skeletons
- **List:** `Skeleton` rows (admin: 8 shimmer table rows; mobile: 6 shimmer cards) using `tokens.skeleton1/2`. Summary cards: 4 skeleton `MetricCard`s.
- Sync/action in-flight: button shows inline spinner + disabled; rows being bulk-acted show a per-row spinner overlay.

### 7.2 Empty states (`EmptyState` §4.5)
- **No invoices for period (synced, genuinely empty):** illustration + *"No invoices in IMS for {Month YYYY}."* + secondary *"If you expect invoices, sync from GSTN or check the period."* + "Sync from GSTN" button.
- **Never synced this period:** *"Sync to pull your inward invoices from GSTN for {Month YYYY}."* + primary "Sync from GSTN".
- **Filter returns nothing:** *"No {status} invoices match your filters."* + "Clear filters".
- **GSTR-1A list empty:** *"No amendments. Rejected invoices that need supplier correction will appear here."*

### 7.3 Error states (`ErrorState` §4.6)
- **GSTN sync failure** (`/sync` non-2xx): inline `AlertBanner` (error) — *"Couldn't sync with GSTN. {server message}. You can retry, or work with the invoices already pulled."* + **Retry** + keep showing cached/last-synced data (degrade gracefully, never blank the inbox on a sync error). Distinguish transient (network/5xx → Retry) from rate-limited (429 → "Too many sync attempts, try again in a minute" with a cooldown).
- **List/summary load failure:** full `ErrorState` with Retry; preserve period/filter selection on retry.
- **Action failure:** error toast with the server `error`/`code` (e.g. `409 ImsInvoice.InvalidTransition` → *"This invoice is already {status} and can't be {action}. Use GSTR-1A to correct it."*). Roll back any optimistic change.
- **Missing org/period (`GST.MissingOrganizationId` / `GST.MissingPeriod`):** a code defect, not user-facing — guard client-side so these never fire; if they do, generic error + log.

---

## 8. StatusBadge — new IMS status map (append to component-library)

Add to `component-library.md` StatusBadge (§2.5) under a "Phase 7 — IMS statuses" heading:

| Status (API verbatim) | Badge label (en) | Color token | Icon (lucide) | Notes |
|---|---|---|---|---|
| `PENDING` | "Pending" | `warning` (Amber) | clock | needs action |
| `ACCEPTED` | "Accepted" | `success` (Emerald; text `success[700]`) | check-circle | if `deemedAccepted` → append muted "Deemed" `Tag` |
| `REJECTED` | "Rejected" | `error` | x-circle | shows reason on hover/detail |
| `PENDING_KEPT` | "Pending (kept)" | `info` | pause-circle | still subject to deemed acceptance |

GSTR-1A badge map:

| Status | Label | Color | Icon |
|---|---|---|---|
| `DRAFT` | "Draft" | `neutral` | file-pen |
| `SUBMITTED` | "Submitted" | `info` | send |
| `FILED` | "Filed" | `success` | check-circle |

- All badges are **icon + text**, never colour-only (a11y 1.4.1). Badge text on tinted bg validated ≥4.5:1 (a11y §4 rule 4) — Amber/warning badge uses dark amber text token, success uses `success[700]`.

---

## 9. GSTR-1A amendments view (Screen IMS-W3 / IMS-M3)

The rejected-invoice follow-up list. Backed by `GET /gst/gstr1a?organizationId=&period=&status=&page&pageSize` → `{ items:[Gstr1aAmendmentSummary], ... }`; create via `POST /gst/gstr1a`.

### 9.1 Entry points
- Tab/segment within the IMS inbox: **"Inbox" | "GSTR-1A amendments"** (admin = tabs `role="tablist"`; mobile = segmented control or a second stack screen reachable from a header button + from the deemed-acceptance "use GSTR-1A" links).
- From a **REJECTED** invoice's detail/row: **"Create GSTR-1A amendment"** CTA (visible only with `gst.gstr1a.create`), pre-filling `originalImsInvoiceId`, `originalInvoiceNumber`, `originalSupplierGstin`, `period`.

### 9.2 List (`Gstr1aAmendmentSummary` = `{ id, originalInvoiceNumber, originalSupplierGstin, originalImsInvoiceId, amendmentType, period, status, arnNumber, filedAt, createdAt }`)

| Column | Field | Render |
|---|---|---|
| Original invoice | `originalInvoiceNumber` | mono; 2nd line `originalSupplierGstin` mono |
| Amendment type | `amendmentType` | `Tag`: B2B_AMENDMENT / B2BA / CDNR_AMENDMENT / CDNRA (with friendly tooltip) |
| Period | `period` | "Mar 2026" (from MMYYYY) |
| Status | `status` | `StatusBadge` (GSTR-1A map §8) |
| ARN | `arnNumber` | mono or "—" if null |
| Filed | `filedAt` | DD/MM/YYYY or "Not filed" |
| Created | `createdAt` | DD/MM/YYYY |

- Filter by `period`, `status` (DRAFT/SUBMITTED/FILED). Pagination same as inbox.

### 9.3 Create amendment form
- Fields: amendment **type** (`Select`: the 4 enums with plain-language helper — "B2B amendment", "Credit/debit note amendment", etc.), pre-filled original invoice no + supplier GSTIN (read-only when launched from a rejected invoice), **period**, and the structured payload that becomes `amendmentPayloadJson` (corrected taxable/tax figures — reuse `TaxBreakdownTable`-style editable rows; serialize to JSON client-side).
- Submit → `POST /gst/gstr1a` → 201 `{ amendmentId, status:"DRAFT", ... }`. Toast "Amendment draft created"; route to the list with the new draft highlighted.
- This is a **draft** workflow only at this stage (status starts DRAFT; submit/file is a later flow) — set that expectation in helper copy.

### 9.4 GSTR-3B Table 3 lock (frontend concern, per endpoints doc §"Table 3 Lock")
- Where IMS/GSTR data feeds GSTR-3B Table 3 figures, once the linked return is `FILED` render those figures **read-only** with a **"Fix via GSTR-1A"** CTA. No backend 409 exists — the UI enforces immutability. (Cross-reference the GSTR-3B review screen spec; this spec only owns the CTA that links into GSTR-1A creation.)

---

## 10. Accessibility (binding — `accessibility-standard.md`)

> This is a regulated surface; treat every item as a gate, not polish.

### 10.1 Screen-reader labels (composed, single-unit announcements)
- **List row / card** must announce as ONE unit (a11y KFS-2 pattern): compose `accessibilityLabel` =
  *"{supplierName}, GSTIN {supplierGstin spelled as the visual mono string}, invoice {invoiceNumber} dated {DD MMM YYYY}, taxable {₹taxable as spoken currency}, tax {₹tax}, total {₹total}, status {status label}, {deemed-acceptance countdown phrase}."*
  Set children `importantForAccessibility="no"` (RN) / `aria-hidden` so the row reads once, not field-by-field.
- **Amounts:** screen reader reads as currency, not digit-by-digit — provide a spoken `accessibilityLabel` ("fifteen lakh rupees" or "₹15,00,000" read as rupees), never the bare glyph string (a11y §1.3 numerals rule; `AmountDisplay` already owns this — reuse it).
- **GSTIN/invoice no (mono):** give a spoken label; do not let AT read the raw 15-char GSTIN as one run-on token where it garbles — keep `AmountDisplay`/mono component's existing a11y handling.
- **DueDateChip:** `accessibilityLabel` = the urgency phrase ("Auto-accepted in 3 days if no action") not just "3" — the countdown is decision-critical.
- **Status changes / async results announced via live region** (a11y 4.1.3): after accept/reject/keep-pending/sync, announce the outcome ("Invoice INV-001 accepted") via `accessibilityLiveRegion="polite"` (RN) / `role="status"` (web) **without moving focus**. Errors via `role="alert"` / `accessibilityLiveRegion="assertive"` and never colour-only (a11y 3.3.1).
- **Filter/period changes announced** ("Showing 12 pending invoices for March 2026").
- All a11y strings via `t()` in en/hi/bn — **no hardcoded English a11y copy** (a11y X-2 / IS 17802 language overlay).

### 10.2 Touch targets
- Every action button, checkbox, chip, period pill, card-tap, and the sync button ≥ **44×44pt** (a11y 2.5.8 house rule). On mobile cards, the per-row Accept/Reject/Keep buttons must each meet 44pt and not overlap the card-tap target.

### 10.3 Contrast (a11y §4 — binding)
- Status/urgency colours never used as the only differentiator (icon+text always).
- **Meaningful secondary text ≥ `neutral[500] #64748B`** (≈4.6:1). **Never `neutral[400]`** for GSTIN, dates, supplier, last-synced, reason text, or any meaningful caption (a11y X-1).
- Success text uses **`success[700] #047857`**, not `success[500/600]` (a11y §4 rule 3).
- Input/checkbox/card borders ≥ 3:1 (`neutral[300]` or darker) (a11y §4 rule 2).
- Web focus ring `--border-focus` ≥3:1 on every interactive element (a11y 2.4.7 / X-4); never `outline:none` without replacement.

### 10.4 Focus order for bulk actions (a11y 2.4.3)
- Logical order: period selector → sync → summary cards/filters → bulk-select-all → first row checkbox → row content → row actions → … → bulk action bar.
- When ≥1 row is selected, the **bulk action bar** (Accept/Reject/Keep-pending all) appears; move/allow focus to it predictably and announce *"{n} selected"* via live region. The bulk Reject reason modal **traps focus**, sets initial focus to the reason field, returns focus to the trigger on close (a11y CON-4 modal pattern).
- Confirmation/reject modals and the education sheet trap focus and are dismissible by Esc (web) / back gesture (mobile).

### 10.5 Timing
- The 14th-of-month deadline is a statutory deadline (cannot be "extended" by the UI) → it is a **2.2.1 essential-exception**, but the UI must (a) surface it well in advance, (b) never make the *only* path to act a timed one, and (c) keep "Sync"/actions reachable at all times. The assisted-callback path (a11y §3) is the human-service fallback if a user cannot self-serve before the deadline.

---

## 11. Component inventory (map to existing; new = minimal)

| Need | Existing component (component-library §) | New work |
|---|---|---|
| Summary KPI cards | `MetricCard` (§2.2) | — (reuse; 4-up) |
| Status pill | `StatusBadge` (§2.5) | **+IMS + GSTR-1A status maps (§8)** — append, don't replace |
| Urgency countdown | `DueDateChip` (composite, Phase 6B) | Formalize IMS urgency thresholds (§4); reuse across surfaces |
| Source / amendment-type pill | `Tag` (§2.4) | — |
| Money | `AmountDisplay` (§6.1) | — (owns currency a11y + Indian grouping) |
| Tax split | `TaxBreakdownTable` (§6.6) | — |
| List (admin) | `DataTable` (sortable, bulk-select) | — |
| List (mobile) | `Card` (§2.1) | **ImsInvoiceCard** composition (no new primitive) |
| Filters | `Select`, `TextInput`, chip filters | — |
| Period selector | `Select` (web) / month-pill or bottom sheet (mobile) | period MMYYYY↔display helper |
| Banners | `AlertBanner` (§4.2) | — |
| Reject reason modal | `Dialog` (web) / bottom sheet (mobile) + `TextInput` + quick-pick chips | **RejectReasonModal** composition |
| Toasts + undo | `Toast` (§4.1) | undo affordance (5s) wiring |
| Empty / error / skeleton | `EmptyState` (§4.5), `ErrorState` (§4.6), `Skeleton` (§2.7) | IMS-specific copy |
| Buttons | `PrimaryButton`/`SecondaryButton`/`GhostButton`/`IconButton` | — |
| GSTR-1A create form | `Select`, `TextInput`, `TaxBreakdownTable`-style editable rows | **Gstr1aCreateForm** composition |
| Tabs/segments (Inbox / GSTR-1A) | admin `Tabs` (ARIA tablist), mobile segmented control | — |

**No new design-system primitives are required** — IMS is built from compositions of existing components + two appended `StatusBadge` maps + formalized `DueDateChip` thresholds.

---

## 12. i18n key list (en source strings)

Namespace `gst.ims.*`. All strings via `t()`; provide hi/bn (Indic +30–40% expansion, §10 wrapping rules apply).

```
gst.ims.nav.title                = "IMS Inbox"
gst.ims.breadcrumb               = "IMS Inbox"
gst.ims.period.label             = "Period"
gst.ims.period.current           = "Current period"
gst.ims.summary.pending          = "Pending"
gst.ims.summary.accepted         = "Accepted"
gst.ims.summary.rejected         = "Rejected"
gst.ims.summary.pendingKept      = "Pending (kept)"
gst.ims.summary.total            = "{{count}} invoices"
gst.ims.sync.button              = "Sync from GSTN"
gst.ims.sync.hint                = "Pulls inward invoices from GSTN. Your existing decisions are kept."
gst.ims.sync.lastSynced          = "Last synced: {{datetime}}"
gst.ims.sync.never               = "Not synced yet"
gst.ims.sync.success             = "Synced — {{inserted}} new, {{skipped}} unchanged"
gst.ims.sync.error               = "Couldn't sync with GSTN. {{message}}"
gst.ims.sync.rateLimited         = "Too many sync attempts. Try again in a minute."
gst.ims.banner.actionRequired    = "Action required by {{date}}. {{count}} invoices still pending. Anything not actioned will be automatically accepted when GSTR-2B is generated on the 14th."
gst.ims.banner.windowPast        = "GSTR-2B for {{period}} has been generated. Pending invoices were deemed accepted. To correct a rejection, use GSTR-1A."
gst.ims.banner.learnMore         = "Learn how IMS works"
gst.ims.edu.title                = "How the Invoice Management System works"
gst.ims.edu.doingNothing         = "If you do nothing, the invoice is automatically accepted on the 14th."
gst.ims.edu.gotIt                = "Got it"
gst.ims.col.supplier             = "Supplier"
gst.ims.col.invoice              = "Invoice"
gst.ims.col.taxableValue         = "Taxable value"
gst.ims.col.tax                  = "Tax"
gst.ims.col.invoiceValue         = "Invoice value"
gst.ims.col.source               = "Source"
gst.ims.col.status               = "Status"
gst.ims.col.deadline             = "Deadline"
gst.ims.col.actions              = "Actions"
gst.ims.status.PENDING           = "Pending"
gst.ims.status.ACCEPTED          = "Accepted"
gst.ims.status.REJECTED          = "Rejected"
gst.ims.status.PENDING_KEPT      = "Pending (kept)"
gst.ims.status.deemed            = "Deemed accepted"
gst.ims.deadline.dueToday        = "Due today"
gst.ims.deadline.inDays          = "Deemed in {{count}} days"
gst.ims.deadline.a11y            = "Automatically accepted in {{count}} days if no action is taken"
gst.ims.action.accept            = "Accept"
gst.ims.action.reject            = "Reject"
gst.ims.action.keepPending       = "Keep pending"
gst.ims.action.fixViaGstr1a      = "Fix via GSTR-1A"
gst.ims.accept.success           = "Invoice {{invoiceNumber}} accepted"
gst.ims.keepPending.hint         = "You still need to accept or reject before the 14th, or it will be deemed accepted."
gst.ims.reject.title             = "Reject invoice {{invoiceNumber}}?"
gst.ims.reject.consequence       = "ITC for this invoice will not be included in GSTR-2B. The supplier must correct it via a GSTR-1A amendment."
gst.ims.reject.reasonLabel       = "Reason for rejection"
gst.ims.reject.reasonRequired    = "Please give a reason (at least 3 characters)."
gst.ims.reject.reason.price      = "Price mismatch"
gst.ims.reject.reason.notReceived= "Goods not received"
gst.ims.reject.reason.duplicate  = "Duplicate"
gst.ims.reject.reason.taxRate    = "Tax rate wrong"
gst.ims.reject.reason.notMine    = "Not my purchase"
gst.ims.reject.confirm           = "Reject invoice"
gst.ims.reject.success           = "Invoice {{invoiceNumber}} rejected"
gst.ims.bulk.select              = "Select"
gst.ims.bulk.selectedCount       = "{{count}} selected"
gst.ims.bulk.cap                 = "Select up to 100 invoices per action"
gst.ims.bulk.preflight           = "{{change}} will be {{action}}, {{skip}} skipped (already settled)"
gst.ims.bulk.result              = "{{changed}} updated, {{skipped}} skipped, {{failed}} failed"
gst.ims.undo.label               = "Undo"
gst.ims.undo.movedToKept         = "Moved back to pending-kept."
gst.ims.filter.all               = "All"
gst.ims.filter.searchPlaceholder = "Search supplier or invoice no."
gst.ims.filter.clear             = "Clear filters"
gst.ims.empty.noInvoices         = "No invoices in IMS for {{period}}."
gst.ims.empty.neverSynced        = "Sync to pull your inward invoices from GSTN for {{period}}."
gst.ims.empty.filtered           = "No {{status}} invoices match your filters."
gst.ims.error.loadFailed         = "Couldn't load IMS invoices."
gst.ims.error.alreadySettled     = "This invoice is already {{status}} and can't be {{action}}. Use GSTR-1A to correct it."
gst.ims.error.retry              = "Retry"
# GSTR-1A
gst.gstr1a.nav.title             = "GSTR-1A amendments"
gst.gstr1a.empty                 = "No amendments. Rejected invoices that need supplier correction will appear here."
gst.gstr1a.create.cta            = "Create GSTR-1A amendment"
gst.gstr1a.create.typeLabel      = "Amendment type"
gst.gstr1a.type.B2B_AMENDMENT    = "B2B amendment"
gst.gstr1a.type.B2BA             = "B2B amendment (prior period)"
gst.gstr1a.type.CDNR_AMENDMENT   = "Credit/debit note amendment"
gst.gstr1a.type.CDNRA            = "Credit/debit note amendment (prior period)"
gst.gstr1a.create.success        = "Amendment draft created"
gst.gstr1a.status.DRAFT          = "Draft"
gst.gstr1a.status.SUBMITTED      = "Submitted"
gst.gstr1a.status.FILED          = "Filed"
gst.gstr1a.col.arn               = "ARN"
gst.gstr1a.col.filed             = "Filed"
gst.gstr1a.notFiled              = "Not filed"
```

---

## 13. Formatting helpers (Indian conventions — both surfaces)

- **Period:** API `MMYYYY` ↔ display "MMM YYYY"/"Month YYYY". `"032026"` → "March 2026". Provide `periodToLabel(mmyyyy)` / `labelToPeriod`.
- **Dates:** display **DD/MM/YYYY** (lists) / **DD MMM YYYY** (detail, banners). API `invoiceDate` is ISO `YYYY-MM-DD`.
- **Amounts:** INR ₹, **Indian grouping** (₹15,00,000 / lakh-crore), Western numerals in en/hi/bn, via `AmountDisplay`. `decimal` from API — never coerce to float; render 2dp.
- **Timestamps:** `actionedAt` / last-synced in **IST**, "DD MMM YYYY, HH:mm".
- **GSTIN / invoice no:** monospace (existing GSTIN/PAN convention).

---

## 14. Self-validation

- [x] EXACT backend status vocabulary used verbatim (`PENDING`/`ACCEPTED`/`REJECTED`/`PENDING_KEPT`; actions; GSTR-1A statuses & types) — sourced from `ImsInvoice.cs` + `endpoints.md`.
- [x] All 8 IMS/GSTR-1A endpoints mapped to UI (list, get-detail, single action, bulk, summary, sync, gstr1a create, gstr1a list).
- [x] Reject-reason backend contract checked: **optional server-side**, **client-required by UX decision** (documented as client rule, not a server guard request).
- [x] Illegal transitions (ACCEPTED→REJECTED, REJECTED→ACCEPTED = 409) reflected: actions hidden + "Fix via GSTR-1A".
- [x] Deemed-acceptance education (banner + sheet + per-row "Deemed" + PENDING_KEPT-isn't-safe clarification).
- [x] Countdown urgency thresholds + colour-with-icon (never colour-only).
- [x] Empty/error/loading/skeleton states incl. GSTN sync failure + 429.
- [x] GSTR-1A amendments view (list + create + entry from rejected invoice).
- [x] a11y: composed SR labels, live-region results, ≥44pt, contrast (`neutral[500]`+, `success[700]`), focus order incl. bulk + modal trap — all cited to `accessibility-standard.md`.
- [x] Component inventory mapped to existing components; only StatusBadge maps + DueDateChip thresholds + 3 compositions are new.
- [x] i18n en source keys provided (`gst.ims.*`, `gst.gstr1a.*`).
- [x] Indian formatting (₹ Indian grouping, DD/MM/YYYY, MMYYYY period, mono GSTIN, IST) + Indic +30–40% wrapping rule referenced.
```
