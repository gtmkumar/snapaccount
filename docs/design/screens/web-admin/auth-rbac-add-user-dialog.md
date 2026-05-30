# Web Admin — Add User Dialog (Auth/RBAC Module 1, Increment 1.3)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Scope ref: .claude/orchestrator/auth-rbac-module-scope.md §5e (Increment 1.3)
> Surface: Users page (`/users`, UserListPage) — the "Add User" button (currently a stub).
> Extends existing design system (tokens.json v2.0.0, component-library.md). No tokens replaced.

A SUPER_ADMIN/admin creates a user, assigns them a role, and optionally grants **extra per-user
permissions** beyond that role. Two scopes in one form: a **platform** user (platform/system role)
or an **organization** member (org + org role). Permissions = role-inherited **plus** per-user
direct overrides (the new `auth.user_permission` concept).

Trigger: `[ + Add User ]` on UserListPage. Gated by `platform.admins.invite` OR `org.members.invite`
(button shown if caller holds either; scope segments enable accordingly — see §3).
Component: `AddUserDialog`. Consistent with `InviteMemberDialog` and the Role & Permission Matrix.
**i18n:** `@/i18n` `t()` (NOT react-i18next), keys under `users.addUser.*` (§9).

---

## 1. Data dependencies (backend-agent contract, §5e)

| Query / mutation | Endpoint | Drives |
|---|---|---|
| Assignable roles | `GET /auth/assignable-roles?scope=platform\|org` | Role dropdown (only roles caller may assign) |
| Org list | `GET /auth/admin/organizations` (or org combobox source) | Organization picker (scope=org) |
| Permission catalog | `GET /auth/permissions` (grouped by module) | Permission-overrides matrix |
| Grantable set | `GET /auth/me/grantable-permissions` | which override toggles are enabled vs greyed (delegation) |
| Role's perms | from `assignable-roles` payload (each role carries its `permissions[]`) | inherited-perms preview + effective calc |
| Create user | `POST /auth/admin/users` | submit |

`POST /auth/admin/users` body: `{ fullName, email?, phoneNumber?, scope:"platform"|"org",
roleId, organizationId? (req if scope=org), permissionIds?: guid[] (direct overrides),
initialPassword? (LOCAL_AUTH dev only) }`.

---

## 2. Layout — `AddUserDialog` (`Dialog size="lg"`, scrollableBody)

```
┌──────────────────────────────── Add User ───────────────────────────────────┐
│ "Create a user, assign a role, and optionally grant extra permissions."        │
│                                                                                │
│ Scope *      ( ◉ Platform    ○ Organization )           ← SegmentedControl      │
│ ┌─ scope=Platform ──────────────────────────────────────────────────────────┐ │
│ │ ⚠️ Platform roles are powerful and apply across all orgs. SYSTEM_ADMIN is    │ │
│ │    SUPER_ADMIN-only. (caveat banner, warning variant)                       │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ scope=Organization ──────────────────────────────────────────────────────┐ │
│ │ Organization *   [ Acme Traders                        ▾ ]  ← Combobox       │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ── Identity ──────────────────────────────────────────────────────────────── │
│ Full name *        [ Riya Sharma                                          ]    │
│ Email *(or phone)  [ riya@acme.in                                         ]    │
│ Phone (or email)   +91 [ 98765 43210 ]                          ← PhoneField   │
│ Initial password   [ ••••••••••              👁 ]   (DEV only)                  │
│   ▸ strength ▮▮▮▯▯  · "For local sign-in. In production the user gets an invite."│
│                                                                                │
│ ── Role * ──────────────────────────────────────────────────────────────────│
│ ┌─ RoleCard radios (assignable for chosen scope) ────────────────────────────┐ │
│ │ ◉ [SYSTEM ADMIN] Full platform access            (disabled 🔒 if not allowed)│ │
│ │ ○ [Operations Manager] Ops, callbacks, reports                              │ │
│ │ ○ [CA] ITR / GST review …                                                   │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│   ▸ Inherited from this role (read-only preview)                                │
│     [org.members.read] [org.members.invite] [gst.returns.file] … (12)           │
│                                                                                │
│ ── Permission overrides (optional) ──────────────────────────────────────────│
│ ℹ️ Role permissions are inherited automatically. These are EXTRA direct grants  │
│    on top of the role. You can only grant permissions you hold yourself.        │
│ 🔍 Filter permissions…                                                          │
│ ▾ Organization & Members                          [ Select all grantable ]      │
│   │ Suspend members      org.members.suspend   [ ▭○ ]                          │ │
│   │ Remove members  🔒    org.members.remove     [ ▭○ ] (disabled, tooltip)      │ │ ← non-grantable
│   │ View members  ✓inherited  org.members.read  [ ●▭ ] (shown inherited, dimmed)│ │ ← already in role
│ ▸ GST · ▸ Accounting · ▸ Documents · …                                          │
│                                                                                │
│ ── Effective permissions preview ────────────────────────────────────────────│
│   This user will have **14** permissions:  12 from role + 2 direct overrides.   │
│   [ View list ▾ ]                                                               │
│                                                                                │
│                                        [ Cancel ]      [ Create user ]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

`Dialog` uses `scrollableBody` (header/footer pinned, body scrolls) because the overrides matrix
can be long. Footer Create button is primary; disabled until validation passes (§7).

---

## 3. Scope segmented control & capability gating

`SegmentedControl` (reuse Module 1): **Platform** | **Organization** (`radiogroup`).

- **Platform** segment:
  - Shows a persistent `Callout variant="warning"` (caveat): `users.addUser.platformCaveat` —
    "Platform roles are powerful and apply across all organizations. SYSTEM_ADMIN can only be
    assigned by a SUPER_ADMIN." (icon + text).
  - Role dropdown ← `GET /auth/assignable-roles?scope=platform` (system roles the caller may assign).
  - A non-super-admin who lacks `platform.admins.invite` sees the **Platform segment disabled**
    (tooltip `users.addUser.platformDisabled` "You can't create platform users."). If the caller
    only holds `org.members.invite`, the dialog opens with Organization pre-selected and Platform greyed.
- **Organization** segment:
  - **Organization picker** `Combobox` (reuse OrgSwitcher combobox base) — required. For an
    ORG_ADMIN with a single org, it's prefilled + read-only to their own org; SUPER_ADMIN picks any.
  - Role dropdown ← `GET /auth/assignable-roles?scope=org` (caller's / selected org's roles).

Switching scope resets Role selection and the override matrix's draft (with a soft confirm only if
overrides were already chosen: `users.addUser.scopeSwitchConfirm`).

---

## 4. Identity fields

- **Full name** — required, text.
- **Email** — required *unless* Phone provided; standard email validation.
- **Phone** — `PhoneField` (reuse Module 1): fixed `+91` chip + 10-digit numeric
  (`inputmode="numeric"`, maxlength 10). Required *unless* Email provided. At least one of email/phone required.
- **Initial password** (LOCAL_AUTH, DEV only) — optional password input + show/hide + `PasswordStrengthMeter`.
  - Helper text `users.addUser.passwordHint`: "For local sign-in during development. In production
    the user receives an invite instead — leave blank to send an invite."
  - When present, dev password rules apply (min length/mix); meter labeled (not color-only).
  - Visually de-emphasized (smaller helper, `--text-tertiary`) so it reads as a dev affordance.

---

## 5. Role dropdown + inherited-permissions preview

- **Role** = `RoleCard` radio group (matches `InviteMemberDialog`), populated from
  `assignable-roles` for the chosen scope. Required.
- Roles whose permission set exceeds the caller's grantable set (or platform roles the caller can't
  mint) render as **disabled RoleCards** — greyed + `lucide Lock` + Tooltip
  `users.addUser.roleNotAssignable` ("You can't assign this role — it includes access beyond your own.").
  This is the same delegation pattern as the Role Matrix / Invite dialog.
- On pick → **Inherited permissions preview**: a read-only, collapsible chip list of that role's
  permissions (`users.addUser.inheritedTitle` "Inherited from this role"), permission codes in
  `--font-mono` `--text-tertiary`, with a count. This list is informational; it is NOT editable here.

---

## 6. Permission overrides (per-user direct grants) — the new concept

Section header + an `Callout variant="info"`:
`users.addUser.overridesNote` — "Role permissions are inherited automatically. These are **extra
direct grants** on top of the role. You can only grant permissions you hold yourself."

Matrix reuses **`PermissionModuleSection` + `Toggle`** from the Role Matrix screen, grouped by module,
with a filter input and "Select all grantable in module".

Row treatment (three distinct visual states — this is the key difference vs the Role Matrix):

| Row state | Meaning | Treatment |
|---|---|---|
| **Grantable, off** | caller may grant; not yet selected | normal row, `Toggle` OFF, interactive |
| **Grantable, on** | selected as a direct override | normal row, `Toggle` ON (`brand.500`) |
| **Inherited from role** | already covered by the chosen role | row dimmed, small `✓ inherited` chip (`success` tint), `Toggle` shown ON but **disabled** with tooltip `users.addUser.alreadyInherited` ("Already granted by the role — no need to add it directly."). Not counted as an override. |
| **Non-grantable** | not in caller's grantable set (delegation) | greyed `--text-tertiary` + `lucide Lock` + `Toggle` disabled + Tooltip `users.addUser.notGrantable` (same copy as Role Matrix `roles.matrix.notGrantable`). |

- "Select all grantable in module" toggles ON only grantable, not-already-inherited rows (tooltip clarifies); disabled if the module has none.
- Only the **grantable + not-inherited** toggles contribute to `permissionIds[]` in the submit body.
- Server is authoritative: an escalation slips through → 403 (see §7).

---

## 7. Effective-permissions preview + validation/states

**Effective preview** (live, bottom of body): `users.addUser.effectiveSummary` —
"This user will have **{total}** permissions: {roleCount} from role + {overrideCount} direct overrides."
`[ View list ▾ ]` expands the de-duplicated union (role perms ∪ overrides), codes in mono. Mirrors the
server's effective-perm resolution (role ∪ active-org-role ∪ user_permission, minus retired).

| State | Treatment |
|---|---|
| Loading (roles/catalog) | inline `Skeleton` in Role + overrides sections; Create disabled |
| Validation: name missing | inline error `users.addUser.err.nameRequired`; Create disabled |
| Validation: no email/phone | inline error under both `users.addUser.err.contactRequired` |
| Validation: invalid phone/email | field-level format error |
| Validation: role missing | `users.addUser.err.roleRequired`; Create disabled until a role is picked |
| Validation: password (dev, if entered) weak | strength hint `users.addUser.err.passwordWeak` |
| Org scope w/o org | `users.addUser.err.orgRequired` on the Organization combobox |
| Submitting | Create button spinner; fields disabled |
| **Escalation blocked (server 403, Role.PrivilegeEscalation)** | `toast.error` `users.addUser.err.escalation` ("Some selections exceed your own access and were rejected."); dialog stays open; offending override rows flash rose `error.500` left-border + revert; offending role selection cleared with inline note. |
| Duplicate (email/phone already a user, 409) | inline field error `users.addUser.err.duplicate` |
| Success | `toast.success` `users.addUser.success` ("User {name} created"); invalidate `['users']` list; close dialog |
| Network error | `toast.error` `users.addUser.err.generic`; preserve form |

---

## 8. Component breakdown

| Region | Component | New? |
|---|---|---|
| Shell | `Dialog size="lg" scrollableBody` | existing |
| Scope | `SegmentedControl` (Platform \| Organization) | reuse (Module 1) |
| Platform caveat | `Callout variant="warning"` | reuse (Incr 1.1 Callout) |
| Overrides note | `Callout variant="info"` | reuse |
| Org picker | `Combobox` (OrgSwitcher base) | reuse |
| Full name / Email | `Input` | existing |
| Phone | `PhoneField` (+91) | reuse (Module 1) |
| Initial password | `Input[type=password]` + show/hide + `PasswordStrengthMeter` | existing |
| Role select | `RoleCard` radios (disabled variant for non-assignable) | reuse (Module 1) |
| Inherited preview | mono chip list (collapsible) | reuse chip pattern |
| Overrides matrix | `PermissionModuleSection` + `Toggle` + filter input | reuse (Role Matrix) |
| Inherited-row chip | small `Badge` "✓ inherited" (`success`) | existing |
| Lock + tooltip | `lucide Lock` + `Tooltip` (delegation pattern) | reuse |
| Effective preview | text summary + collapsible mono list | reuse |
| Footer | `Button` (Cancel ghost / Create primary) | existing |
| Toasts | `Toast` success/error | existing |

No new components and no new tokens — every element reuses Module 1 / Increment 1.1 primitives.

---

## 9. i18n keys (`users.addUser.*`) — for frontend-dev (`@/i18n` `t()`)

```
users.addUser.cta                    = "Add User"
users.addUser.title                  = "Add User"
users.addUser.subtitle               = "Create a user, assign a role, and optionally grant extra permissions."

users.addUser.scope                  = "Scope"
users.addUser.scope.platform         = "Platform"
users.addUser.scope.org              = "Organization"
users.addUser.platformCaveat         = "Platform roles are powerful and apply across all organizations. SYSTEM_ADMIN can only be assigned by a SUPER_ADMIN."
users.addUser.platformDisabled       = "You can't create platform users."
users.addUser.org                    = "Organization"
users.addUser.orgPlaceholder         = "Select an organization"
users.addUser.scopeSwitchConfirm     = "Switching scope will clear your role and override selections. Continue?"

users.addUser.fullName               = "Full name"
users.addUser.email                  = "Email"
users.addUser.phone                  = "Phone"
users.addUser.password               = "Initial password"
users.addUser.passwordHint           = "For local sign-in during development. In production the user receives an invite — leave blank to send an invite."

users.addUser.role                   = "Role"
users.addUser.roleNotAssignable      = "You can't assign this role — it includes access beyond your own."
users.addUser.inheritedTitle         = "Inherited from this role"
users.addUser.inheritedCount         = "{count} permissions"

users.addUser.overrides              = "Permission overrides"
users.addUser.overridesNote          = "Role permissions are inherited automatically. These are extra direct grants on top of the role. You can only grant permissions you hold yourself."
users.addUser.overridesFilter        = "Filter permissions…"
users.addUser.selectAllGrantable     = "Select all grantable"
users.addUser.notGrantable           = "You can't grant this permission because it isn't part of your own access."
users.addUser.alreadyInherited       = "Already granted by the role — no need to add it directly."

users.addUser.effectiveSummary       = "This user will have {total} permissions: {roleCount} from role + {overrideCount} direct overrides."
users.addUser.effectiveViewList      = "View list"

users.addUser.err.nameRequired       = "Full name is required."
users.addUser.err.contactRequired    = "Enter an email or a phone number."
users.addUser.err.roleRequired       = "Select a role."
users.addUser.err.orgRequired        = "Select an organization."
users.addUser.err.passwordWeak       = "Password is too weak."
users.addUser.err.duplicate          = "A user with this email or phone already exists."
users.addUser.err.escalation         = "Some selections exceed your own access and were rejected."
users.addUser.err.generic            = "Couldn't create the user. Please try again."

users.addUser.submit                 = "Create user"
users.addUser.success                = "User {name} created"
common.cancel                        = "Cancel"
```

(English defaults; Sarvam languages added by frontend-dev. Containers tolerate ±40% length.)

---

## 10. Tokens used (all from tokens.json — no new tokens)

- Surfaces: `--surface-raised` (dialog), `--surface-sunken` (inputs/matrix rows)
- Text: `--text-primary` (labels), `--text-secondary`, `--text-tertiary` (codes, inherited/disabled rows, helper)
- Brand: `color.brand.500` (selected segment/RoleCard, toggle ON, Create button)
- Callout: warning (`color.warning.50/500/700`) for platform caveat; info (`color.info.50/500/700`) for overrides note
- Semantic: `color.success.500` (inherited chip, success toast), `color.error.500` (escalation revert border, validation)
- Neutral: `neutral.200/400/700` (disabled toggles/RoleCards)
- Mono: `typography.fontFamily.mono` (permission codes everywhere)
- Radius: `radius.lg` (cards/sections), `radius.md` (dialog/inputs), `radius.full` (segments, chips, +91, toggle)
- Shadow: `shadow.md` (dialog elevation)
- Spacing: `spacing.4` field/section padding, `spacing.3` gaps, `spacing.6` section gaps

## 11. Accessibility

- `Dialog` focus-trapped; Esc closes (confirm if dirty); first field (or Scope) auto-focused.
- `SegmentedControl` = `radiogroup`; disabled Platform segment `aria-disabled` with tooltip reachable.
- Override toggles: `role="switch"`, `aria-checked`, `aria-label="{permission label}"`. Inherited &
  non-grantable rows `aria-disabled`, removed from tab order; their chip/lock icon stays focusable to
  reach the explanation.
- Effective-permissions count announced via `aria-live="polite"` as selections change.
- Escalation-rejected rows announced + flagged by icon, not color alone.
- Phone `inputmode="numeric"` + format hint via `aria-describedby`; password field `aria-describedby`
  → rules + strength label.
- All interactive targets ≥ 44×44 on touch (mobile-web); dialog becomes a full-screen sheet < 768px,
  body scrolls, footer pinned.
- Contrast: greyed `--text-tertiary` on `--surface-sunken`/`--surface-raised` ≥ 4.5:1; toggle track ≥ 3:1.
