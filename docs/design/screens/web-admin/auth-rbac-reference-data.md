# Web Admin — Reference Data (Master Data) Management (Auth/RBAC Module 1, Increment 1.4 Phase A)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Scope ref: .claude/orchestrator/auth-rbac-module-scope.md §5f Phase A
> Module: Auth & RBAC. PLATFORM scope (SUPER_ADMIN only).
> Extends existing design system (tokens.json v2.0.0, component-library.md). No tokens replaced.
> Pattern sibling: Permission Catalog screen (Increment 1.1) — same table/dialog conventions.

SUPER_ADMIN manages the lookup data behind the app's dropdowns. Backed by a single generic table
`auth.reference_data` with five categories: **Languages, User Types, Genders, States, Countries**.
STATE rows carry a `parent_code` → a COUNTRY code (the FK/dropdown principle). This is the master
data; Phase B's user/profile dropdowns are populated from it.

Route (frontend-dev): `/settings/reference-data` — nav-gated by `platform.refdata.manage`.
Page component: `ReferenceDataPage`. Sibling to `PermissionCatalogPage`.
**i18n:** `@/i18n` `t()` (NOT react-i18next), keys under `refdata.*` (§9).

---

## 1. Data dependencies (backend-agent contract, §5f)

| Query / mutation | Endpoint | Notes |
|---|---|---|
| List by category | `GET /auth/reference-data?category=&activeOnly=` | drives the table for the selected category |
| Country options (STATE parent) | `GET /auth/reference-data?category=COUNTRY&activeOnly=true` | sources the parent dropdown |
| Create | `POST /auth/reference-data` `{ category, code, name, parentCode?, sortOrder, isActive }` | parentCode required for STATE |
| Edit | `PUT /auth/reference-data/{id}` `{ name?, parentCode?, sortOrder?, isActive? }` | code immutable (see §6) |
| Delete/Deactivate | `DELETE /auth/reference-data/{id}` | 409 if referenced (in-use guard) |

Categories enum: `LANGUAGE | USER_TYPE | GENDER | STATE | COUNTRY`. Uniqueness is `(category, code)`
where not soft-deleted. Code format: short uppercase/lowercase token (see §5 validation).

---

## 2. Desktop layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ PageHeader: "Reference Data"  subtitle: "Manage the lookup data behind app dropdowns"   │
│                                                                  [ + Add entry ]        │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Category:  [ Languages | User Types | Genders | States | Countries ]   ← SegmentedControl│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Toolbar:  🔍 Search name / code              [ Active ◉ | Inactive | All ]               │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ DataTable (selected category = "States" shown)                                           │
│  Name              │ Code (mono) │ Country (parent) │ Active │ Sort │ Actions             │
│  ──────────────────┼─────────────┼──────────────────┼────────┼──────┼──────────────────── │
│  Karnataka         │ KA          │ India (IN)       │ [ ●▭ ] │  12  │ ✎  🗑                │
│  Maharashtra       │ MH          │ India (IN)       │ [ ●▭ ] │  20  │ ✎  🗑                │
│  Delhi             │ DL          │ India (IN)       │ [ ●▭ ] │   7  │ ✎  🗑                │
│  Lakshadweep (UT)  │ LD          │ India (IN)       │ [ ▭○ ] │  36  │ ✎  🗑                │ ← inactive (dimmed)
│  …                                                                                       │
│ Pagination 25/50/100                                                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The **Country (parent)** column is shown **only** when the selected category is **States**.
For Languages / User Types / Genders / Countries the table is: Name · Code · Active · Sort · Actions.

Switching category via the `SegmentedControl` refetches the table for that category and resets
search/active filter to defaults. The active category is reflected in the URL query
(`?category=STATE`) so it's linkable/refresh-safe.

---

## 3. Columns

| Column | Content | Treatment |
|---|---|---|
| Name | display label (editable) | `--text-primary` |
| Code | category code (e.g. `KA`, `en`, `MALE`) | `--font-mono`, `--text-tertiary`, copy-on-click (Tooltip "Copied") |
| Country (parent) | STATE only — resolved name + code `India (IN)` | `--text-secondary`; parent code in mono |
| Active | `Toggle` (§1.9) | inline = quick `PUT {isActive}`; optimistic |
| Sort order | integer | `--text-secondary`, right-aligned, tabular-nums; table sortable by this |
| Actions | Edit (`✎`) + Delete/Deactivate (`🗑`) | `Button variant="ghost" size="sm"` |

Default sort = `sortOrder` ascending, then Name. Inactive rows: name + code dimmed to
`--text-tertiary`, Active toggle OFF; still listed (filterable) so they can be reactivated.

---

## 4. Add / Edit dialog — `ReferenceDataDialog` (NEW, create + edit)

`Dialog size="md"`. Same dialog handles Create and Edit.

```
┌──────────────────────── Add entry — States ─────────────────────────┐
│  Category *        [ States                                      ]    │  ← locked to current tab
│  Name *            [ Karnataka                                   ]    │
│  Code *            [ KA          ]   ✓ valid                          │  ← mono, validated
│  Country *         [ India (IN)                              ▾ ]      │  ← Combobox, STATE-only
│                      (sourced from COUNTRY category)                  │
│  Sort order        [ 12  ]                                            │
│  Active            [ ●▭ ]                                              │
│                                                                      │
│                                   [ Cancel ]   [ Save entry ]        │
└──────────────────────────────────────────────────────────────────────┘
```

- **Category** — prefilled from the current tab and **read-only** (you add to the category you're
  viewing; switch tabs to add elsewhere). Shown for context.
- **Name** — required, text.
- **Code** — required; validated for format + uniqueness within the category (see §5). On Edit the
  code is **read-only** (immutable — note `refdata.edit.codeImmutable`); changing a code would break
  references, so deactivate + create a new one instead.
- **Country (parent)** — **STATE category only**. `Combobox` sourced from
  `GET /auth/reference-data?category=COUNTRY&activeOnly=true`, showing `Name (CODE)`. Required for STATE.
  Hidden for all other categories. Maps to `parentCode`.
- **Sort order** — integer (default 0); controls dropdown ordering app-wide.
- **Active** — `Toggle` (default ON for new entries).
- Submit → `POST` (create) / `PUT` (edit).
  - success → `toast.success` `refdata.create.success` / `refdata.edit.success`; invalidate the
    category query (and the COUNTRY query if a country changed — states depend on it); new row
    appears sorted into place.
  - **duplicate (409)** → inline error on the Code field `refdata.create.duplicate`
    ("This code already exists in {category}.") — dialog stays open.
  - **invalid parent (STATE, parentCode missing/unknown)** → inline error `refdata.create.parentRequired`.

---

## 5. Code validation

- Required, trimmed, no spaces. Client mirror of the server rule; exact regex per backend, expected
  pattern: short alphanumeric token, e.g. `^[A-Za-z0-9_-]{1,20}$` (languages lowercase ISO like `en`,
  states 2-letter like `KA`, genders like `MALE`). Backend is authoritative.
- Live validity indicator next to the field: green check `refdata.create.valid` / `error.500` hint
  `refdata.create.invalidCode` ("Use a short code with no spaces, e.g. KA"). Save disabled while invalid/empty.
- Uniqueness is per `(category, code)` — surfaced as the 409 duplicate inline error above.

---

## 6. Delete / Deactivate — confirm + in-use guard

`🗑` action → `Dialog` confirm.

- **Default (deactivate / soft-delete):**
  > `refdata.delete.confirm` — "Remove `{name}` ({code}) from {category}? It will stop appearing in
  >  dropdowns. Existing records that already use it are unaffected."
- **In-use (server returns 409):** if the entry is referenced (e.g. a STATE used by a user profile,
  a COUNTRY referenced by a STATE), the delete is **blocked**:
  > `refdata.delete.inUse` — "Can't delete `{code}` — it's still in use. Deactivate it instead to
  >  hide it from new dropdowns without breaking existing records."
  - Offer a **Deactivate instead** action in the same dialog (calls `PUT {isActive:false}`),
    so the admin has a safe path. This is the recommended pattern over hard delete.
- A COUNTRY that is the parent of any active STATE: warn before deactivating
  (`refdata.delete.countryHasStates` "{count} states belong to this country and will be hidden too.").
- Confirm → `DELETE /auth/reference-data/{id}` → row removed/flipped + `toast.success`
  `refdata.delete.success`. On 409 → switch the dialog to the in-use message (no destructive action taken).

---

## 7. States

| State | Treatment |
|---|---|
| Loading | `Skeleton variant="dataTableDense"` |
| Empty (category has no entries) | `EmptyState` `refdata.empty.title` ("No {category} entries yet") + "Add entry" CTA |
| Empty (filter no match) | inline "No entries match '{q}'" + Clear filters |
| Error (load) | `ErrorBoundary scope="route"` + retry |
| Create/edit success | `toast.success` + row sorted into place |
| Duplicate code | inline error in dialog (per §4/§5) |
| Invalid code format | live inline hint + disabled Save (per §5) |
| In-use delete (409) | dialog switches to in-use message + "Deactivate instead" (per §6) |
| Inline toggle error | `toast.error` `refdata.error.generic`, optimistic revert |
| 403 (non-super-admin reached here) | route guard redirects; defensively `refdata.error.forbidden` |

---

## 8. Component breakdown

| Region | Component | New? |
|---|---|---|
| Header | `PageHeader` | existing |
| Add entry | `Button variant="primary"` + `Plus` | existing |
| Category switch | `SegmentedControl` (Languages\|User Types\|Genders\|States\|Countries) | reuse (Module 1) |
| Search | native `input[type=search]` + `Search` icon | existing pattern |
| Active filter | `SegmentedControl` (Active\|Inactive\|All) | reuse (Incr 1.1 pattern) |
| Table | `DataTable density="compact"` | existing |
| Code cell | mono text + copy-on-click + `Tooltip` | existing (Incr 1.1) |
| Active toggle | `Toggle` (§1.9) | existing |
| Row actions | `Button variant="ghost" size="sm"` (Edit/Delete) | existing |
| Add/Edit dialog | `ReferenceDataDialog` (create+edit) | NEW |
| - Country parent | `Combobox` (reuse OrgSwitcher base; STATE only) | reuse |
| - Code validity | mono field + validity icon | reuse (Incr 1.1 preview pattern) |
| Delete confirm | `Dialog` confirm + in-use guard + "Deactivate instead" | existing |
| Loading | `Skeleton variant="dataTableDense"` | existing |
| Empty | `EmptyState` | existing |
| Errors | `ErrorBoundary scope="route"` | existing |
| Toasts | `Toast` success/error | existing |

No new tokens and only one new composition component (`ReferenceDataDialog`). Visually and
behaviorally consistent with the Permission Catalog: same `SegmentedControl` category/active
patterns, mono codes with copy, inline `Toggle`, the same delete/deactivate confirm conventions.

---

## 9. i18n keys (`refdata.*`) — for frontend-dev (`@/i18n` `t()`)

```
refdata.title                    = "Reference Data"
refdata.subtitle                 = "Manage the lookup data behind app dropdowns"
refdata.addEntry                 = "Add entry"

refdata.category.language        = "Languages"
refdata.category.userType        = "User Types"
refdata.category.gender          = "Genders"
refdata.category.state           = "States"
refdata.category.country         = "Countries"

refdata.search                   = "Search name or code…"
refdata.filter.active            = "Active"
refdata.filter.inactive          = "Inactive"
refdata.filter.all               = "All"

refdata.col.name                 = "Name"
refdata.col.code                 = "Code"
refdata.col.country              = "Country"
refdata.col.active               = "Active"
refdata.col.sortOrder            = "Sort order"
refdata.col.actions              = "Actions"
refdata.codeCopied               = "Copied"

refdata.dialog.addTitle          = "Add entry — {category}"
refdata.dialog.editTitle         = "Edit entry — {category}"
refdata.field.category           = "Category"
refdata.field.name               = "Name"
refdata.field.code               = "Code"
refdata.field.country            = "Country"
refdata.field.countryHint        = "Sourced from the Countries list"
refdata.field.sortOrder          = "Sort order"
refdata.field.active             = "Active"

refdata.create.valid             = "Valid code"
refdata.create.invalidCode       = "Use a short code with no spaces, e.g. KA"
refdata.create.duplicate         = "This code already exists in {category}."
refdata.create.parentRequired    = "Select a country for this state."
refdata.create.submit            = "Save entry"
refdata.create.success           = "{name} added"
refdata.edit.codeImmutable       = "The code can't be changed. Deactivate and create a new one if it's wrong."
refdata.edit.success             = "Entry updated"

refdata.delete.cta               = "Delete"
refdata.delete.confirm           = "Remove {name} ({code}) from {category}? It will stop appearing in dropdowns. Existing records that already use it are unaffected."
refdata.delete.inUse             = "Can't delete {code} — it's still in use. Deactivate it instead to hide it from new dropdowns without breaking existing records."
refdata.delete.deactivateInstead = "Deactivate instead"
refdata.delete.countryHasStates  = "{count} states belong to this country and will be hidden too."
refdata.delete.success           = "Entry removed"

refdata.empty.title              = "No {category} entries yet"
refdata.empty.desc               = "Add the first entry to populate this dropdown."
refdata.empty.noMatch            = "No entries match '{query}'"
refdata.empty.clear              = "Clear filters"

refdata.error.generic            = "Something went wrong. Please try again."
refdata.error.forbidden          = "You don't have permission to manage reference data."

common.cancel                    = "Cancel"
```

(English defaults; Sarvam languages added by frontend-dev. Containers tolerate ±40% length.)

---

## 10. Tokens used (all from tokens.json — no new tokens)

- Surfaces: `--surface-base` (page), `--surface-raised` (table/cards), `--surface-sunken` (inputs)
- Text: `--text-primary` (names), `--text-secondary` (parent, sort), `--text-tertiary` (codes, inactive rows)
- Brand: `color.brand.500` (primary button, active toggle ON, selected segment)
- Semantic: `color.error.500` (invalid code, destructive delete), `color.warning.500` (country-has-states / in-use), `color.success.500` (valid check, success toast)
- Neutral: `neutral.200/400/700` (inactive/disabled toggle)
- Mono: `typography.fontFamily.mono` (all codes + parent code)
- Radius: `radius.lg` (cards), `radius.md` (inputs/dialog), `radius.full` (segments, toggle)
- Shadow: `shadow.sm` (cards), `shadow.md` (dialog)
- Spacing: `spacing.4` row/field padding, `spacing.3` gaps, `spacing.6` section gaps

## 11. Accessibility

- Category `SegmentedControl` = `radiogroup`; active category reflected in URL + announced.
- Active toggles: `role="switch"`, `aria-checked`, `aria-label="Active: {name}"`.
- Code copy-on-click keyboard-reachable (Enter/Space on focusable code cell), "Copied" via `aria-live`.
- Live code-validity announced via `aria-live="polite"` while typing.
- Country `Combobox` (STATE) has a visible label + format hint via `aria-describedby`; sort-order
  input `inputmode="numeric"`.
- Delete confirm focus-trapped; in-use 409 swaps to a non-destructive message with a clearly labeled
  "Deactivate instead" action; warning conveyed by text + icon, not color alone.
- All interactive targets ≥ 44×44 on touch (mobile-web). Contrast: inactive `--text-tertiary` on
  `--surface-raised` ≥ 4.5:1; toggle track vs surface ≥ 3:1.

## 12. Responsive

- ≥1024px: full table as drawn.
- 768–1023px: `DataTable` folds Sort order (and Country, for States) into a sub-line under Name;
  actions collapse to a `⋯` menu.
- <768px (mobile-web): each entry renders as a stacked card (Name, mono code, parent chip for States,
  active toggle, actions row); category `SegmentedControl` becomes a horizontally scrollable pill row
  or a `Select`; Add/Edit dialog is a full-screen sheet.
