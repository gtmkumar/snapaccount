# SnapAccount — Auth/RBAC Module — Session Handoff

**Last updated:** 2026-05-31. **Status: ✅ MERGED to `main`.**
Module 1 (Auth & RBAC) shipped via **PR #29** (squash `6f3856f`); handoff doc commit `f856a3b`. Branch `feat/auth-rbac-module` deleted. Next work branches from `main`.
Plan & decisions: `.claude/orchestrator/auth-rbac-module-scope.md` · decisions memory `auth-rbac-module-decisions` · local run memory `auth-local-dev-runbook`.

---

## 1. What shipped (all green, live-verified)
Multi-tenant Auth/RBAC, built as full vertical slices:
- **Base RBAC** — SuperAdmin → OrgAdmin → employees; custom roles + permission matrix; **constrained delegation** (you can only grant a subset of your own effective perms; server-enforced, 403 on escalation); orgs / members / invites (72h token) / public invite-accept.
- **1.1** Permission Catalog (create/edit/delete perms). **1.2** Real retire (`is_active`) + role counts. **1.3** Add User (role + per-user `user_permission` overrides; effective = role ∪ overrides; **I1.3-001**: only true `*` SUPER_ADMIN may assign platform/system roles). **1.4 Phase A** Reference-data CRUD. **1.4 Phase B** full user **Edit/Delete** (KYC profile, PAN encrypted SEC-013, masked on read; self-delete + last-admin guards).
- **Users vs Team split** — Users list = customers only (no active platform `user_role`) + UserType filter; staff live on Team (org-team page exists; SnapAccount-staff workload/KPI screens NOT built — see §5).
- **Role model = two families** — 036 catalog `SUPER_ADMIN/ORG_ADMIN/CA/MANAGER/HR/REVIEWER` (org-tenant RBAC) + operational `OPERATIONS_MANAGER/SUPPORT_EXECUTIVE/DATA_ENTRY_OPERATOR/PARTNER_BANK_REP/CA` (SnapAccount internal staff). Legacy `SYSTEM_ADMIN` unified → `SUPER_ADMIN` everywhere (mig 041); `ADMIN/OPS/LOAN_OFFICER` aliases retired.
- **Local-dev hardening** — `GcpStartup.IsEnabled()` lets all 12 services boot without GCP creds (prod unaffected); 401 interceptor clears full session (kills the zombie logged-in-without-token loop).
- Migrations applied: **035–041**.

## 2. Tests
Backend unit **314/314** · integration **102/102** (Auth 7 · AddUser 17 · EditDelete 13 · Rbac 20 · PermCatalog 22 · RefData 23) · admin frontend vitest **794/794**, lint+build clean.
- `cd backend && dotnet test tests/unit/AuthService/AuthService.Tests.csproj`
- Integration: **run per-class** (`--filter "FullyQualifiedName~<Class>"`). The all-at-once parallel run thrashes local Docker (6 Testcontainers at once) and flakes/hangs — environment limit, not code.
- `cd src/admin && npm run build && npm run lint && npx vitest run`

## 3. Local run
- **Postgres** localhost:5432/snapaccount (trust auth; password `postgresql`). Logins: `admin@snapaccount.local`/`Admin@12345` (SUPER_ADMIN, `*`), `manager@snapaccount.local`/`Manager@12345` (limited — delegation/403 demos). Dev org `11111111-1111-1111-1111-111111111111`.
- **AuthService :5101** — `ASPNETCORE_ENVIRONMENT=Development LOCAL_AUTH=true ASPNETCORE_URLS=http://localhost:5101 dotnet run --no-launch-profile --project backend/Services/AuthService/AuthService.Api/AuthService.Api.csproj`
- **Admin UI :3000** — `cd src/admin && npm run dev`. (Vite proxies `/api/<prefix>` → fixed ports per `vite.config.ts`.)
- **Other 10 services** (GCP-gated, on their proxy ports) — per service:
  `ASPNETCORE_ENVIRONMENT=Development DEV_AUTH_BYPASS=true DB_PASSWORD=postgresql ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=snapaccount;Username=postgres;Password=postgresql" ASPNETCORE_URLS=http://localhost:<PORT> dotnet run --no-build --no-launch-profile --project Services/<Svc>/<Svc>.Api/<Svc>.Api.csproj`
  Ports: Document 5102, Accounting 5103, Gst 5104, Loan 5105, Itr 5106, Chat 5107, Notification 5108, Report 5109, Subscription 5110, Ai 5111, Callback 5112.
- A 500 on `/auth/local/login` usually = AuthService not running on :5101 (Vite proxy → connection-refused).

## 4. ⚠️ Known issues
- **GitHub Actions CI is down (account billing)** — every job fails at setup in 2–3s: *"recent account payments have failed or your spending limit needs to be increased."* No PR gets CI validation until Settings → Billing & plans is fixed. The module merged on local verification only.
- **4 dashboard endpoints still 500** locally (separate from boot/GCP, likely un-migrated schemas / empty data in their services): `/auth/admin/team-members` is FIXED; remaining suspects when running all services — `/chat/admin/workload-by-user`, `/notifications/inbox`, `/gst/notices/due-summary`. Investigate when those modules are worked.

## 5. Suggested next work (branch from `main`)
1. **SnapAccount-staff Team module** — design Screens 87 (staff list w/ queue+SLA), 89 (workload grid), 90 (KPI dashboard). The current Team page only covers the org-team case.
2. **Restore CI** — once billing is fixed, confirm the pipeline goes green (it has never run against this code).
3. **Deferred backlog** (non-blocking, scope §5b): wildcard-gate regression test (I1.3-001), I1.3-002 double-resolve TOCTOU, I1.3-003 initialPassword silent-ignore, grant-accumulation cap, "1 member" pluralization, Phase-A `_ => 0` default in `CountUsagesAsync` → throw, Firebase plist in git, localStorage JWT, OTP plaintext log, PAN placeholder key.

## 6. Agent pipeline (when usage credits restored)
Pipeline: (db-engineer ∥ ui-ux-agent) → backend-agent → frontend-dev → qa-web → security-reviewer. All report to orchestrator (subagents have no SendMessage). File-ownership boundaries per CLAUDE.md. Heavy-context agents were credit-blocked this run, so the orchestrator built solo with its own tools.
