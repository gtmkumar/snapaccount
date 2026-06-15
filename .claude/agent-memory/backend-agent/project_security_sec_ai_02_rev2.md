---
name: sec-ai-02-rev2-close
description: SEC-AI-02 re-verification pass 2 — all RV-0x findings closed; reservation pattern, HMAC constant-time, dual fail-fast, Aadhaar+phone redact, RLS null-org fix, EmbeddingModel DTO, MockAiProvider warn. 92 AiService + 683 AuthService tests green.
metadata:
  type: project
---

## SEC-AI-02 Re-verification Pass 2 — Closed (2026-06-11)

All findings from the security reviewer's re-verification pass (2026-06-11) are now closed.

### RV-03 (HIGH — CLOSED): Token Budget Race — RESERVATION PATTERN

**What changed:** `ITokenBudgetService` interface now returns `(bool Allowed, Guid? ReservationId)` and has `FinaliseReservationAsync` / `AbortReservationAsync` / `RecordNonReservationAsync` methods. `TokenBudgetService` INSERTs an `AiInteraction` reservation row (`is_reservation=true`, estimated 1000 tokens) INSIDE the `pg_advisory_xact_lock` transaction before committing. The daily-SUM query includes reservation rows so concurrent requests see each other's in-flight consumption.

`AiChatQueryHandler` and `ExtractFieldsCommandHandler` both use the new pattern:
1. `TryAcquireBudgetSlotAsync` → reservation inserted + committed
2. Provider call
3. `FinaliseReservationAsync` (actual tokens) or `AbortReservationAsync` (failure, zeros tokens)

Migration 077 adds `is_reservation BOOLEAN NOT NULL DEFAULT FALSE` to `ai.interactions`.

**Concurrency test:** `TokenBudgetConcurrencyEfSmokeTests.TwoParallelRequests_SameBudgetOrg_ExactlyOneAllowed` — two parallel `Task.WhenAll` calls against live PG with budget=1500, estimate=1000. Asserts exactly 1 allowed. Passes.

**Key implementation detail:** `reservation.CreatedAt = today` is set explicitly inside `TokenBudgetService` so the date-filter in the SUM query correctly includes the reservation row (the `AuditableEntityInterceptor` doesn't run inside the explicit transaction context in all scenarios).

### RV-01 (MEDIUM — CLOSED): HMAC Constant-Time Compare

`CryptographicEqual` in `AiConfigEndpoints.cs` now HMAC-SHA256s both inputs under domain key `"snapaccount.internal-token.v1"` and compares 32-byte digests with `FixedTimeEquals`. Constant-time for all input lengths.

### RV-02 (MEDIUM — CLOSED): InternalApi:SharedToken Fail-Fast

Both `AuthService.Api/Program.cs` and `AiService.Api/Program.cs` now throw `InvalidOperationException` at startup in non-Development when `InternalApi:SharedToken` is absent or shorter than 32 chars.

### M-01 (MEDIUM — CLOSED): TextRedactor Tightening

Aadhaar regex: two-part (keyword-prefix OR separator-grouped first-digit `[2-9]`). Bare 12-digit numbers without keyword or space/hyphen separators are not matched. Phone pattern added: `\b(?:(?:\+91|0|91)[\s-]?)?[6-9]\d{9}\b`.

### L-04 (LOW — CLOSED): ai.interactions NULL org RLS

Migration 077 adds `ai_interactions_superadmin_nullorg` policy (guarded by role-existence check for local dev where `snapaccount_superadmin` doesn't exist).

### L-03 (LOW — CLOSED): MockAiProvider Staging Warning

`AiProviderResolver` logs `LogWarning` with `[SEC-AI-02 L-03]` tag when MockAiProvider is resolved outside Development.

### I-02 (INFO — CLOSED): EmbeddingModel DTO field

`EffectiveAiConfigDto` now has `EmbeddingModel` field (default null). Handler populates from `FeatureModels["embedding"]` override. `AiProviderResolver.EffectiveAiConfig` local record already had the field; now populated from the DTO.

### Test Counts (2026-06-11 after this pass)
- AiService unit: 92 (was 85; +7 new reservation/concurrency tests)
- AiService EfSmoke: 4 (was 3; +1 concurrent-budget PG test)
- AuthService unit: 683 (unchanged)
- Migration 077 applied to local PG (idempotent)

### Key Interface Contract (ITokenBudgetService)
```csharp
Task<(bool Allowed, Guid? ReservationId)> TryAcquireBudgetSlotAsync(Guid? orgId, string userId, string featureCode, int dailyBudget, CancellationToken ct);
Task FinaliseReservationAsync(Guid reservationId, string provider, string model, int inputTokens, int outputTokens, int latencyMs, CancellationToken ct);
Task AbortReservationAsync(Guid reservationId, string failureReason, CancellationToken ct);
Task RecordNonReservationAsync(Guid? orgId, string userId, string featureCode, string provider, string model, int inputTokens, int outputTokens, int latencyMs, bool budgetExceeded, CancellationToken ct);
Task<int> GetDailyUsageAsync(Guid orgId, string featureCode, CancellationToken ct);
```
