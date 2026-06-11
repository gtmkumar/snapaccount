---
name: wave6-batch38
description: Wave 6 backend batch #38 — GAP-014/015/022/036/038/041/045/053/PCI-01/PCI-02 implemented; test counts, patterns, and contract notes
metadata:
  type: project
---

Wave 6 backend batch #38 shipped on 2026-06-11 (branch `2026-06-10-s5t4`).

**Why:** Orchestrator-tasked gap-fix batch covering OCR feedback write-path, document tags, GST tax rate CRUD, WhatsApp adapter, stub guards, PCI surface reduction, and two new admin endpoints (subscriber list + aggregate health).

**How to apply:** All items below are production-merged into the affected services. Do not re-implement these. Read the endpoint contracts in `docs/api/endpoints.md` under "Wave 6 Backend Batch #38".

## Items shipped

### GAP-014 — OCR Feedback Write-Path (DocumentService)
- `POST /documents/{id}/ocr-feedback` — gate: `document.review`
- `GET /documents/admin/ocr-accuracy` — gate: `document.review`
- Entities: `OcrFeedback` (domain), `OcrField` IDOR guard
- 19 unit tests in `OcrFeedbackCommandTests.cs`
- Error code pattern: `new Error("OcrField.NotFound", msg, ErrorType.NotFound)` — NOT `Error.NotFound("OcrField.NotFound", msg)` which appends `.NotFound` to the code

### GAP-015 — Document Tags (DocumentService)
- `GET /documents/{id}/tags`, `POST /documents/{id}/tags`, `DELETE /documents/{id}/tags/{tagId}`
- All idempotent (add deduplicates, remove is no-op if missing)
- Tests included in OcrFeedbackCommandTests.cs (19 tests cover both GAP-014 and GAP-015)

### GAP-013 — Document SLA (DocumentService)
- No new API surface in Wave 6; `document_slas` table was already added with B15 review-loop
- SLA tracking surfaced through existing review-loop endpoints

### GAP-022 — GST Tax Rate CRUD (GstService)
- `GET /gst/tax-rates`, `GET /gst/tax-rates/effective`, `POST /gst/tax-rates`, `DELETE /gst/tax-rates/{id}/deactivate`
- Gate: `gst.tax-rate.manage` (write), `gst.tax-rate.read` (read)
- Temporal: new rate terminates prior same-name active rate (sets `valid_to`)
- CGST=SGST=ratePct/2, IGST=ratePct domain invariants enforced
- 21 new tests in `TaxRateCommandTests.cs` (GstService suite: 123 total)
- EfSmoke: `GstTaxRates_CanQuery_WithoutError` added to `GstService/EfModelSmokeTests.cs`

### GAP-045 — WhatsApp Adapter (NotificationService)
- No new API route; internal dispatch-time feature flag: `WhatsApp:Enabled`
- `WhatsAppBusinessAdapter` returns "WHATSAPP_DISABLED" without HTTP call when disabled
- 7 new tests in `WhatsAppAdapterTests.cs` (NotificationService suite: 53 total)

### GAP-041 — Stub PDF Guard (LoanService)
- `ILoanPdfGenerator` throws `InvalidOperationException("GAP-041: ...")` in non-Development envs
- Dev-only: `StubLoanPdfGenerator` resolvable; prod: throw at resolve time
- 3 tests in `StubPdfGuardTests.cs` (LoanService suite: 60 total)
- Requires `services.AddLogging()` in test setup — StubLoanPdfGenerator has ILogger dependency

### GAP-053 — GCP Startup Warn Logs
- `GcpStartup.IsEnabled(config)` else branches now emit `Console.Error.WriteLine` warning
- No test; self-verifying via console output

### GAP-PCI-01 — Remove VerifyWebhookSignature from IRazorpayClient
- Removed from interface, `MockRazorpayClient`, and `RazorpayHttpClient`
- Constant-time HMAC verification lives exclusively in `RazorpayWebhook.cs`
- Verified via reflection in `MockRazorpayGuardTests.cs`

### GAP-PCI-02 — MockRazorpayClient Dev-Only Guard (SubscriptionService)
- `IRazorpayClient` throws `InvalidOperationException("GAP-PCI-02: ...")` in non-Development envs
- 6 tests in `MockRazorpayGuardTests.cs` (SubscriptionService suite: 49 total)

### GAP-036 — Admin Subscriber List (SubscriptionService, orchestrator relay)
- `GET /subscriptions/admin/list` — gate: `subscription.plan.create`
- Paginated `PaginatedResult<SubscriberRowDto>` — page/pageSize/status/tier filters
- `OrganizationName` = `OrganizationId.ToString()` (no cross-service lookup; documented in class XML)
- `PaginatedResult<T>.Create(items, total, page, pageSize)` — static factory, not constructor
- `CurrentPeriodEnd.ToString("O")` NOT `?.ToString("O")` — DateTime is non-nullable on entity

### GAP-038/052 — Aggregate Health (AuthService, orchestrator relay)
- `GET /admin/health/aggregate` — gate: `admin.dashboard.read`
- Fans out to 12 services' `/healthz` in parallel; 3-second timeout per service via linked CancellationTokenSource
- Inline permission gate (no RequiresPermission attribute — endpoint-level check)
- `services.AddHttpClient("HealthProbe")` added to `AuthService.Infrastructure/DependencyInjection.cs`

## Test counts after Wave 6 batch
- DocumentService: 59 (36 pre-existing + 23 new)
- GstService: 123 (102 + 21)
- LoanService: 60 (56 + 3 + 1 logging fix)
- NotificationService: 53 (46 + 7)
- SubscriptionService: 49 (42 + 7)

## Key C# patterns discovered

### InMemoryAsyncQueryable must implement IOrderedQueryable
After `.Select()`, EF projections need `IOrderedQueryable<T>` for `OrderBy`/`OrderByDescending`.
`InMemoryAsyncQueryable<T>` in `tests/unit/DocumentService/TestHelpers.cs` implements both `IOrderedQueryable<T>` and `IAsyncEnumerable<T>`.

### AsyncQueryProvider ExecuteAsync for value types (bool/AnyAsync)
`dynamic Task.FromResult((dynamic)syncResult)` fails for bool (value type). Use reflection:
`typeof(Task).GetMethod(nameof(Task.FromResult))!.MakeGenericMethod(syncType).Invoke(null, [syncResult])`.

### Shared test helpers across files
C# `file`-scoped types are file-local. Use `internal` scope in a shared `TestHelpers.cs` instead.
Existing `DocumentReviewCommandTests.cs` had file-scoped versions — removed and redirected to `TestHelpers.cs`.
