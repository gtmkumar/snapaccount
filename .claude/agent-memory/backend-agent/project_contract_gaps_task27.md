---
name: contract-gaps-task27
description: CONTRACT-GAPS board task #27 — 4 API contract follow-ups from mobile-dev; all complete, 791 tests passing.
metadata:
  type: project
---

Four API contract fixes applied on 2026-06-11 (branch `2026-06-10-s5t4`):

**Item 1 — Org name edit (PATCH /auth/org/settings):**
- `Organization.BusinessName` changed from `init` to backing-field pattern (`private string _businessName; public string BusinessName { get => _businessName; init => _businessName = value; }`) so it is init-settable (object initializers, EF materialization) AND mutable via `UpdateSettings()`.
- `UpdateOrgSettingsCommand` gains `Name?` parameter; `UpdateSettings()` domain method gains `name?` parameter; sets `_businessName` directly.
- `PatchOrgSettingsRequest` gains `Name?` and `Gstin?` fields.
- Validator: `Gstin` when non-null → always fails with "GSTIN changes require re-verification — contact support." Makes read-only contract explicit.
- Files: `AuthService.Domain/Entities/Organization.cs`, `Application/Organizations/Commands/UpdateOrgSettings/UpdateOrgSettingsCommand.cs`, `Api/Endpoints/Settings.cs`.

**Item 2 — addressLine2 write-only bug (GET /auth/org/settings):**
- `OrgSettingsDto` was missing `AddressLine2` despite PATCH accepting it.
- Fixed: added `AddressLine2` to DTO and to the EF projection in `GetOrgSettingsQueryHandler`.
- Files: `Application/Organizations/Queries/GetOrgSettings/GetOrgSettingsQuery.cs`.

**Item 3 — GET /subscriptions/me null vs 404 contract:**
- **Decision: 404** when no subscription exists. Contract: 200+body when subscription exists; 404 `{ code: "Subscription.NotFound", message }` when org has no subscription.
- Mobile client already handles 404 → null (see `mobile/src/api/subscriptions.ts`).
- Files: `Platform.WebApi/Endpoints/Subscription/Subscriptions.cs` — GetSubscription handler updated.

**Item 4 — GET /auth/config/privacy-contact (new endpoint):**
- New query: `GetPrivacyContactQuery` / `PrivacyContactDto` / `GetPrivacyContactQueryHandler`.
- Reads `Privacy:Contact:Name`, `Privacy:Contact:Email`, `Privacy:Contact:Address` from `IConfiguration`.
- No `[RequiresPermission]` — DPDP Act 2023 Section 8(7): all authenticated users can read DPO contact.
- Development: returns placeholders when config missing (TL-10 pending).
- Non-Development: returns empty strings when absent — does NOT fail startup.
- Config keys added to `appsettings.json` with empty defaults.
- `Microsoft.Extensions.Configuration.Abstractions` added to `AuthService.Application.csproj`.
- Files: `Application/Config/Queries/GetPrivacyContact/GetPrivacyContactQuery.cs`, `Api/Endpoints/Settings.cs`, `Api/appsettings.json`.

**Tests:**
- `tests/unit/AuthService/OrgSettingsContractTests.cs` — 16 tests (tasks 1, 2, 4).
- `tests/unit/SubscriptionService/GetSubscriptionContractTests.cs` — 7 tests (task 3).
- Total: 699 AuthService + 92 SubscriptionService = 791 passing, 0 failures.

**Why:** (TL-10 pending, no deployment blocker but DPO disclosure required day-1 by DPDP Act 2023)

**How to apply:** When adding settings endpoints that read from config only (no DB), inject `IConfiguration` directly in Application layer — `Microsoft.Extensions.Configuration.Abstractions` is now a dependency.
