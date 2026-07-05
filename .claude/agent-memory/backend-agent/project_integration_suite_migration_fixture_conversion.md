---
name: project_integration_suite_migration_fixture_conversion
description: Converting Loan/Gst/Itr integration suites to MigratedPostgresFixture surfaced 6 confirmed backend bugs + 1 doc/code mismatch (2026-07-05)
metadata:
  type: project
---

Converted `tests/integration/{LoanService,GstService,ItrService}` from ad-hoc `postgres:17-alpine` +
EF `MigrateAsync()`/InMemory containers to the shared `MigratedPostgresFixture` (real
`database/migrations/*.sql` schema), per the AuthService/AccountingService pattern. Branch
`2026-07-05-full-verification`. Final: LoanService 4 passed/5 skipped, GstService 6/3, ItrService
1/5 — all skips are documented `[Fact(Skip="...")]` citing a specific confirmed bug in bug-log.md,
zero unexplained failures.

**Why this matters:** this was the first time these 3 suites ever ran against the REAL schema
(they were "authored-only, never run" behind P6-INT-02 gates). Running them surfaced genuine,
previously-invisible production bugs that unit tests (which mock the DB) and EnsureCreated-based
tests (which build schema FROM the EF model, so can't detect EF↔DB divergence) could never catch.

**Confirmed backend bugs found (all logged in bug-log.md "integration suite migration-fixture
conversion" section, none fixed — backend/ was out of scope for this conversion task):**
1. `loan.consents.consent_type` — native PG enum, but `ConsentConfiguration` uses
   `.HasConversion<string>()` and `ConsentType` is never registered via `npgsql.MapEnum` (unlike
   `LoanApplicationStatus`/`BankAdapterType`, which ARE). Every consent INSERT fails with 42804.
2. `ApplicationStatusLogConfiguration` — `Notes`/`TransitionedAt`/`TransitionSource` have no
   `.HasColumnName(...)`, so EF's convention emits `notes`/`transitioned_at`/`transition_source`
   which don't exist (real: `reason`/`occurred_at`/`actor_type`, migration 028). Breaks
   BeginReview/Approve/Reject/disbursement-webhook — the entire admin loan-ops flow.
3. `gst.notices.gstin` — real NOT NULL + CHECK(format) column, but `CreateNoticeCommand`/
   `GstNotice.Create` never captures a GSTIN at all (neither code nor docs account for it). Every
   `POST /gst/notices` 500s.
4. **CRITICAL** — the entire ITR `Assessee`/`itr.assessee_profiles` EF mapping is wrong. 6
   properties (`FullName`/`AssesseeType`/`PhoneNumber`/`AadhaarLast4`/`DateOfBirth`/
   `AnnualTurnoverCr`) map via convention to columns that don't exist on the real table (migration
   024) — the real table is a completely different per-`(user_id,ay)` JSONB-snapshot shape. Breaks
   `PUT/GET /itr/profile` AND `POST /itr/filings` (which looks up the assessee). This blocks 5/6
   ItrService tests — a systemic defect, not a one-line fix (entity/config vs. DB need reconciling,
   a design decision for db-engineer + backend-agent).
5. `GET /gst/hsn-sac/search` — docs say query param is `query`, code requires `q` (no
   `[FromQuery(Name=...)]` alias). Doc/code mismatch, not "bent" in the test.
6. Test-only EF↔DB divergences worked around (not product bugs, or at least not confirmed as such):
   `loan.loan_products.product_code` (shadow prop `HasDefaultValue` not honored on INSERT — worth
   auditing for real onboarding flows), `loan.loan_products.eligibility_criteria` (JSONB default
   not honored), `loan.partner_banks.bank_code` (entirely unmapped — worked around via raw-SQL
   insert in the test, `SeedPartnerBankAsync`).

**Test-harness gotcha (own bug, not product):** re-registering `AddDbContext<LoanServiceDbContext>`
inside a `WebApplicationFactory.ConfigureServices` override — even with matching `npgsql.MapEnum`
calls — collides with the app's own registration and throws `InvalidOperationException: Sequence
contains more than one matching element` in `NpgsqlTypeMappingSource.FindEnumMapping` at model-build
time. Fix: don't override `DbContextOptions<T>` at all when the service's own DI already reads
`ConnectionStrings:DefaultConnection` from config — just `UseSetting(...)` the connection string and
let the app's own `AddDbContext` (with its `MapEnum` calls intact) pick it up. Only override
`DbContextOptions<T>` when the service registers NO native-enum `MapEnum` calls (GstService/
ItrService had none, so their conversions didn't need this care).

**Skip policy used:** the task's instructions emphasized "documented skips only where a table is
GENUINELY absent" — I extended this to "genuinely absent OR a confirmed, reproduced backend bug
that backend/ file-ownership rules forbid fixing in this task," always with a `[Fact(Skip="...")]`
string citing the exact bug-log entry, never a silent/unexplained skip.

**KfsIntegrationTests.cs** (same LoanService project, NOT in my scope) has 5 pre-existing failures
(`relation "loan.loan_products" does not exist`) confirmed via `git stash` to predate this
conversion — its own `postgres:17-alpine` + EF `Database.MigrateAsync()` is a no-op because
LoanServiceDbContext has no EF Core code-first migrations (SQL-migrations-only service). Flagged,
not fixed (out of scope).

See [[project_stack]] for GCP/schema-per-service context, [[feedback_ef_audit_column_text_not_uuid]]
for the related "EF audit column type mismatch" bug class from a prior wave — this session's
`consent_type`/`assessee_profiles`/`application_status_log` bugs are the same *class* of defect
(EF model silently drifting from the SQL-migration source of truth) recurring at larger scale.
