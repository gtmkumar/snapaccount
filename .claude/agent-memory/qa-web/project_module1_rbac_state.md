---
name: project-module1-rbac-state
description: Module 1 Auth/RBAC QA FINAL (2026-05-29): 721/721 frontend PASS, 428/428 unit PASS, 20/20 RBAC integration PASS; BUG-RBAC-E2E-001 dev seed org missing
type: project
---

Module 1 Auth/RBAC QA pass initiated 2026-05-29. Frontend all green; backend build blocked.

**Why:** Backend-agent partially built the RBAC code but the `AuthService.Application.Permissions.Queries.*` namespaces shadow `AuthService.Domain.Permissions` static class, causing CS0234 in 15 files.

**How to apply:** When backend-agent reports fix, rebuild and run the 51 new unit tests + 20 new integration tests. Also activate frontend `describe.todo` suites once frontend-dev ships PermissionMatrixPage and InviteAcceptPage.

## Files Written

- `tests/unit/AuthService/RbacDomainTests.cs` — 51 tests: Role/RolePermission/OrgMember domain, PermissionBehavior (delegation), org isolation, constrained delegation, invitation token model, permission catalog
- `tests/integration/AuthService/RbacApiTests.cs` — 20 tests: RBAC HTTP API with TestContainers; tests marked [Trait("Phase", "RBAC-Pending")] will return 404 until backend routes implemented
- `src/admin/src/__tests__/RbacPermissionMatrix.test.tsx` — 22 tests: schema validation, toggle disable logic, subset invariant, invite dialog (no native alert), RoleGuard perm-string gating

## Bug BUG-RBAC-001 (Critical)

Namespace ambiguity: 15 `.Application` files reference `Permissions.OrgRolesCreate` etc. but compiler resolves `Permissions` as the `AuthService.Application.Permissions` namespace (not the `AuthService.Domain.Permissions` class).
Fix: fully qualify as `AuthService.Domain.Permissions.OrgRolesCreate` in all 15 files.

## Test Counts

| Suite | Tests | Status |
|---|---|---|
| Frontend Vitest total | 699/699 | GREEN |
| Backend unit AuthService pre-existing | 79/79 | GREEN |
| Backend unit all services regression | 425/425 | GREEN |
| New unit RBAC tests | 51 | BLOCKED |
| New integration RBAC tests | 20 | BLOCKED |
