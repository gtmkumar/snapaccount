# Web Admin — Organizations List & Detail (Auth/RBAC Module 1, SUPER_ADMIN)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Module: Auth & RBAC. Platform scope (SUPER_ADMIN only).
> Extends existing design system. No tokens replaced.

Platform staff (`SUPER_ADMIN`) register and oversee organizations. ORG_ADMIN and employees
never see these screens (nav gated by `platform.orgs.read`). Cross-org visibility here is by
design and is the ONE place org-scoping is bypassed.

Routes (frontend-dev):
- `/admin/organizations` → `OrganizationsPage` (gated `platform.orgs.read`)
- `/admin/organizations/:orgId` → `OrganizationDetailPage`

---

## A. Organizations List

### Layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ PageHeader: "Organizations"  subtitle: "All businesses on SnapAccount"  [+ Create org] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Filter bar:  🔍 Search name / GSTIN / PAN   [Status ▾ All|Active|Suspended]  [Plan ▾]   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ DataTable                                                                                │
│  Org            │ GSTIN          │ Admins │ Members │ Plan     │ Status     │ Created   │ │
│  ───────────────┼────────────────┼────────┼─────────┼──────────┼────────────┼───────────│ │
│  ▸ Acme Traders │ 27AABCU…1Z5    │   2    │   18    │ Pro      │ ●Active    │ 12/03/2026│⋯│
│  ▸ Bharat Foods │ 29AAAC…9Q1     │   1    │   6     │ Basic    │ ●Active    │ 04/01/2026│⋯│
│  ▸ Test LLP     │ —              │   0    │   0     │ Free     │ ◌Suspended │ 28/05/2026│⋯│
│  …                                                                                       │
│ Pagination 25/50/100                                                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Org name → link to detail. GSTIN shown in `--font-mono`, masked-friendly (full 15-char).
- `⋯` row menu: View, Invite Org Admin, Suspend / Reactivate.
- Status badge: Active = `success` (check-circle), Suspended = `neutral` (pause-circle) — icon + text, never color-only.
- Create org → `CreateOrgDialog` (NEW): Org legal name (req), GSTIN (validated 15-char, optional at create), PAN (optional), primary admin email + phone (to send the first Org-Admin invite). On submit → `POST /auth/admin/organizations` then optionally fires `platform.admins.invite`.

### Data
`GET /auth/admin/organizations?search=&status=&plan=&page=` (platform scope).

### States
| State | Treatment |
|---|---|
| Loading | `Skeleton variant="dataTableDense"` |
| Empty | `EmptyState` "No organizations yet" + "Create organization" CTA |
| Error | `ErrorBoundary scope="route"` + retry |
| Suspended row | row text `--text-secondary`, status pill neutral; actions menu offers Reactivate |

---

## B. Organization Detail

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: Organizations › Acme Traders                                                 │
│ Header:  [Avatar/initials] Acme Traders   ●Active   Pro      [Suspend org] [⋯]          │
│          GSTIN 27AABCU…1Z5  ·  PAN AABCU…1Z  ·  Created 12/03/2026                       │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Tabs:  [ Overview ]  [ Members ]  [ Roles ]  [ Invites ]  [ Settings ]                  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ OVERVIEW                                                                                  │
│  ┌── Stat cards ─────────────────────────────────────────────────────────────┐          │
│  │ Members 18 │ Active 16 │ Pending invites 2 │ Custom roles 4 │ Plan: Pro    │          │
│  └───────────────────────────────────────────────────────────────────────────┘          │
│  Org Admins:  ● Riya Sharma (ORG ADMIN)   ● Amit Verma (ORG ADMIN)   [Invite Org Admin]  │
│  Recent activity (audit): role created, member invited, member suspended … (read-only)   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Members** tab → reuses the Members/Employees spec (see auth-rbac-members.md) but scoped to this org. For SUPER_ADMIN the org context is the viewed org, not their own.
- **Roles** tab → embeds the Role & Permission Matrix (auth-rbac-role-permission-matrix.md) for this org. SUPER_ADMIN can edit both system/global and this org's custom roles.
- **Invites** tab → pending invitations for this org (resend/revoke).
- **Settings** tab → org legal name, GSTIN, PAN, address (gated `org.settings.update` / `platform`). Indian formatting: GSTIN 15-char validation, PAN XXXXX9999X, phone +91.

### Suspend org
`[Suspend org]` → `Dialog Confirm.Destructive` requiring typing the org name. Calls `platform.orgs.suspend`. Warning copy: "Suspending blocks all {n} members from signing in. Pending invites are paused." On success → status flips, header pill → Suspended, banner offering Reactivate.

### Components
`PageHeader` (with breadcrumb), `Avatar`/initials, `Badge` (status/plan), `Tabs`, stat `Card`s, `DataTable`, `RoleChip`, `DropdownMenu`, `Dialog Confirm.Destructive`, `OrgSwitcher` not needed here (explicit detail).

### Tokens
Surfaces `--surface-raised`/`--surface-base`; brand for avatar bg + primary actions; `success`/`neutral` for status; `error.500` for destructive suspend confirm; mono font for GSTIN/PAN; `radius.lg` cards; `shadow.sm` cards. dd/MM/yyyy dates throughout.

### Accessibility
Breadcrumb is a `nav[aria-label="Breadcrumb"]`. Status pills icon+text. Destructive confirm requires exact-name match (typo-proof). Stat cards have visible labels (not icon-only). Suspend action announces result via `aria-live`.
