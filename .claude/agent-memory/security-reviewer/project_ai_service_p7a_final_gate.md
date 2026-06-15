---
name: project-ai-service-p7a-final-gate
description: SEC-AI-02 AiService P7a final gate 2026-06-11 — GO verdict; all HIGH/MEDIUM resolved; FG-01 LOW cancellation-leak + 2 infra conditions remain
metadata:
  type: project
---

SEC-AI-02 AiService P7a final gate completed 2026-06-11. Verdict: **GO for staging**.

**Why:** All 7 Remediation Pass 2 claims independently verified in source code. No new HIGH or MEDIUM findings discovered.

**How to apply:** Do not re-review RV-03, RV-01, RV-02, M-01, L-03, L-04, I-02 in future phases unless regression evidence is present.

## Confirmed Fixed (Remediation Pass 2, code-verified 2026-06-11)

- **RV-03 (HIGH):** Reservation pattern verified correct. `TokenBudgetService.TryAcquireBudgetSlotAsync` inserts the `AiInteraction` reservation row inside the `pg_advisory_xact_lock` transaction and commits before returning. The `SumAsync` query filters `!i.BudgetExceeded` with no `IsReservation` filter — reservation rows (InputTokens=1000) ARE included. Lock is held through SaveChanges then released on CommitAsync. Sequential order: INSERT → COMMIT → lock released — correct.
- **RV-01 (MEDIUM):** `CryptographicEqual` in `AiConfigEndpoints.cs` uses HMAC-SHA256 (domain key `"snapaccount.internal-token.v1"`) on both sides, then `FixedTimeEquals` on 32-byte digests. Unconditionally constant-time.
- **RV-02 (MEDIUM):** Fail-fast guards confirmed in both `Platform.WebApi/Program.cs` and `Assist.WebApi/Program.cs`. Threshold: 32 chars. Exception type: `InvalidOperationException`. Non-Development only.
- **M-01 (MEDIUM):** TextRedactor Aadhaar two-part pattern: (a) keyword-prefixed, (b) separator+first-digit [2-9]. Bare 12-digit non-match is a documented design decision adequate for OCR. Phone pattern: `\b(?:(?:\+91|0|91)[\s-]?)?[6-9]\d{9}\b`. ReDoS-safe (fixed quantifiers, GeneratedRegex).
- **L-03 (LOW):** `AiProviderResolver` LogWarning when MockAiProvider resolved outside Development — confirmed at lines 121–133.
- **L-04 (LOW):** Migration 077 adds `ai_interactions_superadmin_nullorg` PERMISSIVE SELECT policy for `organization_id IS NULL`, role-existence guarded.
- **I-02 (INFO):** `EffectiveAiConfigDto` includes `EmbeddingModel` field; populated from `FeatureModels["embedding"]` override.

## Architecture Observations

- **CreatedAt/timezone:** `AuditableEntityInterceptor` overwrites `reservation.CreatedAt = today` with `utcNow` on SaveChanges. utcNow >= today always holds. Budget uses UTC midnight as day boundary (not IST) — conservative, acceptable, documented.
- **Finalise over-reservation:** Actual tokens may exceed 1000-token estimate. Design decision: acceptable given Gemini Flash ~800-2400 tokens/call and 100k daily cap.
- **Column type:** `ai.interactions.created_at` is TIMESTAMPTZ. Npgsql stores DateTime UTC correctly without EnableLegacyTimestampBehavior.

## Residual Open Findings

- **FG-01 (LOW):** Reservation row leaks 1000 tokens if HTTP request is cancelled mid-provider-call. No try/finally in handler; abort calls pass the cancelled token. Fix: try/finally with CancellationToken.None abort. Next sprint item.
- **FG-C1 (CONDITION):** GCP IAM topic-publish restriction on `snapaccount.document.ocr.completed` — team-lead action before production.
- **FG-C2 (CONDITION):** `InternalApi:SharedToken` must be provisioned in Secret Manager before staging deploy. Startup guard will fail-fast if absent (correct behaviour).

Related: [[project_ai_service_p7a_patterns]], [[project_phase6f_patterns]]
