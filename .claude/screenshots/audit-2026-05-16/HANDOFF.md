# Handoff — SnapAccount Local-Stack Audit Sessions
**Sessions covered:** 2026-05-16 (initial audit + run) + 2026-05-17 (continuation: full 12-service Aspire + 7 PRs all merged)
**Worktree:** `/Users/gtmkumar/Documents/source/snapaccount/.claude/worktrees/zealous-northcutt-2e0a01`
**Branch:** `claude/zealous-northcutt-2e0a01` — fast-forwarded to `main` @ `5ba702b` after all 7 PRs squash-merged 2026-05-17 ~15:40 IST (CI gates bypassed — see "CI billing outage" below; the repo has no branch protection so `gh pr merge --squash` worked directly).

---

## TL;DR for next session

1. **All 7 PRs MERGED to main** ([#17](https://github.com/gtmkumar/snapaccount/pull/17), [#18](https://github.com/gtmkumar/snapaccount/pull/18), [#19](https://github.com/gtmkumar/snapaccount/pull/19), [#20](https://github.com/gtmkumar/snapaccount/pull/20), [#21](https://github.com/gtmkumar/snapaccount/pull/21), [#22](https://github.com/gtmkumar/snapaccount/pull/22), [#23](https://github.com/gtmkumar/snapaccount/pull/23)). Post-merge verification on this branch:
   - `dotnet build backend/AppHost` → **0 warnings, 0 errors** across 12 services + AppHost + ServiceDefaults
   - `npm --prefix src/admin install` → **clean resolution**, no `--legacy-peer-deps` needed
   - `npm --prefix src/admin run build` → clean Vite build (~2s)
   - `npm --prefix src/admin run lint` → **0 warnings**

2. **All 12 backend services + admin web + iOS + Android mobile have been brought up locally and screenshotted.** See [REPORT.md](REPORT.md) for the full inventory.

3. **⚠️ CI billing is the only known unresolved infrastructure blocker.** GitHub Actions runners refuse to start with the annotation:
   > "The job was not started because recent account payments have failed or your spending limit needs to be increased."

   Per project owner: **CI not in budget right now.** All 7 PRs were merged using `gh pr merge --squash` (works because the private repo has no required-checks branch protection). Future PRs follow the same flow until billing is restored. Local sanity is the substitute gate — run the 4 commands above before merging.

4. **Dev-only uncommitted state lives in this worktree only and must NEVER be merged:**
   - `mobile/app.json` Expo Go workaround (Firebase plugins + EAS projectId temporarily disabled with `_NOTE_disabled_*` keys)
   - `src/admin/.env.local` (VITE_DEV_AUTH_BYPASS=true + Firebase placeholders)
   - `.env` (POSTGRES_PASSWORD)
   - `/tmp/fake-gcp-creds.json` (generated each session — see Pre-flight below)

---

## 7 PRs merged 2026-05-17 (all squash-merged in this order)

| # | Title | Notes |
|---|---|---|
| [#17](https://github.com/gtmkumar/snapaccount/pull/17) | fix(db): migration SQL bugs prevent fresh-DB setup | 4 migrations (026/027/028/032) were broken end-to-end; additive triggers + idempotent |
| [#18](https://github.com/gtmkumar/snapaccount/pull/18) | fix(backend): unblock 12-service Aspire boot | MediatR DI ×4, AuthN scheme, DefaultConnection fallback ×12, HostOptions binding ×12, AiService MediatR |
| [#19](https://github.com/gtmkumar/snapaccount/pull/19) | fix(aspire): AppHost orchestration + Notification stability | AppHost duplicate endpoint name + `WithDevLoopDefaults` env helper + NotificationService EF version pin + seeder graceful catch |
| [#20](https://github.com/gtmkumar/snapaccount/pull/20) | fix(admin): blank page — KeyboardShortcutsProvider outside Router | Admin loaded as blank page; `useNavigate()` outside `<RouterProvider>` |
| [#21](https://github.com/gtmkumar/snapaccount/pull/21) | docs(static-data-debt): mark DashboardPage + UserListPage resolved | Doc was stale |
| [#22](https://github.com/gtmkumar/snapaccount/pull/22) | chore(admin): remove dead @eslint/js@10 dependency | Removes need for `--legacy-peer-deps`; lint still 0 warnings |
| [#23](https://github.com/gtmkumar/snapaccount/pull/23) | chore(backend): bump OpenTelemetry to fix NU1902 CVEs | Exporter+Hosting→1.15.3, Instrumentation→1.15.1; 4 CVEs cleared |

---

## What's verified working (post-merge, 2026-05-17 15:50 IST)

After all 7 PRs landed on `main` and the worktree fast-forwarded, the local stack was rebuilt and re-verified end-to-end:

| Check | Command | Result |
|---|---|---|
| Backend build | `dotnet build backend/AppHost` | **0 warnings, 0 errors** (was 16 NU1902 warnings pre-#23) |
| Admin install | `npm --prefix src/admin install` | **clean resolution** (no `--legacy-peer-deps`, was required pre-#22) |
| Admin build | `npm --prefix src/admin run build` | clean Vite build, ~2.4s |
| Admin lint | `npm --prefix src/admin run lint` | **0 warnings** (`--max-warnings 0`) |
| Aspire boot | `DEV_AUTH_BYPASS=true GOOGLE_APPLICATION_CREDENTIALS=/tmp/fake-gcp-creds.json dotnet run --project backend/AppHost` | **All 12 services Running** within ~90s |
| Admin web | http://localhost:3000/dashboard | Loads cleanly (15 console errors expected — API 401s from unauth client; PR #20 Router/Provider fix confirmed working) |

Aspire dashboard at https://localhost:17241 shows all 15 resources Running:
- postgres + snapaccount + redis (Aspire-managed Docker containers)
- accounting-service, ai-service, auth-service, callback-service, chat-service, document-service, gst-service, itr-service, loan-service, notification-service, report-service, subscription-service

Mobile (still valid from previous session — no PRs touched mobile): renders Home + Documents screens on both iOS Simulator (iPhone 17, iOS 26.3, Expo Go 2.x) and Android Emulator (Medium_Phone_API_36.1, Expo Go 2.32.18).

See `.claude/screenshots/audit-2026-05-16/` for the full screenshot set (60+ files), incl. `aspire-post-merge-all-12-running.png` from this verify pass.

---

## Pre-flight for next session

The worktree contains uncommitted **dev-only** changes that should NOT be merged:

```
mobile/app.json           # disabled Firebase plugins + EAS projectId for Expo Go boot
                          # _NOTE_disabled_* keys document what to restore
src/admin/.env.local      # VITE_DEV_AUTH_BYPASS=true + Firebase placeholders
.env                      # local POSTGRES_PASSWORD etc.
```

And tracked changes that were intentionally NOT shipped as PRs:
- *(none — everything shippable made it into the 5 PRs)*

To resume the local stack in a fresh session:

```bash
# 1. Make sure the 5 PRs are merged (or use the worktree branch as-is)
# 2. Set up env
cp .env.example .env

# 3. Fake GCP creds for local dev
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/fake.pem
# Then build /tmp/fake-gcp-creds.json with the PEM as the private_key field
# (or just keep the one from this session if /tmp survived)

# 4. Set per-service secrets
cd backend
for svc in AuthService DocumentService AccountingService GstService ItrService \
           LoanService ChatService NotificationService ReportService \
           SubscriptionService AiService CallbackService; do
  (cd Services/$svc/$svc.Api && dotnet user-secrets init && \
   dotnet user-secrets set "DB_PASSWORD" "postgres")
done
cd ..

# 5. Boot everything
DEV_AUTH_BYPASS=true GOOGLE_APPLICATION_CREDENTIALS=/tmp/fake-gcp-creds.json \
  dotnet run --project backend/AppHost
# Aspire dashboard URL is printed on stdout

# 6. Admin
cd src/admin && npm install --legacy-peer-deps && npm run dev

# 7. Mobile
cd mobile && npm install --legacy-peer-deps
EXPO_NO_TELEMETRY=1 npx expo start --offline   # or --ios / --android
```

---

## Known remaining issues / good next-session work

**HIGH-value follow-ups** (each is one or two files, easy PR):

1. **NotificationService — fix EF entity naming** (proper fix for the band-aid in #19)
   The seeder still can't seed because `NotificationServiceDbContext` has no
   `IEntityTypeConfiguration` classes registered. EF defaults to PascalCase
   table names but the SQL migrations created snake_case. Add proper entity
   configs OR add a `UseSnakeCaseNamingConvention()` extension. Then revert
   the try/catch in `NotificationSeeder`.

2. **CI: drop-and-reapply migrations on every PR**
   The 4 SQL bugs in #17 shipped because nothing exercises the full migration
   sequence on an empty database. Adding this CI step prevents the next round.

3. **Regenerate `database/dev-seed/200_dev_business_data.sql`**
   Column-name drift vs current schema (`loan.partner_banks.name` vs
   `bank_name` in the seed, plus likely more). Currently the 200 seed is
   skipped during local-stack bringup; only `100_dev_users.sql` runs.

4. **Pin or dedupe eslint in `src/admin/package.json`**
   v10 vs v8 peer-optional conflict requires `--legacy-peer-deps` on `npm install`.

5. **Resolve OpenTelemetry CVEs**
   `NU1902` warnings on `OpenTelemetry.Api@1.14.0` and `OpenTelemetry.Exporter.OpenTelemetryProtocol`.
   Likely just a version bump.

**LOWER-priority (nice-to-have):**

6. Set up an iOS dev-client EAS build so the team doesn't need to disable
   Firebase plugins to run on iOS Simulator (this session worked around it
   with `_NOTE_disabled_*` keys in `mobile/app.json` — currently NOT committed).

7. Add a "all services start" smoke test that boots AppHost, hits each
   service's `/healthz`, and fails CI if any service is not Running after 60s.

8. Improve the static-data-debt doc auditor: a grep script that finds any
   new `const mock` introductions in PRs.

---

## What we tried that didn't work (for the record)

- **`sudo dotnet workload install aspire`** — denied by Claude Code sandbox. Turned out unnecessary: the Aspire NuGet packages alone are enough; the workload is only for `dotnet new aspire` tooling.
- **Setting `HostOptions__BackgroundServiceExceptionBehavior=Ignore` in the AppHost shell environment alone** — didn't propagate to child services. Aspire requires explicit `.WithEnvironment()` in AppHost.cs *and* per-service `Configure<HostOptions>(...)` binding in Program.cs to read it from config. Both fixes are in #18 / #19.
- **Hoping that AppHost-side env vars would auto-flow to children** — they don't. Hence the `WithDevLoopDefaults<T>` helper in #19.
- **Downloading Expo Go for iOS via a guessed CDN URL** — correctly blocked by sandbox. Instead, `npx expo start --ios` auto-downloads + installs from the Expo CLI — that worked.

---

## File ownership reminders

If continuing under the multi-agent setup in `CLAUDE.md`:
- `database/migrations/*` → `db-engineer`
- `backend/Services/*`, `backend/Shared/*`, `backend/AppHost/*` → `backend-agent`
- `src/admin/*` → `frontend-dev`
- `mobile/*` → `mobile-dev`
- `docs/dev/*` → `db-engineer` (for static-data-debt) or `frontend-dev`

All 5 PRs respect these boundaries — no cross-agent edits.
