---
name: project-wave6-state
description: Wave 6 live verification findings — rate limiter bug, stale SubscriptionService process, GST validator gap
metadata:
  type: project
---

Wave 6 live verification completed 2026-06-11 on branch `2026-06-10-s5t4`.

**Result: PARTIAL PASS** — 4 bugs found, regression suites green.

## Bugs

**BUG-W6-001** (Medium): `CreateTaxRate` validator accepts non-standard rate (e.g., 7%) — `ValidGstRates` array declared but never used in `RuleFor`. Fix: add Must rule using the array.
File: `GstService.Application/TaxRates/Commands/CreateTaxRate/CreateTaxRateCommand.cs`

**BUG-W6-002** (High): `GET /subscriptions/admin/list` returns 404 — SubscriptionService (PID 98094) was NOT restarted during wave 6 deployment. Started at 14:46, rebuilt at 18:26. The `ListSubscribers` route and `ListSubscribersQuery.cs` are uncommitted working-tree changes not loaded by the running process. Fix: restart SubscriptionService after the working-tree changes are committed.

**BUG-W6-003** (High): `GET /admin/health/aggregate` and `POST /auth/token/refresh-context` return HTTP 500. Root cause: AuthService `Program.cs` registers only `otp`, `password-reset`, and `invite-token-lookup` rate limiter policies — the `standard` policy (100 req/min) is never defined. All 4 AuthService endpoint files that call `.RequireRateLimiting("standard")` crash at runtime.
Files: `AuthService.Api/Program.cs` (fix: add standard fixed-window limiter) + `AggregateHealth.cs`, `Auth.cs`, `Privacy.cs`, `Search.cs`.
AiService has the same bug.

**BUG-W6-004** (Low): Document tag re-add is not idempotent — POST of same `tagName` creates a new row with a different `tagId` (returns 201). Expected: return existing tag or 200.

## Key Infrastructure Finding

Services started during wave 6 at 19:00 (Auth, Gst, Loan, Itr, Chat, Notification, Report, Ai, Callback, Document) are running working-tree binaries. AccountingService (14:47) and SubscriptionService (14:46) are running pre-rebuild binaries and are STALE.

## Test Counts (2026-06-11)
- Frontend Vitest: 1047 / 1047 PASS
- Backend unit: 1517 / 1517 PASS (across all 12 services)
- Regression baseline: 2564 total

**Why:** Rate limiter bug (BUG-W6-003) blocks org-switch feature validation (refresh-context org switch returns 500 before reaching the membership gate). Fix is a one-liner in AuthService Program.cs.
**How to apply:** When retesting wave 6, verify SubscriptionService was restarted AND AuthService has `standard` rate limiter before checking /admin/health/aggregate and /subscriptions/admin/list.
