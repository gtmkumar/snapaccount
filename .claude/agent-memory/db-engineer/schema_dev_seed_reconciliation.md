---
name: schema-dev-seed-reconciliation
description: The two dev-seed mechanisms (backend LOCAL_AUTH vs SQL dev-seed), GAP-072 wiring drift, and the self-sufficiency guard pattern
metadata:
  type: project
---

Local dev seeding has **two independent mechanisms** — do not conflate them.

1. **LOCAL_AUTH logins are backend-runtime-seeded**, NOT SQL. `LocalAuthService.EnsureDevAdminAsync` (Infrastructure; constants in `AuthService.Application/Common/DevSeed/LocalAuthDevSeed.cs`) seeds `admin@snapaccount.local`/`Admin@12345` (SUPER_ADMIN, wildcard `*` in-code), `manager@snapaccount.local`/`Manager@12345` (DEV_LIMITED_MANAGER, 7 perms), and dev org `11111111-1111-1111-1111-111111111111`. **Never add these to `database/` SQL** — it would race the backend seeder. There is no `SYSTEM_ADMIN` role in the DB; the role is `SUPER_ADMIN`. No `*` permission row exists; the wildcard is special-cased in code.

2. **Business data is SQL** in `database/dev-seed/`: `100_dev_users.sql` (Acme org `44444444-…`, owner `33333333-…`) then `200_dev_business_data.sql`. Separate anchor org from the LOCAL_AUTH dev org by design.

**Cross-service rows reference auth by VALUE, no FK** (schema-per-service isolation). So a missing anchor inserts silently-orphaned rows — nothing catches it.

**GAP-072 reconciliation (Wave 6, migration chain 000→077):** the seed SQL was column-correct (no column drift). Real drift was wiring:
- Added a **self-sufficiency guard** at top of `200_dev_business_data.sql` that ensures org/owner/membership anchors exist (mirrors `100`) before business inserts → file now works standalone (CI applies only `200`) AND chained after `100`, both idempotent.
- Removed stray `COMMIT;` (no `BEGIN`) at tail of `999_seed_reference_data.sql` — was emitting harmless "no transaction in progress" WARNING every replay.

**Why:** CI migration-replay best-effort-applied the seed and warned of drift; a fresh dev setup must work first-try with seeded logins intact.

**How to apply:** When touching dev seed, verify on a scratch DB (`snapaccount_scratch`), never live. New permissions (loan.products.read, accounting.editlog.read, gst.ims.{read,action,sync}, gst.gstr1a.{read,create}) are already granted to SUPER_ADMIN + ORG_ADMIN by the migrations themselves — fresh DB matches live, no dev-seed grant edits needed.

**Still owed by devops-engineer (flagged to orchestrator, outside database/ ownership):**
- `.github/workflows/ci.yml` references `database/migrations/200_dev_business_data.sql` — wrong path (file is in `database/dev-seed/`); `[ -f ]` guard never matches so seed is silently skipped. Fix path + apply `100` then `200`; flip `|| true` to strict now that `200` is self-sufficient.
- `docker-compose.override.yml` mounts `./database/dev-seed` into a SUBDIR of `/docker-entrypoint-initdb.d` (`/seed`); PG entrypoint only runs top-level files, so dev seed never auto-applies in docker.

See [[conventions_migrations_ef_parity]], [[conventions_rbac_permission_seed]].
