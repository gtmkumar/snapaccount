# Web Admin — Full User CRUD (Auth/RBAC Module 1, Increment 1.4 Phase B)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Scope ref: .claude/orchestrator/auth-rbac-module-scope.md §5f Phase B
> Module: Auth & RBAC. Surface: Users page (`/users`, UserListPage) + UserDetailPage.
> Extends existing design system (tokens.json v2.0.0, component-library.md). No tokens replaced.
> Builds on: auth-rbac-add-user-dialog.md (Increment 1.3) and auth-rbac-reference-data.md (1.4-A).

Phase B completes user CRUD:
1. **Extends `AddUserDialog`** to capture all user + profile/KYC fields, with FK/constrained fields
   as dropdowns sourced from the Reference Data API.
2. **New `EditUserDialog`** — prefilled, edits profile/access; clarifies editable vs read-only fields.
3. **Delete / deactivate UX** on the Users list + detail, with self-delete / last-super-admin guards.

All dropdowns for constrained fields come from `GET /auth/reference-data?category=…&activeOnly=true`
(the master data managed in Increment 1.4 Phase A). The State dropdown is **filtered by the selected
Country's code via `parentCode`** (FK/dropdown principle). PAN is encrypted at rest server-side
(SEC-013 `AesPanEncryptionService`); the UI never displays a stored PAN in clear beyond what the user types.

**i18n:** `@/i18n` `t()` (NOT react-i18next), keys under `users.*` / `users.addUser.*` / `users.edit.*` (§7).

---

## 1. Data dependencies (backend-agent contract, §5f Phase B)

| Query / mutation | Endpoint | Drives |
|---|---|---|
| Reference data | `GET /auth/reference-data?category=LANGUAGE\|USER_TYPE\|GENDER\|STATE\|COUNTRY&activeOnly=true` | all profile dropdowns; STATE filtered client-side by selected country's code (`parentCode`) |
| Assignable roles | `GET /auth/assignable-roles?scope=platform\|org` | Role picker (unchanged from 1.3) |
| Org list | `GET /auth/admin/organizations` | Org picker (scope=org) |
| Permission catalog + grantable | `GET /auth/permissions`, `GET /auth/me/grantable-permissions` | override matrix (unchanged from 1.3) |
| Create user | `POST /auth/admin/users` | Add User submit |
| **Get user (prefill)** | `GET /auth/admin/users/{id}` | Edit User dialog |
| **Update user** | `PUT /auth/admin/users/{id}` | Edit User submit |
| **Delete/deactivate** | `DELETE /auth/admin/users/{id}` | soft-delete/deactivate from list/detail |

Extended `POST /auth/admin/users` body (additive to 1.3):
```
{ fullName, email?, phoneNumber?, scope, roleId, organizationId?, permissionIds?, initialPassword?,
  preferredLanguage,        // ← LANGUAGE code
  userType,                 // ← USER_TYPE code
  isActive,                 // toggle (default true)
  profile?: {               // collapsible KYC block
    panNumber?, aadhaarLast4?, dateOfBirth?, gender?,           // gender ← GENDER code
    addressLine1?, addressLine2?, city?, state?, pincode?, country?  // state ← STATE code, country ← COUNTRY code (default "IN")
  } }
```
`PUT /auth/admin/users/{id}` accepts the same profile/access shape minus immutable identity (see §3).

---

## 2. Extended `AddUserDialog` — sectioned layout

`Dialog size="lg" scrollableBody`. Fields grouped into three labelled sections: **Identity**,
**Access** (scope/role/overrides — unchanged from Increment 1.3), **Profile / KYC** (new, collapsible).

```
┌──────────────────────────────── Add User ───────────────────────────────────┐
│ "Create a user, assign access, and capture their profile."                     │
│                                                                                │
│ ▌ IDENTITY ─────────────────────────────────────────────────────────────────  │
│ Full name *        [ Riya Sharma                                          ]    │
│ Email *(or phone)  [ riya@acme.in                                         ]    │
│ Phone (or email)   +91 [ 98765 43210 ]                          ← PhoneField   │
│ Preferred language [ English (en)                              ▾ ]  ← LANGUAGE  │
│ User type *        [ Business Owner                            ▾ ]  ← USER_TYPE │
│ Active on create   [ ●▭ ]  (is_active, default ON)                              │
│ Initial password   [ ••••••••••              👁 ]   (DEV only)                  │
│   ▸ strength ▮▮▮▯▯  · "For local sign-in. In production the user gets an invite."│
│                                                                                │
│ ▌ ACCESS ───────────────────────────────────────────────────────────────────  │
│ Scope *      ( ◉ Platform    ○ Organization )    [warning caveat / Org combobox]│
│ Role *       [ RoleCard radios … ]   ▸ inherited-perms preview                  │
│ Permission overrides (optional)  [ PermissionModuleSection + Toggle matrix ]    │
│   (grantable / inherited-from-role / non-grantable greyed — per Increment 1.3)  │
│                                                                                │
│ ▌ PROFILE / KYC  ▸ (collapsible, collapsed by default) ─────────────────────── │
│ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ │ PAN              [ AAAAA9999A ]  🔒 encrypted at rest                         │ │
│ │ Aadhaar last 4   [ 1234 ]                                                    │ │
│ │ Date of birth    [ 14/08/1990  📅 ]                          ← DatePicker     │ │
│ │ Gender           [ Female                                  ▾ ]  ← GENDER      │ │
│ │ Address line 1   [ 12, MG Road                                            ]   │ │
│ │ Address line 2   [ Indiranagar                                            ]   │ │
│ │ City             [ Bengaluru        ]   Pincode  [ 560038 ]                  │ │
│ │ Country          [ India (IN)       ▾ ]   State  [ Karnataka (KA)        ▾ ] │ │
│ │                    ← COUNTRY default IN     ← STATE filtered by Country code  │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ── Effective permissions preview ── This user will have **14** permissions …    │
│                                        [ Cancel ]      [ Create user ]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

The **Access** section (scope segmented control, RoleCard picker with delegation-disabled roles,
inherited-perms preview, permission-overrides matrix with grantable/inherited/non-grantable rows,
and the effective-permissions summary) is **unchanged from Increment 1.3** — see auth-rbac-add-user-dialog.md
§3–§7. This spec only adds the language/user-type/active fields to Identity and the Profile/KYC block.

---

## 3. Field rules — new Identity + Profile/KYC fields

| Field | Source / type | Rules |
|---|---|---|
| Preferred language | `Select`/`Combobox` ← LANGUAGE | optional; default to org/app default (e.g. `en`); shows `Name (code)` |
| User type * | `Select` ← USER_TYPE | **required**; replaces the old auto-derive. Options e.g. Business Owner / Employee / Staff / Data Entry Operator |
| Active on create | `Toggle` ← is_active | default ON; OFF creates a deactivated user |
| PAN | text, uppercased, masked-friendly | format `^[A-Z]{5}[0-9]{4}[A-Z]$` (AAAAA9999A); optional; helper "Encrypted at rest" + `lucide Lock`; auto-uppercase on input |
| Aadhaar last 4 | text, numeric | exactly 4 digits `^[0-9]{4}$`; optional; never collect full Aadhaar |
| Date of birth | `DatePicker` (`mode="date"`, `format="DD/MM/YYYY"`, `maxDate=today`) | optional; FY mode OFF |
| Gender | `Select` ← GENDER | optional; Male/Female/Other/Prefer not to say |
| Address line 1 / 2 | text | optional |
| City | text | optional |
| Country | `Select`/`Combobox` ← COUNTRY | **default `IN`**; drives the State filter |
| State | `Select`/`Combobox` ← STATE | optional; **options filtered to `parentCode === selected country code`**; disabled (with hint `users.addUser.selectCountryFirst`) until a country is chosen; resets if country changes |
| Pincode | text, numeric | 6 digits `^[0-9]{6}$`; optional |

**State↔Country dependency (key UX):** the State dropdown's options come from the STATE category
filtered where `parentCode` equals the selected Country's `code` (e.g. country `IN` → states with
`parentCode='IN'`). Changing Country clears the selected State. If no country selected, State is
disabled with the hint. Country defaults to `IN`, so States are populated on open.

PAN/Aadhaar/pincode validate client-side (mirrors of the server value objects `PanNumber`,
`AadhaarLastFour`); server is authoritative. PAN field shows a small "encrypted at rest" affordance
so the admin understands it's protected (SEC-013).

---

## 4. New `EditUserDialog` (prefilled)

Reachable from the Users list row action **Edit** (`✎`) and from **UserDetailPage** (an "Edit user"
button). `Dialog size="lg" scrollableBody`. Prefilled from `GET /auth/admin/users/{id}`.

```
┌──────────────────────────── Edit User — Riya Sharma ─────────────────────────┐
│ ▌ IDENTITY ─────────────────────────────────────────────────────────────────  │
│ Full name *        [ Riya Sharma                                          ]    │
│ Email              riya@acme.in            🔒 read-only (set at creation)        │
│ Phone              +91 98765 43210         🔒 read-only (set at creation)        │
│ Preferred language [ English (en)                              ▾ ]              │
│ User type *        [ Business Owner                            ▾ ]              │
│ Status             [ ●▭ Active ]   (is_active toggle)                            │
│   (password is NOT edited here — use "Reset password / Send invite" action)     │
│                                                                                │
│ ▌ ACCESS ───────────────────────────────────────────────────────────────────  │
│ Scope        Platform / Organization (read-only display of current scope+org)   │
│ Role *       [ RoleCard radios — assignable, delegation-greyed ] (changeable)   │
│ Permission overrides  [ override matrix — prechecked with current direct grants;│
│                         grantable/inherited/non-grantable per delegation ]      │
│                                                                                │
│ ▌ PROFILE / KYC  ▾ (expanded if any value present) ──────────────────────────  │
│ PAN  [ AAAA••••A ]  (shows masked; clear to re-enter)   Aadhaar last 4 [ 1234 ] │
│ DOB [ 14/08/1990 📅 ]  Gender [ Female ▾ ]                                       │
│ Address line 1/2 · City · Country [ India ▾ ] · State [ Karnataka ▾ ] · Pincode │
│                                                                                │
│                                  [ Cancel ]   [ Save changes ]                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Editable vs read-only (clarified)
| Field | Edit dialog |
|---|---|
| Full name | editable |
| Email | **read-only** once set (identity anchor; shown with lock + note `users.edit.contactImmutable`). Backend may forbid change. |
| Phone | **read-only** once set (same rationale). If a field was empty at creation, it MAY be editable to fill in — backend-confirmed; default treat as read-only with an "add" affordance only if API allows. |
| Preferred language / User type | editable |
| Status (is_active) | editable toggle (this is the in-dialog equivalent of Suspend/Reactivate; the list keeps the quick Suspend action too) |
| Password | NOT in this dialog — separate "Reset password / Send invite" action (dev: set password; prod: invite) |
| Scope / Organization | **read-only display** (moving a user between platform/org is out of scope for edit; shown for context) |
| Role | editable (delegation-greyed; can't assign a role beyond caller's set) |
| Permission overrides | editable (matrix prechecked from current `user_permission`; same grantable/inherited/non-grantable rules) |
| All Profile/KYC fields | editable (PAN shown masked `AAAA••••A`; clearing the field lets the admin re-enter — submitting unchanged keeps the stored encrypted value) |

- **PAN masking on edit:** the API returns a masked PAN (never the clear value). The field renders the
  mask read-style; an explicit "Change PAN" affordance clears it for fresh entry. Leaving it untouched
  sends no PAN change (`undefined`), preserving the encrypted value.
- Dirty-tracking: Save enabled only when something changed. Navigating away while dirty → confirm.
- Submit → `PUT /auth/admin/users/{id}` → `toast.success` `users.edit.success` + invalidate
  `['users']` and `['users', id]`.
- Delegation/escalation: same as create — 403 `Role.PrivilegeEscalation` → toast + revert offending
  role/override rows (`users.addUser.err.escalation`).

---

## 5. Delete / Deactivate UX (Users list + detail)

The Users list already has **Suspend** (sets inactive). Phase B adds **Delete / Deactivate**
(soft-delete) as a distinct, more severe action, available on the list row menu and on UserDetailPage.

- Action label: **Deactivate user** (soft-delete; reversible by an admin) — we avoid "hard delete"
  language since it's a soft-delete with audit + RLS.
- Gated by `platform.admins.invite`-class capability / appropriate user-management perm (frontend-dev
  picks the exact perm; SUPER_ADMIN always).
- `Dialog` confirm (`Confirm.Destructive` style):
  > `users.delete.confirm` — "Deactivate **{name}**? They lose access immediately. Their records are
  >  retained and an admin can reactivate them later."
- **Guards (server-enforced; surfaced clearly in UI):**
  - **Self-delete:** the action is **disabled** on the caller's own row/detail with tooltip
    `users.delete.selfGuard` ("You can't deactivate your own account.").
  - **Last super-admin:** if the target is the only remaining active SUPER_ADMIN, the action is
    disabled / the confirm is blocked with `users.delete.lastSuperAdmin`
    ("This is the last active SUPER_ADMIN and can't be deactivated. Promote another admin first.").
  - Server may also return 409 for these conditions defensively → show the same messages.
- Confirm → `DELETE /auth/admin/users/{id}` → row flips to inactive / removed from active filter +
  `toast.success` `users.delete.success`. Error → `toast.error` `users.delete.error`, no change.
- Reactivate path: deactivated users can be reactivated via the existing Reactivate action / the
  Status toggle in Edit User.

---

## 6. States (create + edit + delete)

| State | Treatment |
|---|---|
| Loading dropdowns (refdata/roles) | inline `Skeleton` in each section; submit disabled until required data loaded |
| Loading prefill (Edit) | dialog body `Skeleton` until `GET /auth/admin/users/{id}` resolves |
| Validation: required (name, user type, email-or-phone, role) | inline errors; submit disabled |
| Validation: PAN/Aadhaar/pincode format | field-level inline errors (`users.addUser.err.pan/aadhaar/pincode`) |
| State disabled (no country) | hint `users.addUser.selectCountryFirst`; cleared when country chosen |
| Submitting | button spinner; fields disabled |
| Escalation blocked (403) | toast + revert offending role/override (per §4) |
| Duplicate (email/phone, 409) | inline field error `users.addUser.err.duplicate` |
| Create/edit success | `toast.success` + list invalidation + close |
| Delete: self-guard / last-super-admin | action disabled + tooltip, or blocked confirm (per §5) |
| Delete success | `toast.success` + row update |
| 403 (reached management UI without perm) | route/button guard; defensive `users.error.forbidden` |
| Network error | `toast.error` generic; preserve form |

---

## 7. i18n keys — additions (`users.*`, `users.addUser.*` extensions, `users.edit.*`)

```
# Add User — new profile/identity fields (extend existing users.addUser.* from Increment 1.3)
users.addUser.section.identity        = "Identity"
users.addUser.section.access          = "Access"
users.addUser.section.profile         = "Profile / KYC"
users.addUser.preferredLanguage       = "Preferred language"
users.addUser.userType                = "User type"
users.addUser.activeOnCreate          = "Active on create"
users.addUser.pan                     = "PAN"
users.addUser.panEncrypted            = "Encrypted at rest"
users.addUser.aadhaarLast4            = "Aadhaar last 4 digits"
users.addUser.dob                     = "Date of birth"
users.addUser.gender                  = "Gender"
users.addUser.addressLine1            = "Address line 1"
users.addUser.addressLine2            = "Address line 2"
users.addUser.city                    = "City"
users.addUser.state                   = "State"
users.addUser.country                 = "Country"
users.addUser.pincode                 = "Pincode"
users.addUser.selectCountryFirst      = "Select a country to choose a state."
users.addUser.err.userTypeRequired    = "Select a user type."
users.addUser.err.pan                 = "PAN must be in format AAAAA9999A."
users.addUser.err.aadhaar             = "Enter the last 4 digits of Aadhaar."
users.addUser.err.pincode             = "Pincode must be 6 digits."

# Edit User
users.edit.cta                        = "Edit"
users.edit.title                      = "Edit User — {name}"
users.edit.contactImmutable           = "Set at creation and can't be changed here."
users.edit.passwordNote               = "Use the Reset password / Send invite action to change sign-in credentials."
users.edit.scopeReadOnly              = "Scope and organization can't be changed after creation."
users.edit.changePan                  = "Change PAN"
users.edit.status                     = "Status"
users.edit.submit                     = "Save changes"
users.edit.success                    = "User updated"
users.edit.noChanges                  = "No changes to save."

# Delete / Deactivate
users.delete.cta                      = "Deactivate user"
users.delete.confirm                  = "Deactivate {name}? They lose access immediately. Their records are retained and an admin can reactivate them later."
users.delete.selfGuard                = "You can't deactivate your own account."
users.delete.lastSuperAdmin           = "This is the last active SUPER_ADMIN and can't be deactivated. Promote another admin first."
users.delete.success                  = "User deactivated"
users.delete.error                    = "Couldn't deactivate the user. Please try again."

users.error.forbidden                 = "You don't have permission to manage users."
common.cancel                         = "Cancel"
```

(English defaults; Sarvam languages added by frontend-dev. Containers tolerate ±40% length.)

---

## 8. Component breakdown

| Region | Component | New? |
|---|---|---|
| Shell | `Dialog size="lg" scrollableBody` | existing |
| Section grouping | labelled section headers / `Disclosure` for Profile/KYC | existing pattern |
| Language / User type / Gender / Country / State | `Select` (or `Combobox` for long lists like State/Country) | existing / reuse |
| Active / Status | `Toggle` (§1.9) | existing |
| Phone | `PhoneField` (+91) | reuse (Module 1) |
| Initial password | `Input[type=password]` + `PasswordStrengthMeter` | existing |
| PAN / Aadhaar / Pincode / City / Address | `Input` (masked/numeric variants) | existing |
| Date of birth | `DatePicker` (`mode="date"`, `maxDate=today`, FY off) | existing (§1.5) |
| Scope / Role / overrides / effective preview | per Increment 1.3 (`SegmentedControl`, `RoleCard`, `PermissionModuleSection`+`Toggle`, `Callout`) | reuse |
| Edit prefill | `EditUserDialog` (composition) | NEW |
| Delete confirm | `Dialog` `Confirm.Destructive` | existing |
| Row actions (list) | `Button variant="ghost" size="sm"` Edit + Deactivate; Suspend already present | existing |
| Toasts | `Toast` success/error | existing |

No new tokens; new compositions only (`EditUserDialog`; `AddUserDialog` extended). The State-filtered-
by-Country behavior is client logic over the refdata `parentCode`, not a new component.

---

## 9. Tokens used (all from tokens.json — no new tokens)

- Surfaces: `--surface-raised` (dialog), `--surface-sunken` (inputs/matrix)
- Text: `--text-primary` (labels/values), `--text-secondary`, `--text-tertiary` (codes, read-only/locked fields, helpers)
- Brand: `color.brand.500` (primary buttons, active toggle ON, selected segment/RoleCard)
- Semantic: `color.success.500` (active/success), `color.error.500` (validation, destructive deactivate, escalation revert), `color.warning.500` (platform caveat, last-super-admin)
- Neutral: `neutral.200/400/700` (disabled/read-only fields, disabled toggles)
- Mono: `typography.fontFamily.mono` (permission codes, PAN, refdata codes)
- Radius: `radius.lg` (cards/sections), `radius.md` (dialog/inputs), `radius.full` (segments, toggle, +91 chip)
- Shadow: `shadow.md` (dialog)
- Spacing: `spacing.4` field padding, `spacing.3` gaps, `spacing.6` section gaps

## 10. Accessibility & Indian conventions

- Sections are landmarks/`fieldset`+`legend`; Profile/KYC `Disclosure` has `aria-expanded`.
- State `Select` `aria-disabled` until a country is chosen, with the reason via `aria-describedby`.
- PAN auto-uppercases; `aria-describedby` carries the AAAAA9999A format + "encrypted at rest".
  Aadhaar/pincode `inputmode="numeric"` with maxlength; DOB uses DD/MM/YYYY (Indian format).
- DatePicker keyboard-navigable; `maxDate=today` prevents future DOB.
- Read-only Email/Phone: `aria-readonly`, lock icon + note (not just greyed).
- Delete confirm focus-trapped; self/last-super-admin guards conveyed by disabled state + tooltip
  AND a blocked message (text + icon, never color-only).
- Effective-permissions count announced via `aria-live` as role/overrides change (per 1.3).
- Min 44×44 targets; dialog full-screen sheet < 768px with pinned footer and scrolling body;
  sections stack single-column on mobile-web.
- Phone shown `+91 98765 43210`; currency/amounts (if any) Indian-grouped; dates DD/MM/YYYY throughout.
