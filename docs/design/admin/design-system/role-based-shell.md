# Role-Based Shell Specification (Phase 6F)

> Phase 6F · Track F1 · Owner: ui-ux-agent → frontend-dev.

## 1. Purpose
Define the navigation visibility matrix and route-guard UX for the four roles, plus the `<RoleGuard>` component pattern and 403 redirect experience. Goal: each role sees ONLY the entries they are authorized for — no graying-out, no "locked" badges.

## 2. Roles

| Role | Description | Primary surface |
|---|---|---|
| `ADMIN` | SnapAccount internal super-user | All modules + Team + Subscriptions admin |
| `CA` | Chartered Accountant assigned to org clients | ITR review, GST notices, Chat, Reports |
| `LOAN_OFFICER` | Internal loan operations (or partner-bank reviewer in future) | Loans, BankComms, Reports |
| `OPS` | Customer success / triage | Callbacks, Chat, Notifications, basic Documents |

Roles are mutually-exclusive primary, but a user MAY have additional permissions via `permissions[]`. RoleGuard reads `useCurrentUser().role` AND `useCurrentUser().permissions[]`.

## 3. Navigation visibility matrix

Sidebar entries (top-level), in display order:

| Entry | ADMIN | CA | LOAN_OFFICER | OPS |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Documents | ✓ | ✓ | — | ✓ (read) |
| Accounting | ✓ | ✓ | — | — |
| GST | ✓ | ✓ | — | — |
| ITR | ✓ | ✓ | — | — |
| Loans | ✓ | — | ✓ | — |
| Bank Comms | ✓ | — | ✓ | — |
| Callbacks | ✓ | ✓ (assigned) | — | ✓ |
| Chat | ✓ | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | ✓ | ✓ (read) |
| Notifications | ✓ | ✓ | ✓ | ✓ |
| Subscriptions | ✓ | — | — | — |
| Team | ✓ | — | — | — |
| Settings | ✓ | ✓ (limited) | ✓ (limited) | ✓ (limited) |

"limited" Settings: only Profile + Notifications subsections; Org / Billing / Integrations hidden.

## 4. `<RoleGuard>` component

```tsx
<RoleGuard
  allow={['ADMIN', 'CA']}
  permissions={['itr.review']}     // optional AND
  fallback={<ForbiddenScreen />}    // optional
>
  <ItrReviewPanel />
</RoleGuard>
```

### Props
- `allow: Role[]` — ANY-of role check.
- `permissions?: string[]` — ALL-of permission check (additive to role).
- `fallback?: ReactNode` — render instead of redirect (used inside pages for partial gating, e.g., hide a tab).
- `redirectOnDeny?: boolean` (default true at route level, false when used inline). When true and denied, navigate to `/403` and the page that triggered is recorded for the back-button.

### Resolution
1. Read `useCurrentUser()` (TanStack Query cache).
2. While loading → render `<Skeleton variant="shell" />`.
3. While user is null (logged out) → redirect to `/login?next={current}`.
4. If allowed → render children.
5. If denied + `fallback` provided → render fallback.
6. If denied + no fallback + `redirectOnDeny` → navigate to `/403`.

### Route-level usage
`AppRouter.tsx` wraps each route element with `<RoleGuard>` per the matrix above. The Sidebar simultaneously hides the entry; the guard is defense-in-depth (deep-linked URL still blocked).

## 5. 403 / Forbidden screen

### Layout
Centered card on `--surface-canvas`:
- Icon: lock-keyhole, 48px, `--text-tertiary`.
- Heading: "You don't have access to this page" (en) / `403.heading` i18n key.
- Body: "Your role ({{roleLabel}}) doesn't include this area. If you believe this is a mistake, contact your administrator." Localized.
- Primary CTA: "Go to dashboard" → `/`.
- Secondary CTA (ghost): "Contact admin" → opens prefilled email / chat thread to org admin.
- Footer link: "Sign in as a different user" → `/logout?next=/login`.

### A11y
- `<main>` with `role="alert"` on first paint announces the denial.
- Heading focused on mount.
- Browser back from 403 must skip the denied URL (replace, not push).

### Empty / loading / error
- Loading on the guard: shell skeleton (sidebar + topbar + content placeholders).
- Error in `useCurrentUser` (network): retry button + "Continue as guest? No — sign in." If 401 from server, redirect to login.

## 6. Sidebar visibility behavior

- Filtered list rendered server-side (initial HTML) AND client-side. Hidden entries are NOT in DOM (no display:none).
- Group headers (e.g., "Compliance", "Operations") hide when all children hide.
- Counts/badges (e.g., unread chat, due notices) are fetched in parallel and only displayed if the entry is visible to current role.
- Order is fixed; roles see a contiguous subset (no gaps).

## 7. Inline guards within pages

Use `<RoleGuard fallback={null}>` inline to hide:
- "Approve" button on ITR detail (CA + ADMIN only).
- "Disburse" button on Loan detail (LOAN_OFFICER + ADMIN).
- "Edit plan" on Subscriptions list (ADMIN only).
- "Reassign callback" (OPS + ADMIN).

## 8. i18n keys
- `403.heading` ("You don't have access to this page" / "आपके पास इस पेज तक पहुँच नहीं है" / "এই পৃষ্ঠায় আপনার অ্যাক্সেস নেই")
- `403.body` (with `{{roleLabel}}` interpolation)
- `403.cta.dashboard`
- `403.cta.contactAdmin`
- `roles.ADMIN`, `roles.CA`, `roles.LOAN_OFFICER`, `roles.OPS` — display names.
- `nav.{entryKey}` — for every sidebar entry.

## 9. Accessibility
- Sidebar uses `<nav aria-label="Primary">`; current item has `aria-current="page"`.
- 403 screen heading is the first focusable element.
- Sidebar group headers are `<h2>` for screen-reader landmarks.
- "Hidden" entries are not announced (truly removed).

## 10. Responsive
- ≥ 1024px: persistent left sidebar.
- 768–1023px: collapsible sidebar (hamburger).
- < 768px: bottom-tab fallback (Dashboard, Tasks, Chat, More); "More" opens a sheet with the rest of the role-filtered list.

## 11. Telemetry
- On 403 render, fire `nav.access_denied { route, role }` (no PII) — informs future role tweaks.
- On sidebar entry click, fire `nav.click { entry, role }`.

## 12. Test plan
- [ ] Each of 4 roles screenshotted with their sidebar; diff archived.
- [ ] Direct URL hits to denied routes consistently land on /403, never blank, never partial render.
- [ ] Guard does not race on cold-load (no flash-of-content before user resolves).
- [ ] Inline guards correctly hide buttons even when route is allowed (e.g., OPS sees callback page but no "Reassign" button).
