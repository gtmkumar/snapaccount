# Web Admin — Permission Catalog Management (Auth/RBAC Module 1, Increment 1.1)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Scope ref: .claude/orchestrator/auth-rbac-module-scope.md §5c-B
> Module: Auth & RBAC. PLATFORM scope (SUPER_ADMIN only).
> Extends existing design system (tokens.json v2.0.0, component-library.md). No tokens replaced.

SUPER_ADMIN manages the **global permission catalog** — the master list of `resource.action`
permission definitions that populate the Role & Permission Matrix. Permissions are global
(NOT org-scoped). This screen edits the catalog metadata (code, resource, action, description,
active flag); it does **not** generate enforcement.

**CRITICAL UX caveat (must be shown inline):** a permission created here only *protects* something
once backend code references it via `[RequiresPermission("...")]`. Until wired in code, a new entry
appears in the role matrix and can be toggled/granted but enforces nothing. The screen must set this
expectation with a persistent info banner (see §4).

Route (frontend-dev): `/settings/permissions` — nav-gated by `platform.permissions.manage`.
Page component: `PermissionCatalogPage`. Sibling to `RolesPermissionsPage`.
**i18n note (per scope §5c-B):** this surface uses `@/i18n` `t()` (NOT react-i18next). Keys in §10.

---

## 1. Data dependencies (backend-agent contract, §5c-B)

| Query / mutation | Endpoint | Notes |
|---|---|---|
| List catalog | `GET /auth/permissions` (grouped by module) | reuse matrix endpoint; needs `roleCount` + `isActive` per perm |
| Create | `POST /auth/permissions` `{ name: "resource.action", description }` | validates format + uniqueness; returns created permission |
| Edit | `PUT /auth/permissions/{id}` `{ description?, isActive? }` | edit description and/or active flag |
| Deactivate | `DELETE /auth/permissions/{id}` | soft-delete; warns/blocks if `roleCount > 0` |

All mutations `[RequiresPermission("platform.permissions.manage")]`. Name regex (authoritative
server-side, mirrored client-side): `^[a-z0-9_]+(\.[a-z0-9_]+)+$`.

`roleCount` = number of `role_permission` rows referencing the perm — drives the "# roles" column
and the deactivate warning.

---

## 2. Desktop layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ PageHeader: "Permission Catalog"  subtitle: "Master list of all permissions"            │
│                                                              [ + Create permission ]    │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ℹ️  INFO BANNER (persistent, dismissible-per-session)                                    │
│    A permission only takes effect once backend code enforces it. New entries appear in   │
│    the role matrix but protect nothing until wired in code (`[RequiresPermission]`).     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Toolbar:  🔍 Search description / code        [ Module ▾ All ]     [ Active ◉ | Inactive ]│
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ▾ Organization & Members                                            5 permissions       │
│  ┌────────────────────────────────────────────────────────────────────────────────┐    │
│  │ Description              │ Code (mono)          │ # roles │ Active │ Actions      │    │
│  │ ─────────────────────────┼──────────────────────┼─────────┼────────┼──────────── │    │
│  │ View members             │ org.members.read     │   4     │ [ ●▭ ] │ ✎  ⊘         │    │
│  │ Invite members           │ org.members.invite   │   2     │ [ ●▭ ] │ ✎  ⊘         │    │
│  │ Suspend members          │ org.members.suspend  │   1     │ [ ●▭ ] │ ✎  ⊘         │    │
│  │ Remove members           │ org.members.remove   │   0     │ [ ▭○ ] │ ✎  ⊘         │    │ ← inactive (dimmed)
│  └────────────────────────────────────────────────────────────────────────────────┘    │
│  ▾ GST                                                               7 permissions       │
│  ┌────────────────────────────────────────────────────────────────────────────────┐    │
│  │ File GST returns         │ gst.returns.file     │   3     │ [ ●▭ ] │ ✎  ⊘         │    │
│  │ …                                                                                  │    │
│  └────────────────────────────────────────────────────────────────────────────────┘    │
│  ▸ Accounting · ▸ Documents · ▸ ITR · ▸ Loans · ▸ Chat · ▸ Callbacks · ▸ Platform        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Legend: `[ ●▭ ]` active · `[ ▭○ ]` inactive · `✎` edit · `⊘` deactivate.

Grouping mirrors the Role Matrix: permissions collapse into `PermissionModuleSection` per module
(resource prefix). Each section header shows the count. Within a section the rows render in a
`DataTable density="compact"` (or a simple row list) with the columns above.

---

## 3. Columns

| Column | Content | Treatment |
|---|---|---|
| Description | human label, editable | `--text-primary` |
| Code | `resource.action` | `--font-mono`, `--text-tertiary`, copy-on-click (Tooltip "Copied") |
| # roles | `roleCount` | `--text-secondary`; 0 rendered muted; links to matrix filtered by perm (optional) |
| Active | `Toggle` (existing §1.9) | inline toggle = quick `PUT {isActive}`; optimistic |
| Actions | Edit (`✎` pencil) + Deactivate (`⊘` ban) | `Button variant="ghost" size="sm"` |

Inactive rows: description + code dimmed to `--text-tertiary`, row bg unchanged, Active toggle OFF.
Inactive permissions still listed (filterable) so they can be re-activated.

---

## 4. Inert-without-code caveat banner (REQUIRED)

A persistent `InfoBanner` (NEW lightweight variant — info `Callout`) sits directly under the
PageHeader, above the toolbar. `info` semantic styling (`color.info.50` bg / `color.info.700`
text / `color.info.500` left accent + `lucide Info` icon).

> **i18n `permissions.catalog.caveat`** —
> "A permission only takes effect once backend code enforces it. New entries appear in the role
>  matrix but protect nothing until they're wired in code (`[RequiresPermission(\"…\")]`)."

- Dismissible per session (X) but reappears next visit — this is a standing expectation, not a one-time tip.
- Also surfaced (condensed) inside the Create dialog footer so the author sees it at creation time
  (`permissions.catalog.caveatShort`: "This entry won't enforce anything until referenced in backend code.").

---

## 5. Create permission — `CreatePermissionDialog` (NEW)

`Dialog size="md"`.

```
┌──────────────────────── Create permission ─────────────────────────┐
│  Resource *           Action *                                       │
│  [ gst            ▾]  [ returns.file              ]                   │
│   (select existing     (free text; dot-notation allowed)             │
│    OR type new)                                                      │
│                                                                      │
│  Resulting code (live preview):                                      │
│  ┌──────────────────────────────┐                                   │
│  │  gst.returns.file             │  ✓ valid                          │  ← mono, updates live
│  └──────────────────────────────┘                                   │
│                                                                      │
│  Description *                                                       │
│  [ File GST returns on behalf of a client                       ]    │
│                                                                      │
│  ℹ️ This entry won't enforce anything until referenced in backend    │
│     code. (caveatShort)                                              │
│                                                                      │
│                                  [ Cancel ]   [ Create permission ]  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Resource** = combobox: pick an existing resource (module prefix already in catalog —
  `org`, `gst`, `accounting`, `document`, `chat`, `callback`, `itr`, `loan`, `platform`, `report`,
  `subscription`) OR type a new one. Lowercased; `[a-z0-9_]+`.
- **Action** = free text; may itself contain dots (e.g. `returns.file`) to support nested actions.
- **Live code preview** = `resource + "." + action`, rendered in `--font-mono`. Validates against
  `^[a-z0-9_]+(\.[a-z0-9_]+)+$` on every keystroke:
  - valid → green check + `permissions.create.valid`.
  - invalid → `error.500` hint `permissions.create.invalidFormat` ("Use lowercase dot-notation, e.g. `gst.returns.file`").
  - The preview chip and the Create button reflect validity (button disabled while invalid/empty).
- **Description** required.
- Submit → `POST /auth/permissions { name, description }`.
  - success → `toast.success` `permissions.create.success` ("Permission `{code}` created") +
    invalidate catalog + matrix queries; new row appears in its module section (auto-expand + scroll-to).
  - **duplicate (409)** → inline field error on the code preview `permissions.create.duplicate`
    ("A permission with this code already exists.") — dialog stays open.
  - format rejected server-side (defensive) → same invalid-format hint.

---

## 6. Edit permission — `EditPermissionDialog` (NEW)

`Dialog size="md"`. Code is **read-only** (mono, with a note `permissions.edit.codeImmutable`
"The code can't be changed. Deactivate and create a new one if it's wrong."). Editable: Description
+ Active toggle. Submit → `PUT /auth/permissions/{id}`. Success toast `permissions.edit.success`.

---

## 7. Deactivate — confirm + reference warning

`⊘` action → `Dialog` confirm (`Confirm.Destructive` style but reversible wording — it's a
soft-delete / deactivate, not a hard delete).

- If `roleCount === 0`:
  > `permissions.deactivate.confirm` — "Deactivate `{code}`? It will be hidden from new grants.
  >  You can reactivate it later."
- If `roleCount > 0` (warn):
  > `permissions.deactivate.warnReferenced` — "`{code}` is currently granted to **{n} role(s)**.
  >  Deactivating won't remove existing grants but the permission will stop appearing for new grants
  >  and (once enforced) may affect those roles. Continue?"
  - Show the count prominently (`warning` tint). Per backend §5c-B the server may *block* instead of
    warn — if it returns a block error, surface `permissions.deactivate.blocked`
    ("Can't deactivate — `{code}` is still used by {n} role(s). Remove it from those roles first.")
    with a link to the matrix.
- Confirm → `DELETE /auth/permissions/{id}` → row flips to inactive (or removed from active filter) +
  `toast.success` `permissions.deactivate.success`.

---

## 8. States

| State | Treatment |
|---|---|
| Loading | `Skeleton variant="list"` — 3 module headers + 4 rows each |
| Empty (no permissions at all) | `EmptyState` `permissions.empty.title` "No permissions yet" + "Create permission" CTA |
| Empty (filter no match) | inline "No permissions match '{q}'" + Clear filters |
| Error (load) | `ErrorBoundary scope="route"` + retry |
| Create success | `toast.success` + auto-expand module + scroll-to new row |
| Duplicate name | inline error in Create dialog (per §5) |
| Invalid format | live inline hint + disabled submit (per §5) |
| Deactivate (referenced) | warning confirm with role count (per §7) |
| Mutation error (generic) | `toast.error` `permissions.error.generic`, optimistic revert |
| 403 (non-super-admin reached here) | route guard redirects; defensively show `permissions.error.forbidden` |

---

## 9. Components used

| Region | Component | New? |
|---|---|---|
| Header | `PageHeader` | existing |
| Caveat banner | `InfoBanner` / `Callout variant="info"` | NEW (lightweight info callout) |
| Search | native `input[type=search]` + `Search` icon | existing pattern |
| Module filter | `Select` ("Module ▾") | existing |
| Active filter | `SegmentedControl` (Active \| Inactive \| All) | reuse Module-1 SegmentedControl |
| Create button | `Button variant="primary"` + `Plus` | existing |
| Module group | `PermissionModuleSection` | reuse from Role Matrix (Module 1) |
| Rows | `DataTable density="compact"` | existing |
| Code cell | mono text + copy-on-click + `Tooltip` | existing |
| Active toggle | `Toggle` (§1.9) | existing |
| Row actions | `Button variant="ghost" size="sm"` (Edit/Deactivate) | existing |
| Create dialog | `CreatePermissionDialog` | NEW |
| - Resource combobox | `Combobox` (reuse OrgSwitcher combobox base) | reuse |
| - Code preview | mono chip + validity icon | NEW (in-dialog) |
| Edit dialog | `EditPermissionDialog` | NEW |
| Deactivate confirm | `Dialog` confirm + warning | existing |
| Loading | `Skeleton variant="list"` | existing |
| Empty | `EmptyState` | existing |
| Errors | `ErrorBoundary scope="route"` | existing |
| Toasts | `Toast` (success/error) | existing |

Consistency with Role Matrix: same `PermissionModuleSection` grouping, same mono treatment for
codes, same `Toggle`, same module accent colors (`color.module.*`). The catalog is the "source"
list; the matrix is where those permissions get granted to roles.

---

## 10. i18n keys (namespace `permissions.catalog.*` / `permissions.*`) — for frontend-dev (`@/i18n` `t()`)

```
permissions.catalog.title                 = "Permission Catalog"
permissions.catalog.subtitle              = "Master list of all permissions"
permissions.catalog.caveat                = "A permission only takes effect once backend code enforces it. New entries appear in the role matrix but protect nothing until they're wired in code."
permissions.catalog.caveatShort           = "This entry won't enforce anything until referenced in backend code."
permissions.catalog.search                = "Search description or code…"
permissions.catalog.filterModule          = "Module"
permissions.catalog.filterModule.all      = "All modules"
permissions.catalog.filterActive          = "Active"
permissions.catalog.filterInactive        = "Inactive"
permissions.catalog.filterAll             = "All"
permissions.catalog.col.description        = "Description"
permissions.catalog.col.code               = "Code"
permissions.catalog.col.roles              = "# roles"
permissions.catalog.col.active             = "Active"
permissions.catalog.col.actions            = "Actions"
permissions.catalog.moduleCount            = "{count} permissions"
permissions.catalog.codeCopied             = "Copied"

permissions.create.cta                     = "Create permission"
permissions.create.title                   = "Create permission"
permissions.create.resource                = "Resource"
permissions.create.resourceHint            = "Pick an existing resource or type a new one"
permissions.create.action                  = "Action"
permissions.create.actionHint              = "e.g. returns.file"
permissions.create.codePreview             = "Resulting code"
permissions.create.description             = "Description"
permissions.create.valid                   = "Valid code"
permissions.create.invalidFormat           = "Use lowercase dot-notation, e.g. gst.returns.file"
permissions.create.duplicate               = "A permission with this code already exists."
permissions.create.submit                  = "Create permission"
permissions.create.success                 = "Permission {code} created"

permissions.edit.title                     = "Edit permission"
permissions.edit.codeImmutable             = "The code can't be changed. Deactivate and create a new one if it's wrong."
permissions.edit.description               = "Description"
permissions.edit.active                    = "Active"
permissions.edit.submit                    = "Save changes"
permissions.edit.success                   = "Permission updated"

permissions.deactivate.cta                 = "Deactivate"
permissions.deactivate.confirm             = "Deactivate {code}? It will be hidden from new grants. You can reactivate it later."
permissions.deactivate.warnReferenced      = "{code} is currently granted to {count} role(s). Deactivating won't remove existing grants but the permission will stop appearing for new grants and (once enforced) may affect those roles. Continue?"
permissions.deactivate.blocked             = "Can't deactivate — {code} is still used by {count} role(s). Remove it from those roles first."
permissions.deactivate.success             = "Permission deactivated"

permissions.empty.title                    = "No permissions yet"
permissions.empty.desc                     = "Create your first permission to populate the role matrix."
permissions.empty.noMatch                  = "No permissions match '{query}'"
permissions.empty.clear                    = "Clear filters"

permissions.error.generic                  = "Something went wrong. Please try again."
permissions.error.forbidden                = "You don't have permission to manage the catalog."

common.cancel                              = "Cancel"
common.copy                                = "Copy"
```

(Values are English defaults; Sarvam languages added by frontend-dev. Containers must tolerate ±40% length.)

---

## 11. Tokens used (all from tokens.json — no new tokens)

- Surfaces: `--surface-base` (page), `--surface-raised` (cards/tables), `--surface-sunken` (inputs)
- Text: `--text-primary` (descriptions), `--text-secondary` (# roles), `--text-tertiary` (codes, inactive rows)
- Info banner: `color.info.50` bg / `color.info.700` text / `color.info.500` accent + `Info` icon
- Brand: `color.brand.500` (primary button, active toggle ON track)
- Module accents: `color.module.*` (section headers, consistent w/ matrix)
- Semantic: `color.error.500` (invalid format, deactivate destructive), `color.warning.500` (referenced warning), `color.success.500` (valid check, success toast)
- Neutral: `neutral.200/400/700` (inactive/disabled toggle)
- Mono: `typography.fontFamily.mono` (all permission codes + live preview)
- Radius: `radius.lg` (cards), `radius.md` (inputs/dialog), `radius.full` (toggle, chips)
- Shadow: `shadow.sm` (cards), `shadow.md` (dialog)
- Spacing: `spacing.4` row/section padding, `spacing.3` gaps, `spacing.6` section gaps

## 12. Accessibility

- Active toggles: `role="switch"`, `aria-checked`, `aria-label="Active: {code}"`.
- Code copy-on-click also reachable by keyboard (Enter/Space on the focusable code cell), announces "Copied" via `aria-live`.
- Live code-preview validity announced via `aria-live="polite"` (valid/invalid) so screen-reader users get instant feedback while typing.
- Module sections use the disclosure pattern (`aria-expanded`); filter `SegmentedControl` is a `radiogroup`.
- Caveat banner is `role="status"` (not alert — it's informational, persistent).
- Destructive deactivate confirm focus-trapped; primary action is clearly labeled; role-count warning conveyed by text + icon, not color alone.
- All interactive targets ≥ 44×44 on touch (mobile-web). Contrast: inactive `--text-tertiary` on `--surface-raised` verified ≥ 4.5:1; toggle track vs surface ≥ 3:1.

## 13. Responsive

- ≥1024px: full table as drawn.
- 768–1023px: `DataTable` drops "# roles" into a sub-line under the description; actions collapse into a `⋯` menu.
- <768px (mobile-web): each permission renders as a stacked card (description, mono code, role count chip, active toggle, actions row); module sections remain collapsible; Create dialog full-screen sheet.
