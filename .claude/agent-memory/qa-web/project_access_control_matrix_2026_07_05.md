---
name: access-control-matrix-2026-07-05
description: Full 11-role x 37-route RBAC matrix sweep of admin web app found 3 CRITICAL over-permission bugs plus IDOR and systemic 403-swallowing pattern
metadata:
  type: project
---

Ran a full access-control matrix campaign (2026-07-05) against http://localhost:3000 as all 11 seeded LOCAL_AUTH roles (SUPER_ADMIN, OPERATIONS_MANAGER, CA, SUPPORT_EXECUTIVE, DATA_ENTRY_OPERATOR, PARTNER_BANK_REP, ORG_ADMIN, MANAGER, HR, REVIEWER, DEV_LIMITED_MANAGER) across the same 37 routes each (407 checks). Full findings appended to `.claude/orchestrator/bug-log.md` under "## 2026-07-05 full-verification campaign — access-control matrix" (15 bugs, IDs ACM-01..ACM-15).

**Why:** Team lead asked for a systematic per-role, per-route access-control sweep to find both under- and over-permissioning bugs before the next release.

**Key findings (highest impact first):**
- ACM-01/02 CRITICAL: `/settings` (payment gateway/Razorpay credentials) and `/settings/roles` (full platform RBAC catalog incl. Platform Administration permissions) have **no effective route guard** — 6+ of 10 non-SUPER_ADMIN roles reach them, including a role scoped to only 7 permissions.
- ACM-03 CRITICAL: the "Manager" and "Reviewer" system roles specifically (not Operations Manager, not Org Admin) can access `/admin/audit-log` and `/admin/system-health` — an unintended platform-admin-level grant on just those 2 roles.
- ACM-04 CRITICAL IDOR: `GET /api/appointments/ca-profiles` doesn't scope to "my own profile" — returns another user's (CA Priya Sharma's) CA profile to an Org Admin session, who then gets live "manage availability" controls against it. Root cause of both this and ACM-10 (the actual CA role gets 403 on its own profile).
- ACM-06: `orgadmin@snapaccount.local`'s login response populates `role: "SUPER_ADMIN"` in `localStorage.sa_admin_user` (confirmed with a clean storage clear right before login) — display-only bug, actual enforcement stays correctly scoped to Org Admin, but flags a backend/login-response data bug worth checking for a real leak in code paths that trust `user.role` client-side.
- ACM-07/08/09: systemic pattern — several routes (`/notifications/templates`, `/ca/availability`, `/ca/appointments`) have zero route-level guard for any role, and several list/KPI widgets (`/loans` KPI tiles, `/users`, `/team`) render a 403 as a fake empty/zero state instead of an error, sometimes leaking raw untranslated i18n keys (`team.staff.empty`) to the screen.

**How to apply:** Before recommending any RBAC fix in this codebase, verify current route-guard implementation for the specific route — many guards are per-route ad hoc rather than inherited from a parent, so a fix on `/settings` won't automatically fix `/settings/roles` or vice versa. See [[feedback_no_alert_dialogs]] for other UI conventions from this team lead.
