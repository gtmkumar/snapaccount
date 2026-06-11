---
name: new-d10-kfs-locale-org-switcher
description: NEW-D10 KFS locale resolution + mobile Wave 6 org-switcher (refresh-context body param). Migration 079, LoanService+AuthService, 84+627 tests.
metadata:
  type: project
---

## NEW-D10 KFS Server-Side Locale (LoanService)

Implemented in one batch. Migration 079.

**Migration 079** (`database/migrations/079_loan_kfs_locale_and_auth_refresh_context.sql`):
- `ALTER TABLE loan.key_facts_statement ADD COLUMN IF NOT EXISTS locale VARCHAR(10) NOT NULL DEFAULT 'en'`
- `INDEX ix_key_facts_statement_application_locale (application_id, locale) WHERE deleted_at IS NULL`
- Recreated `fn_kfs_immutable_signed_fields()` to include `locale` in the signed-field guard

**Changed files:**
- `LoanService.Domain/Entities/KeyFactsStatement.cs` — added `Locale` property (private set); `Create()` accepts `locale` param (defaults "en", normalised to lowercase)
- `LoanService.Infrastructure/Persistence/Configurations/KeyFactsStatementConfiguration.cs` — `HasColumnName("locale").HasMaxLength(10).HasDefaultValue("en")`
- `LoanService.Application/KeyFacts/Commands/GenerateKfs/GenerateKfsCommand.cs` — `Locale?` param; validator checks against `{"en","hi","bn"}` set; handler resolves locale (caller → "en" fallback); `GenerateKfsResult` includes `Locale`
- `LoanService.Application/KeyFacts/Queries/GetKfs/GetKfsQuery.cs` — `Locale?` param on query; `KfsDto` includes `Locale`; handler: if locale set → prefer-locale query first, then fallback to any locale; NEVER fails on locale mismatch (RBI statutory)
- `LoanService.Api/Endpoints/Loans.cs` — `GenerateKfs(Guid id, ISender, CancellationToken, string? locale = null)` and `GetKfs(Guid id, ISender, CancellationToken, Guid? kfsId = null, string? locale = null)`

**Consent catalog verified:** `GetConsentCatalogQuery` already filters by locale correctly (pre-existing).

**Tests:** `tests/unit/LoanService/Application/KfsComplianceTests.cs` — added `KfsLocaleTests` class (15 tests: entity Create with locale, validator, GetKfsQuery locale preference + fallback + kfsId-wins). LoanService: 75 unit + 9 EfSmoke = 84 total.

## Org-Switcher: RefreshContext OrganizationId body param (AuthService)

**Why:** Mobile org-switcher POSTs `{ organizationId }` in refresh-context body. Previous implementation silently used most-recently-created org. Security requirement: validate membership before minting any JWT.

**Changed files:**
- `AuthService.Application/Auth/Commands/RefreshContext/RefreshContextCommand.cs` — `record RefreshContextCommand(Guid? OrganizationId = null)` (backward-compatible); validator rejects `Guid.Empty`; handler queries `db.OrganizationMembers` for active+non-deleted membership before calling `CreateCustomTokenAsync`; returns `Error.Forbidden("Auth.OrgSwitchForbidden", ...)` on failure; `RefreshContextResponse` adds `OrganizationId?` echo; handler now takes `IAuthDbContext db` param
- `AuthService.Infrastructure/Services/FirebaseAuthService.cs` — `BuildSessionClaimsAsync` accepts `Guid? explicitOrgId` parameter; dev path also reads `explicitOrgId` from claims dict; production path reads `explicitOrgId` from claims dict and passes to `BuildSessionClaimsAsync`
- `AuthService.Api/Endpoints/Auth.cs` — `RefreshContext(RefreshContextRequest req, ISender)` binds body; `RefreshContextRequest(Guid? OrganizationId = null)` record added; 403 mapped explicitly

**Security gate pattern:** Membership check (AnyAsync with IsActive && DeletedAt==null) runs BEFORE CreateCustomTokenAsync is called. On failure, verify mock proves CreateCustomTokenAsync is NOT called (Times.Never).

**Tests:** `tests/unit/AuthService/RefreshContextCommandTests.cs` fully rewritten — added `IAuthDbContext _db = new AuthDbContext(InMemory)`, 9 new org-switcher tests: member/non-member/soft-deleted/inactive-membership/no-orgId/validator-empty/validator-null. AuthService: 627 unit tests total.

**Why:** migration 079 is idempotent.
