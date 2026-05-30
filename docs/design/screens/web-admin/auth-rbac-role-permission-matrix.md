# Web Admin — Role & Permission Matrix (Auth/RBAC Module 1)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Module: Auth & RBAC (multi-tenant, custom roles, constrained delegation)
> Pattern source: Dribbble "HRIS — Permissions settings screen redesign" archetype
> Extends existing design system (tokens.json v2.0.0, component-library.md). No tokens replaced.

This screen is the centerpiece of the module. It implements the locked product decision:
roles are **data, not hard-coded**; admins toggle permissions per module in a matrix.
It must visibly enforce the **constrained-delegation rule** — permissions the current
user cannot grant (because they are not in the caller's own effective set) render
**disabled / greyed with a tooltip**, server-truthed via `GET /auth/me/grantable-permissions`.

Route (frontend-dev): `/settings/roles` (gated by `org.roles.read`).
Page component: `RolesPermissionsPage`. Lives alongside existing `TeamPage` in `pages/team/`
or a new `pages/roles/` folder — frontend-dev's call.

---

## 1. Data dependencies (consumed APIs — backend-agent contract)

| Query | Endpoint | Drives |
|---|---|---|
| Role list | `GET /auth/org/roles` | left rail; includes `isSystem`, `memberCount`, `organizationId` |
| Permission catalog | `GET /auth/permissions` (grouped by module) | right matrix sections |
| Role's grants | `GET /auth/org/roles/{id}/permissions` | toggle ON/OFF initial state |
| **Grantable set** | `GET /auth/me/grantable-permissions` | **which toggles are enabled vs greyed (delegation)** |
| Save grants | `PUT /auth/org/roles/{id}/permissions` | dirty-state save bar |
| Create role | `POST /auth/org/roles` | "Create role" flow |
| Rename/desc | `PUT /auth/org/roles/{id}` | inline edit |
| Delete | `DELETE /auth/org/roles/{id}` | role menu (custom roles only) |

Effective permission set for the *target role* = its granted rows. The **caller's** grantable
set bounds what they may toggle. A toggle is interactive **iff** its permission key ∈ grantable set.

---

## 2. Desktop layout (≥1024px) — two-pane master/detail

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ PageHeader: "Roles & Permissions"   subtitle: "Define what each role can do in your org"│
│                                                          [Org switcher ▼ (SUPER_ADMIN)] │
├───────────────────────────┬────────────────────────────────────────────────────────────┤
│  LEFT RAIL (320px)         │  RIGHT PANE (fluid)                                          │
│  ┌──────────────────────┐  │  ┌────────────────────────────────────────────────────────┐│
│  │ 🔍 Search roles…      │  │  │ Role: HR Manager        [System ◯]  •  6 members         ││
│  └──────────────────────┘  │  │ "Manages employees and leave"           [⋯ menu]        ││
│  [ + Create role ]         │  │ ──────────────────────────────────────────────────────  ││
│  ──────────────────────    │  │ 🔍 Filter permissions…       [Expand all] [Collapse all]││
│  ROLE LIST (selectable)    │  │ ──────────────────────────────────────────────────────  ││
│  ▸ ● ORG ADMIN   system    │  │ ▾ Organization & Members        [ Select all in module ]││
│      14 members            │  │   ┌──────────────────────────────────────────────────┐  ││
│  ▸ ○ HR Manager  (sel)     │  │   │ View members          org.members.read     [ ●▭ ]│  ││
│      6 members  • custom   │  │   │ Invite members        org.members.invite   [ ●▭ ]│  ││
│  ▸ ○ CA Reviewer           │  │   │ Suspend members  🔒    org.members.suspend  [ ▭○ ]│  ││ ← greyed/disabled
│      3 members  • custom   │  │   │ Remove members   🔒    org.members.remove   [ ▭○ ]│  ││ ← greyed/disabled
│  ▸ ○ Data Entry            │  │   └──────────────────────────────────────────────────┘  ││
│      9 members  • custom   │  │ ▾ Roles & Permissions           [ Select all in module ]││
│                            │  │   │ View roles            org.roles.read       [ ●▭ ]│   ││
│                            │  │   │ Create roles          org.roles.create     [ ▭○ ]│🔒 ││
│                            │  │ ▸ GST (collapsed)               2 of 7 granted          ││
│                            │  │ ▸ Accounting (collapsed)        0 of 5 granted          ││
│                            │  │ ▸ Documents (collapsed)         3 of 4 granted          ││
│                            │  │ ▸ ITR / Loans / Chat / Callbacks …                      ││
│                            │  └────────────────────────────────────────────────────────┘│
└───────────────────────────┴────────────────────────────────────────────────────────────┘
   ▼ appears only when dirty ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ DIRTY SAVE BAR (sticky, bottom)                                                          │
│  ● 5 changes unsaved   (3 enabled, 2 disabled)        [ Discard ]   [ Save changes ]    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Legend: `[ ●▭ ]` = toggle ON · `[ ▭○ ]` = toggle OFF · `🔒` = not grantable by current user (disabled).

---

## 3. Components used (all existing unless flagged NEW)

| Region | Component | Notes |
|---|---|---|
| Header | `PageHeader` | existing |
| Org switcher | `OrgSwitcher` (NEW, SUPER_ADMIN only) | see components.md; hidden for ORG_ADMIN |
| Left search | native `input[type=search]` w/ `Search` lucide icon | matches TeamPage search pattern |
| Create role | `Button variant="primary"` + `lucide Plus` | opens `CreateRoleDialog` (NEW) |
| Role list item | `RoleListItem` (NEW) | radio-selectable row; `RoleChip` + member count + `system`/`custom` tag |
| Role header | `RoleChip` + `Badge` (System) + `⋯` `DropdownMenu` | menu: Rename, Duplicate, Delete (custom only) |
| Permission filter | native search input | client-side filter across all module sections |
| Module section | `PermissionModuleSection` (NEW) | `Collapsible`/`Disclosure`; header shows "N of M granted" + "Select all in module" |
| Permission row | `PermissionRow` (NEW) | label + perm-key (mono, `--text-tertiary`) + `Switch` |
| Toggle | `Switch` (existing `Toggle`, §1.9) | `disabled` variant for non-grantable |
| Disabled hint | `Tooltip` (existing) | on the lock badge + disabled switch |
| Save bar | `DirtySaveBar` (NEW) | sticky bottom; shows count, Discard, Save |
| Loading | `Skeleton variant="list"` (rail) + new matrix skeleton | |
| Empty | `EmptyState variant="team"`/roles | no roles yet |
| Errors | `ErrorBoundary scope="pane"` per pane | rail and matrix isolated |

---

## 4. The delegation rule — disabled/greyed rendering (CRITICAL)

A permission row is **interactive** only when its `permissionKey` is present in
`GET /auth/me/grantable-permissions`. Otherwise it renders **disabled**:

Visual treatment of a non-grantable permission row:
- Row text color drops to `--text-tertiary` (≥ 4.5:1 on `--surface-raised`, still legible).
- A small `lucide Lock` icon (14px, `--text-tertiary`) appears between the label and the perm key.
- The `Switch` uses its `disabled` state: track `--neutral-200` (light) / `--neutral-700` (dark),
  thumb `--neutral-400`, `cursor: not-allowed`, `aria-disabled="true"`, NOT focusable via tab.
- The switch still shows the role's *current* grant value (if the role already has it on, the
  disabled switch reads ON but cannot be changed) — never silently hide existing grants.
- **Tooltip** (hover + focus + long-press on touch) on the lock icon AND the switch:
  > "You can't grant this permission because it isn't part of your own access. Ask an
  >  administrator who holds **{permission label}** to assign it."
  i18n key: `roles.matrix.notGrantable` with `{permission}` interpolation.

"Select all in module" obeys the rule: it toggles ON only the **grantable** rows in that module;
non-grantable rows are skipped and the control's label clarifies via tooltip
(`roles.matrix.selectAllGrantableOnly`: "Selects only the permissions you're allowed to grant").
If a module contains zero grantable permissions, "Select all in module" is itself disabled with the same tooltip.

**Important:** This is UI assistance only. Scope §4 requires the server to be authoritative —
the matrix must still send the PUT and surface a server 403 gracefully (see §6 error state).

System roles (`isSystem === true`, e.g. ORG ADMIN, CA baseline): the entire matrix renders
**read-only** for ORG_ADMIN (every switch disabled, no lock icon — instead a banner:
`roles.matrix.systemReadOnly` "System roles can't be edited. Duplicate it to make a custom role."
with a `Duplicate` button). SUPER_ADMIN may edit system/global roles via the platform.

---

## 5. Interaction & dirty-state model

1. Selecting a role in the left rail loads its grants (skeleton in matrix while fetching).
2. Toggling any **grantable** switch updates local draft state and increments the change counter.
3. The `DirtySaveBar` slides up (200ms, 0ms under `prefers-reduced-motion`) the moment
   draft ≠ server state. Shows "{n} changes unsaved".
4. **Discard** reverts draft to last-saved snapshot; bar slides away.
5. **Save changes** calls `PUT /auth/org/roles/{id}/permissions` with the full grant set.
   - Optimistic: bar shows spinner; on success → `toast.success('Permissions updated')`,
     invalidate `['roles', id, 'permissions']`, bar hides.
   - Navigating away (route change / selecting another role) while dirty → `Confirm` dialog
     ("Discard unsaved changes?"). Reuses existing `Dialog` confirm.
6. Keyboard: switches reachable by Tab; Space toggles; module headers are `button`s,
   Enter/Space expands. Save bar buttons in tab order last. `cmd/ctrl+S` triggers Save when dirty.

---

## 6. States

| State | Treatment |
|---|---|
| Loading (rail) | `Skeleton variant="list"` 6 rows |
| Loading (matrix) | grouped skeleton: 4 section headers + 3 rows each, shimmer |
| Empty (no roles) | `EmptyState` "No roles yet" + primary CTA "Create your first role" |
| Empty (no perm matches filter) | inline "No permissions match '{q}'" with Clear |
| Disabled (delegation) | per §4 — greyed switch + lock + tooltip |
| Read-only (system role / no `org.permissions.grant`) | banner + all switches disabled, no save bar |
| Saving | save bar spinner, buttons disabled |
| Save error (generic) | `toast.error`, bar stays, changes preserved |
| **Save error 403 (escalation rejected server-side)** | `toast.error('Some changes were rejected: you can't grant permissions beyond your own access.')`; matrix highlights the rejected rows (rose left-border `--error-500`, 3px) and reverts only those rows; non-rejected changes persist. i18n `roles.matrix.escalationRejected`. |
| Conflict (role changed elsewhere, 409) | banner "This role was updated by someone else." + Reload button |

---

## 7. Create role flow — `CreateRoleDialog` (NEW)

`Dialog size="md"`. Fields: Role name (required), Description (optional, 140 char).
On create → `POST /auth/org/roles` (creates org-scoped role, `organizationId` = caller's org,
zero permissions) → selects it in rail → matrix opens empty so admin starts toggling.
"Duplicate" from a system role pre-fills name "Copy of {role}" and pre-checks that role's
grants **intersected with the caller's grantable set** (non-grantable ones excluded, with a
one-time inline note: "{n} permissions from the original couldn't be copied because you can't grant them").

---

## 8. Tokens used (all from tokens.json — no new tokens)

- Surfaces: `--surface-base` (page), `--surface-raised` (panes/rows), `--surface-sunken` (search inputs)
- Text: `--text-primary`, `--text-secondary`, `--text-tertiary` (perm keys + disabled rows)
- Brand: `color.brand.500` (selected role accent, primary buttons, ON-switch track)
- Borders: `--border-subtle` (row/pane), `--border-default` (inputs), `--border-focus` (focus ring)
- Semantic: `color.error.500` (rejected rows, delete), `color.success.500` (save toast)
- Neutral: `neutral.200/400/700` (disabled switch track/thumb)
- Radius: `radius.lg` (panes/cards), `radius.full` (chips/switch), `radius.md` (inputs)
- Shadow: `shadow.sm` (panes), `shadow.md` (sticky save bar — elevation above content)
- Spacing: `spacing.4` row padding, `spacing.3` gaps, `spacing.6` section gaps

## 9. Accessibility

- Every switch: `role="switch"`, `aria-checked`, `aria-label="{permission label}"`,
  `aria-describedby` → perm key + (when disabled) the tooltip text.
- Disabled switches `aria-disabled="true"`, removed from tab order, but the lock icon is
  focusable so the explanation is reachable by keyboard.
- Dirty save bar announces via `aria-live="polite"`: "{n} unsaved changes".
- Color never sole signal: ON/OFF also conveyed by thumb position + (optional) text in save summary;
  rejected rows get an icon, not just the rose border.
- Contrast: greyed `--text-tertiary` on `--surface-raised` verified ≥ 4.5:1; disabled switch
  track vs surface ≥ 3:1 (UI component min).
- Min target 44×44 honored on touch (switch hit-area padded even if visual track is smaller).

## 10. Responsive

- ≥1024px: side-by-side master/detail as drawn.
- 768–1023px: rail collapses to a top `Select`/`Drawer` ("Editing: HR Manager ▾"); matrix full width.
- <768px (mobile-web): single column; role picker is a `Drawer placement="bottom"`; module
  sections stack; save bar pinned bottom full-width.
