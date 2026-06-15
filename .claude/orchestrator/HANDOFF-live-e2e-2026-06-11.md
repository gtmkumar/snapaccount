# HANDOFF — Live E2E test session (Android) + Wave 2 Privacy bug fixes

**Date:** 2026-06-11
**Session:** Orchestrator-driven live E2E on branch `2026-06-10-s5t4` (Phase 7 Wave 1+2 merged: 073fe12, 881eaec, 75c0e69).
**Status:** PAUSED by team lead mid-session. Android pass partially done; iOS pass NOT started.

---

## 1. What was running

- **Aspire AppHost** (all 12 services) — launched with `ASPIRE_ALLOW_UNSECURED_TRANSPORT=true LOCAL_AUTH=true DEV_AUTH_BYPASS=true Ocr__ScratchDir=/private/tmp/snapaccount-ocr DB_PASSWORD=postgresql dotnet run --project AppHost --launch-profile http`. Dashboard was at `http://localhost:15159`. **All 12 services returned `/healthz` 200** (ports 5101–5112). **AppHost is now STOPPED** (I killed it to reload the AuthService rebuild — see §4; it must be relaunched to resume).
- **Admin frontend** — `npm run dev` at `http://localhost:3000` (Vite). Was running; not exercised this session (time went to mobile).
- **Android** — emulator `snap_pixel` (API 36, `emulator-5554`), app `com.snapaccount.app` built+installed via `npx expo run:android` (JAVA_HOME=openjdk@17). Metro on :8081 in CI mode (`adb reverse tcp:8081 tcp:8081`).
- **Metro caveat:** CI-mode fast-refresh deltas can still fire and reset the JS app to the Welcome screen mid-flow (cosmetic; lost in-memory nav state only).

## 2. Android results — PASS

- **OTP login (new user 9876500777):** PASS. PhoneEntry → OTP → onboarding persona → reached **Home dashboard** (returning-user login goes straight to Home). User row confirmed in `auth."user"`. No backend errors.
- **OTP recovery for testing:** OTPs are NOT in AppHost stdout under Aspire. Recover from the DB hash:
  ```
  PGPASSWORD=postgresql psql -h localhost -U postgres -d snapaccount -t -A -c \
    "SELECT otp_hash FROM auth.otp_request WHERE phone_number='<P>' ORDER BY created_at DESC LIMIT 1;"
  # then brute-force sha256("<P>:<otp>") over 000000..999999 (see local-otp-runbook.md)
  ```
- **Home dashboard:** PASS — real ₹0 figures (Total Sales/Expenses/GST Payable), GSTR-3B due card, Quick Actions, bottom tabs.
- **GST tab:** PASS — ITC/Output/Net Payable ₹0, callback CTA.
- **More tab:** PASS — shows new **"Privacy & Data"** card (Wave 2 DPDP).
- **Privacy Center screen:** RENDERS CORRECTLY (all nav cards + DPO block `dpo@snapaccount.in`, 3-day ack / 30-day SLA). NOTE: this screen **screenshots as solid black** on this emulator (swiftshader `screencap` GPU artifact) — the view hierarchy is fully populated. **Use `mobile_list_elements_on_screen`, not screenshots, for this screen.** DPO contact is pre-populated, so NEW-W2-007 already has a placeholder.

## 3. Android results — BUGS FOUND + FIXED

### BUG-A (environment) — Wave 2 migrations not applied to local DB → FIXED
Migrations **062, 063, 064 existed on disk but none were applied** to the local `snapaccount` DB, so every Wave 2 table was missing (`auth.user_consent`, `data_export_request`, `data_correction_request`, `feature_flag`, `platform_config`, `loan.key_facts_statement`, `subscription.razorpay_config`, `subscription.usage_records`). Privacy Center → "Could not load consents", `GET /auth/me/consents` → 500.
**Fix applied:** ran `psql -f 062/063/064 ...` (idempotent, clean). All 8 tables now exist. **Anyone resuming on a fresh DB must apply 060–064.** Consider a CI/dev migration-replay (GAP-071 / D4 already authored in ci.yml — gated on CI billing).

### BUG-B (real code bug) — `GetMyConsentsQuery` untranslatable LINQ → 500 → FIXED
`db.UserConsents...GroupBy(c => c.Purpose).Select(g => g.OrderByDescending(c => c.ActionAt).First())` cannot be translated by EF Core 10 → throws at query-translation regardless of data → **always 500**. The Wave 2 verification agent marked this CLOSED without executing it.
**Fix applied** (`backend/Services/PlatformService/Platform.Application/Auth/Privacy/Queries/GetMyConsents/GetMyConsentsQuery.cs`): materialize the user's (bounded) rows with `ToListAsync`, then group/reduce in memory. Compiles clean.

### BUG-C (real code bug) — data-export NotFound mapped to 500 instead of 404 → FIXED
`GetDataExportStatus` returns `Error.NotFound` for a user with no export job (normal state). The endpoint mapped every failure via `Results.Problem()` → **HTTP 500**, but the mobile client (`mobile/src/api/privacy.ts:getDataExportStatus`) treats **404** as "no job yet → null".
**Fix applied** (`backend/Services/PlatformService/Platform.WebApi/Endpoints/Auth/Privacy.cs`): added `using SnapAccount.Shared.Domain;` and map `ErrorType.NotFound → Results.NotFound()`, else `Results.Problem()`. Compiles clean.

**Verification status of fixes:** `GET /auth/me/data-correction` returned **200** after migrations (proves the table path works). BUG-B/BUG-C fixes are **code-complete + compile-clean but NOT yet runtime-verified** — the AuthService rebuild requires an AppHost restart, which I had just initiated when paused. Token minting via curl was blocked by the OTP rate limiter (SEC-011, 5/10min/IP) late in the session; use a fresh phone or the password path (`POST /auth/password/register {phoneNumber,password}` — not OTP-rate-limited) to re-test.

## 4. EXACT NEXT STEPS to resume

1. **Relaunch AppHost** (it's stopped):
   ```
   cd backend && ASPIRE_ALLOW_UNSECURED_TRANSPORT=true LOCAL_AUTH=true DEV_AUTH_BYPASS=true \
     Ocr__ScratchDir=/private/tmp/snapaccount-ocr DB_PASSWORD=postgresql \
     dotnet run --project AppHost --launch-profile http > /tmp/aspire-apphost.log 2>&1 &
   ```
   Wait for all 12 `:51xx/healthz` = 200.
2. **Runtime-verify BUG-B/BUG-C fixes** (password path avoids OTP rate limit):
   ```
   P=8123450099
   TOKEN=$(curl -s -X POST http://localhost:5101/auth/password/register -H 'Content-Type: application/json' \
     -d "{\"phoneNumber\":\"$P\",\"password\":\"Test@12345\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
   curl -s -o /dev/null -w "consents %{http_code}\n"  http://localhost:5101/auth/me/consents       -H "Authorization: Bearer $TOKEN"   # expect 200
   curl -s -o /dev/null -w "export   %{http_code}\n"  http://localhost:5101/auth/me/data-export     -H "Authorization: Bearer $TOKEN"   # expect 404
   curl -s -o /dev/null -w "correct  %{http_code}\n"  http://localhost:5101/auth/me/data-correction -H "Authorization: Bearer $TOKEN"   # expect 200
   ```
   (Note: registering a NEW phone creates `isNewUser` user with org `0000…` + `permissions:["*"]` dev token.)
3. **Re-test in-app:** relaunch the Android app, More → Privacy & Data → My consents (expect empty list, not the error state), Download my data, Request a correction.
4. **Finish the Android pass** (not yet exercised): Documents (camera→OCR→list), Loans incl. the new **KeyFactsStatementScreen** (needs a loan application; KFS data now backed by migration 063), Chat, Notifications, GST notice/nil-return, ITR stack.
5. **Then iOS pass** (per team-lead instruction "after all test done from backend then test from iOS"): use `npx expo run:ios --device <26.x-sim-udid>` (SecureStore needs a signed dev build, NOT Expo Go — see mobile-backend-local-dev memory). Repeat the same flows.

## 5. Open items / regression-test asks
- BUG-B and BUG-C should each get a unit/integration test (qa-web Task #15 scope): GetMyConsents over a real Postgres returns 200 with grouped rows; GET data-export with no job returns 404. These are exactly the kind of bug an executed integration test would have caught — the Wave 2 "verification" was static-only for these handlers.
- Audit the OTHER new Wave 2 query handlers for the same untranslatable `GroupBy().Select(First())` / `Problem()`-on-NotFound patterns before trusting them: `ListMyDataCorrectionRequests`, KFS `GetKfs`, subscription usage/MRR queries.
- Apply-migrations-on-boot for local dev (or document 060–064 in the run runbook) so this DB-drift class doesn't recur.

## 6. Files changed this session (backend only — uncommitted on `2026-06-10-s5t4`)
- `backend/Services/PlatformService/Platform.Application/Auth/Privacy/Queries/GetMyConsents/GetMyConsentsQuery.cs` — in-memory grouping.
- `backend/Services/PlatformService/Platform.WebApi/Endpoints/Auth/Privacy.cs` — `using SnapAccount.Shared.Domain;` + NotFound→404 mapping in `GetDataExportStatus`.
- Local DB only (not a repo change): applied migrations 062/063/064.

Session task board: Task #20 = this live E2E session (still `in_progress` — Android partial, iOS pending). Tasks #1–#19 = the 2026-06-11 gap-analysis delta assignments.
