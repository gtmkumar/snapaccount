# Web Admin — Invite Acceptance Page (Auth/RBAC Module 1)

> Produced by: ui-ux-agent
> Date: 2026-05-29
> Module: Auth & RBAC. PUBLIC route (no auth required — token-based).
> Extends existing auth screen design (docs/design/screens/web-admin/auth.md).

The invitee receives an email/SMS magic link: `/{base}/invite/{token}`. The page validates the
token server-side, then offers either **set a password** (new account) or **link an existing
account** (sign in / continue with Google/Apple) so they join the org with the pre-assigned role.

Route: `/invite/:token` (public, outside the authenticated app shell). Page: `InviteAcceptancePage`.
This is a focused centered card layout (same shell as Login/Register in auth.md), NOT the admin nav shell.

---

## 1. Flow & states (token lifecycle drives the screen)

On mount: `GET /auth/invite/{token}` → returns `{ status, organizationName, roleName, email?, phone?, expiresAt, accountExists }`.

```
                 ┌────────── GET /auth/invite/{token} ──────────┐
   loading ──────▶ valid(PENDING) ──▶ accountExists? ──┬─ no ──▶ SET PASSWORD form
       │                                               └─ yes ─▶ LINK ACCOUNT (sign in)
       ├─ EXPIRED  ──▶ expired card  (Request new invite)
       ├─ REVOKED  ──▶ revoked card  (Contact your admin)
       ├─ ACCEPTED ──▶ already-accepted card (Go to sign in)
       └─ invalid/404 ▶ invalid-token card
```

### 1a. Loading
Centered `Spinner` + "Checking your invitation…". `Skeleton` card outline.

### 1b. Valid — Set password (new account)

```
┌──────────────────────────────────────────────┐
│              [ SnapAccount logo ]             │
│                                               │
│   You're invited to join                      │
│   ┌───────────────────────────────────────┐  │
│   │  🏢  Acme Traders                       │  │
│   │      Role:  [CA]                         │  │
│   │      Invited as  riya@acme.in            │  │
│   └───────────────────────────────────────┘  │
│                                               │
│   Full name *      [ Riya Sharma           ]  │
│   Password *       [ ••••••••••       👁 ]    │
│     ▸ strength meter ▮▮▮▯▯  "Strong"          │
│   Confirm *        [ ••••••••••           ]   │
│                                               │
│   ☐ I agree to the Terms & Privacy Policy     │
│                                               │
│   [        Accept & create account        ]   │
│                                               │
│   Already have an account?  Link it instead → │
└──────────────────────────────────────────────┘
```

- The org name + `RoleChip` + invited identity (email or +91 phone) are shown read-only so the
  invitee sees exactly what they're accepting. Email/phone field is locked (matches the token).
- Password rules surfaced inline (min length, mix) with a strength meter; confirm must match.
- Terms checkbox required (DPDP Act 2023 consent).
- Submit → `POST /auth/invite/{token}/accept { displayName, password, acceptedTerms }`.
  On success → account active, org membership + role applied → redirect to app (or sign-in if
  the platform requires fresh auth) with `toast.success('Welcome to {org}!')`.

### 1c. Valid — Link existing account (accountExists OR user clicks "Link it instead")

```
┌──────────────────────────────────────────────┐
│   Join Acme Traders as [CA]                   │
│   We found an existing SnapAccount account     │
│   for riya@acme.in.                            │
│                                               │
│   [  Continue with Google  ]                   │
│   [  Continue with Apple   ]                   │
│   ───────────── or ─────────────              │
│   Password   [ ••••••••••        👁 ]          │
│   [        Sign in & accept invite        ]   │
│                                               │
│   Forgot password?                             │
└──────────────────────────────────────────────┘
```

- Reuses the Firebase Auth sign-in affordances from auth.md (Google/Apple + password).
- After auth → same `POST /auth/invite/{token}/accept` (no password in body; identity proven by sign-in) → membership/role attached → redirect.

### 1d. Terminal states (cards, no form)

| Status | Card | CTA |
|---|---|---|
| EXPIRED | "This invitation has expired." (icon: clock, `warning`) | "Request a new invite" → mailto/contact admin; copy admin email if present |
| REVOKED | "This invitation was withdrawn." (`neutral`) | "Contact your administrator" |
| ACCEPTED | "This invitation was already used." (`success`) | "Go to sign in" → /login |
| invalid/404 | "This link isn't valid." (`error`) | "Go to SnapAccount" → / |

---

## 2. Components

`AuthCardShell` (existing centered auth layout from auth.md), `SnapAccount logo`, org+role
summary `Card` + `RoleChip`, `Input` (text/password), `PasswordStrengthMeter` (existing or NEW
small), password show/hide toggle, `Checkbox` (terms), `Button variant="primary"`, OAuth
buttons (Google/Apple, existing), `Spinner`, `Skeleton`, status `EmptyState`-style terminal cards.

## 3. Data dependencies
- `GET /auth/invite/{token}` → validation + display payload (status, org, role, identity, expiry, accountExists).
- `POST /auth/invite/{token}/accept` → completes acceptance (set-password or post-sign-in link).

Security notes for backend/security-reviewer (informational, this is a public page):
token is single-use, time-boxed (72h per existing copy), validated server-side; the page must
not leak whether an email exists beyond what the token already implies; rate-limit accept attempts.

## 4. States summary
loading · valid-set-password · valid-link-account · expired · revoked · already-accepted ·
invalid-token · submitting (button spinner, fields disabled) · submit-error (inline + toast) ·
network-error (retry button).

## 5. Tokens
Auth shell surface `--surface-base`; card `--surface-raised` + `shadow.md`; brand for primary
CTA + logo + RoleChip; `--border-default`/`--border-focus` inputs; strength meter uses
`error.500 → warning.500 → success.500` ramp; terminal cards use semantic tints
(warning/neutral/success/error 50/100 bg). `radius.xl` card, `radius.md` inputs/buttons.

## 6. Accessibility & i18n
- Public page fully `t()`-localized (Sarvam languages); containers tolerate ±40% string length.
- Password field `aria-describedby` → rules + strength; strength meter has text label, not color-only.
- Terms link opens in new tab; checkbox required with clear error if unchecked.
- Locked identity field `readonly` + `aria-readonly`, explained ("This invite is tied to {email}").
- Min 44×44 targets; OAuth buttons full-width on mobile-web. RTL-safe layout.
- Phone identity shown as `+91 98765 43210` (Indian grouping); dates dd/MM/yyyy.
