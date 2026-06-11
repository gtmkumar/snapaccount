---
name: wave6-bugfix-w6-003-001-004
description: Wave 6 QA bug fixes: BUG-W6-003 (missing "standard" rate limiter policy), BUG-W6-001 (GST tax rate validator not enforcing standard slabs), BUG-W6-004 (document tag idempotency returns 201 on re-add)
metadata:
  type: project
---

## BUG-W6-003 (HIGH): Missing "standard" rate limiter in AuthService and AiService

**Symptom**: `GET /admin/health/aggregate` and `POST /auth/token/refresh-context` return 500 with `InvalidOperationException: This endpoint requires a rate limiting policy with name 'standard', but no such policy exists`.

**Root cause**: AuthService.Api/Program.cs only registered `otp`, `password-reset`, and `invite-token-lookup` policies. AiService.Api/Program.cs only registered `ai`. Both services had endpoints calling `.RequireRateLimiting("standard")`.

**Fix**: Added `AddFixedWindowLimiter("standard", opt => { PermitLimit=100, Window=1min })` to both:
- `backend/Services/AuthService/AuthService.Api/Program.cs`
- `backend/Services/AiService/AiService.Api/Program.cs`

**Pattern**: The "standard" policy was already present in the other 10 services (GstService, DocumentService, NotificationService, etc.) — only these two were missing it. This is a systemic check to run on any new service.

**Test added**: `tests/integration/AuthService/RateLimiterConfigTests.cs` — WebApplicationFactory startup tests verifying no 500 on `/admin/health/aggregate` and `/auth/token/refresh-context`.

**Live curl evidence**:
- Before: HTTP 500, `InvalidOperationException: rate limiting policy 'standard' does not exist`
- After: `GET /admin/health/aggregate` → HTTP 200 with 12-service JSON body

**Why:** The rate limiter middleware throws at request time (not startup) when a policy is missing. This is hard to catch without an integration test or live smoke test. Add startup-config assertions whenever a service uses named rate limiter policies.

**How to apply:** Any new service must register "standard" (100/min fixed window) in AddRateLimiter before using `.RequireRateLimiting("standard")` on endpoints. Also register "ai" (20/min) for AI-cost-guarded endpoints.

---

## BUG-W6-001 (MEDIUM): CreateTaxRateCommand validator doesn't enforce standard GST slabs

**Symptom**: `POST /gst/tax-rates` with `ratePct=7` returns 201 (created) instead of 400.

**Root cause**: `CreateTaxRateCommandValidator` had `ValidGstRates = [0, 1.5, 3, 5, 7.5, 12, 18, 28]` declared as a field but the `RuleFor(x => x.RatePct)` never called `.Must(r => ValidGstRates.Contains(r))`. A comment said "warn but do not block" — incorrect per spec.

**Fix**: Added to `backend/Services/GstService/GstService.Application/TaxRates/Commands/CreateTaxRate/CreateTaxRateCommand.cs`:
```csharp
.Must(r => ValidGstRates.Contains(r))
.WithMessage(r => $"GST rate {r.RatePct}% is not a standard Indian GST rate. Valid rates: ...")
```

**Tests added** to `tests/unit/GstService/TaxRateCommandTests.cs`:
- `Validator_NonStandardGstRate_IsInvalid` — Theory with [7, 10, 15, 99]
- `Validator_AllEightStandardGstRates_AreValid` — Theory with all 8 slabs [0, 1.5, 3, 5, 7.5, 12, 18, 28]

**Live curl evidence**: `POST ratePct=7 → HTTP 400, "GST rate 7% is not a standard Indian GST rate. Valid rates: 0%, 1.5%, 3%, 5%, 7.5%, 12%, 18%, 28%."`. `POST ratePct=12 → HTTP 201`.

---

## BUG-W6-004 (LOW): Document tag re-add creates duplicate row, returns 201 instead of 200

**Symptom**: `POST /documents/{id}/tags` with the same tagName twice creates two DB rows and returns 201 both times.

**Root cause**: 
1. Handler had an idempotency check but used case-sensitive comparison (`t.TagName == request.TagName`), so "GST-Invoice" ≠ "gst-invoice".
2. Even when the idempotency check found an existing tag, the endpoint `Results.Created(...)` was always used regardless.

**Fix (handler)**: `backend/Services/DocumentService/DocumentService.Application/Documents/Commands/AddDocumentTag/AddDocumentTagCommand.cs`:
- Changed comparison to case-insensitive: `t.TagName.ToLower() == normalisedLower`
- Added `IsNewlyCreated` field to `AddDocumentTagResponse` (defaults `true`)
- Handler returns `IsNewlyCreated: false` on the idempotent path

**Fix (endpoint)**: `backend/Services/DocumentService/DocumentService.Api/Endpoints/Documents.cs`:
- Changed `Results.Created(...)` to conditional: `result.Value.IsNewlyCreated ? Results.Created(...) : Results.Ok(result.Value)`

**Note on ILike vs ToLower**: `EF.Functions.ILike` requires Npgsql provider — unavailable in the Application layer (no Npgsql reference). Used `t.TagName.ToLower() == normalisedLower` instead (EF Core translates to SQL `lower()` = string literal).

**Tests updated/added** in `tests/unit/DocumentService/OcrFeedbackCommandTests.cs`:
- `SameTagTwice_IsIdempotent_NoExtraSave_ReturnsSameTagId` — verifies existing tagId returned + `IsNewlyCreated=false`
- `NewTag_HappyPath_IsNewlyCreatedTrue` — verifies new insert has `IsNewlyCreated=true`

**Live curl evidence**: First add → `HTTP 201, isNewlyCreated: true`. Re-add → `HTTP 200, isNewlyCreated: false, same tagId`. `GET /tags` → 1 row, no duplicates.

---

## Services Restarted

- AuthService :5101 — BUG-W6-003 (standard rate limiter)
- GstService :5104 — BUG-W6-001 (tax rate validator)
- DocumentService :5102 — BUG-W6-004 (tag idempotency)

## Test Counts After Fix

- GstService unit: 147 (was 135, +12 new validator tests)
- DocumentService unit: 60 (was 59, +1 renamed + 1 new test)
- AuthService unit: 706 (no change — same integration tests cover policy)
- AuthService integration: +1 file (RateLimiterConfigTests.cs, 4 tests)
