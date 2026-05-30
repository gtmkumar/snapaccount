# Web Admin — Members / Employees + Invite Modal (Auth/RBAC Module 1)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Module: Auth & RBAC. Org scope (ORG_ADMIN + delegates with `org.members.*`).
> Extends the existing `TeamPage` pattern (pages/team/TeamPage.tsx) — re-scoped to org members.
> Existing `teamApi.ts` stubs map to the new org endpoints (backend-agent owns the mapping).

This is the org-scoped re-cast of the existing Team page. It keeps the same visual language
(DataTable + RoleChip + status pill + invite Dialog) but binds to org endpoints and respects
the delegation rule on the role select inside the invite/edit flows.

Route: `/settings/members` (gated `org.members.read`). Page: `MembersPage`.

---

## 1. Members list

### Layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ PageHeader: "Members"  subtitle: "Manage employees, roles and access"  [+ Invite member]│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Tabs:  [ Members ●16 ]   [ Invites ●2 ]   [ Roles → ]   (Roles tab deep-links to matrix) │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search by name / email / phone        [Role ▾]  [Status ▾ Active|Suspended|Invited]   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ DataTable                                                                                │
│  Member                  │ Role        │ Status     │ Joined     │ Last active │ Actions  │
│  ────────────────────────┼─────────────┼────────────┼────────────┼─────────────┼──────────│
│  (RS) Riya Sharma        │ [ORG ADMIN] │ ●Active    │ 12/03/2026 │ 2 hours ago │ ⊘  🗑     │
│       riya@acme.in       │             │            │            │             │          │
│  (AV) Amit Verma         │ [CA]        │ ●Active    │ 04/04/2026 │ 1 day ago   │ ⊘  🗑     │
│  (PK) Priya K  🔒self     │ [HR Mgr ▾]  │ ◌Suspended │ 18/04/2026 │ 6 days ago  │ ✓  🗑     │
│  pending@acme.in         │ [REVIEWER]  │ ⧖Invited   │ —          │ —           │ ↻  🗑     │
│ Pagination                                                                               │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Columns mirror the existing TeamPage `memberColumns`:
- **Member** = avatar initials (brand bg) + name + email.
- **Role** = `RoleChip`; clickable to open inline role `Select` if caller has `org.roles.assign`.
- **Status** = pill: Active `success`, Suspended `error/neutral`, Invited `warning` (icon + text).
- **Joined / Last active** = dd/MM/yyyy + relative (`formatDistanceToNow`).
- **Actions** = Suspend (`Ban`) / Reactivate (`CheckCircle`) / Remove (`Trash2`); for Invited rows: Resend (`↻`) / Revoke.

### Action gating (delegation-aware)
- Suspend/Reactivate visible iff `org.members.suspend`.
- Remove visible iff `org.members.remove`.
- Change role visible iff `org.members.update` AND `org.roles.assign`.
- A delegate may assign a role **only** if that role's permission set ⊆ caller's grantable set.
  Roles that exceed the caller's set appear in the role `Select` as **disabled options** with a
  `Tooltip`: "You can't assign this role — it includes permissions beyond your own access."
  (i18n `members.role.notAssignable`). Server re-validates (403 → toast, revert).
- **Self-guard:** caller's own row cannot be self-suspended/removed/demoted from the last admin —
  actions disabled with tooltip `members.self.guard`. The last remaining ORG_ADMIN cannot be removed (`members.lastAdmin.guard`).

### Data
- `GET /auth/org/members?role=&status=&page=` (org scope; SUPER_ADMIN passes org context).
- `PATCH /auth/org/members/{id}` (role change), suspend/reactivate/remove endpoints.
- `GET /auth/org/invites`, resend, revoke.
- Role options for assignment: `GET /auth/org/roles` filtered by grantable set for enable/disable.

### States
| State | Treatment |
|---|---|
| Loading | `Skeleton variant="list"` |
| Empty members | `EmptyState variant="team"` + "Invite your first member" |
| Empty invites | `EmptyState` "No pending invites" |
| Suspended row | muted text, Reactivate action shown |
| Action error (403/escalation) | `toast.error`, optimistic revert |
| Remove confirm | `Dialog` confirm ("Remove {name}? They lose access immediately.") |

---

## 2. Invite modal — `InviteMemberDialog`

Extends the existing `InviteDialog` in TeamPage; org-scoped, adds phone, role select obeys delegation.

```
┌──────────────────────────── Invite member ─────────────────────────────┐
│ "Send an invitation. The link expires in 72 hours."                      │
│                                                                          │
│  Name *                          Contact method *  ( ◉ Email  ○ Phone )  │
│  [ Riya Sharma            ]      [ riya@acme.in                       ]   │
│                                  (Phone variant: +91 [ 98765 43210 ] 10d) │
│                                                                          │
│  Role *                                                                  │
│  ┌─ radio cards (2-col) ───────────────────────────────────────────┐    │
│  │ ◉ [CA]        Review ITR, GST notices, chat                       │    │
│  │ ○ [HR Mgr]    Manage employees and leave                          │    │
│  │ ○ [Reviewer]  Read-only review access                             │    │
│  │ ◌ [ORG ADMIN] 🔒 Can't assign — exceeds your access  (disabled)   │    │ ← delegation
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ▸ Optional message (textarea, 280)                                      │
│                                                                          │
│                                   [ Cancel ]   [ Send invitation ]       │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Contact method** segmented control: Email OR Phone. Email = standard validation. Phone = fixed `+91` prefix chip + 10-digit numeric input (uses Shared `PhoneNumber` format). At least one required; both allowed.
- **Role select** = radio cards (matches existing InviteDialog). Roles whose permission set exceeds the caller's grantable set are **disabled** radio cards (greyed, lock icon, tooltip `members.role.notAssignable`). This is the invite-side mirror of the matrix delegation rule.
- Optional custom message → carried into the invitation email/SMS.
- Submit → `POST /auth/org/members/invite { name, email?, phone?, roleId, message? }` → creates `auth.invitation` (PENDING, token) → success toast + invites list refresh.
- Validation: name required; valid email or valid 10-digit phone; role required & assignable.
- Errors: duplicate (member/active invite already exists) → inline field error `members.invite.duplicate`. Server 403 (role not assignable) → toast + keep dialog open.

### Components
`Dialog size="lg"`, segmented control (NEW `SegmentedControl` or reuse pill toggle), `+91` phone field (NEW `PhoneField`), radio `RoleCard` (NEW, extends existing invite radio cards w/ disabled variant), `RoleChip`, `Tooltip`, `Button`, textarea.

### Tokens
Brand `color.brand.500` selected card border/ring + primary button; `--surface-sunken` inputs; `--border-default`/`--border-focus`; `--text-tertiary` for disabled role cards + lock; `error.500` inline validation; `radius.lg` cards, `radius.md` inputs, `radius.full` phone prefix chip. Status pills reuse success/warning/error/neutral.

### Accessibility
- Segmented control is a `radiogroup`. Phone input `inputmode="numeric"`, `maxlength=10`, `aria-describedby` showing format.
- Disabled role cards `aria-disabled`, not in tab order; their lock icon focusable to surface the tooltip.
- Dialog focus-trapped; Esc closes (with confirm if dirty); first field auto-focused.
- All actions ≥ 44×44 hit area on touch (mobile-web).
- Status conveyed by icon + text, never color alone.
