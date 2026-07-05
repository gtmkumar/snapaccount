---
name: dg-doc-07-08-signalr-idempotency
description: DG-DOC-07 document status SignalR push + DG-DOC-08 upload idempotency key implementation
type: project
---

## DG-DOC-07: Push/SignalR document status change notifications

**What was built:**
- `IDocumentHubNotifier` interface in `Finance.Application/Document/Documents/Interfaces/`
- `DocumentHub` SignalR hub in `Finance.Infrastructure/Document/SignalR/DocumentHub.cs` (namespace: `DocumentService.Infrastructure.SignalR`)
- `DocumentHubNotifier` implementation in same directory
- `ApproveDocumentCommand` and `RejectDocumentCommand` handlers now inject `IDocumentHubNotifier? hubNotifier = null` (optional/additive — tests still compile)
- `InlineOcrJobEnqueuer` injects `IHubContext<DocumentHub>? hubContext = null` and pushes on OCR completion
- `Finance.Infrastructure.csproj` references `Microsoft.AspNetCore.SignalR.StackExchangeRedis` (version 10.*) — NOT `SignalR.Core` (doesn't exist as standalone NuGet for .NET 10)
- `Finance.WebApi/Program.cs`: `builder.Services.AddSignalR()` + `app.MapHub<DocumentHub>("/hubs/documents").RequireAuthorization()`
- DI: `services.AddScoped<IDocumentHubNotifier, DocumentHubNotifier>()`

**Client event**: `DocumentStatusChanged` → payload `{ documentId, status }` sent to group `user:{userId}`
**Client method**: `SubscribeToDocumentUpdates()` after connect to join the group

**Why**: Pattern used to match ChatHub in AssistService.Infrastructure. Hub lives in Infrastructure (not WebApi) so IHubContext<T> can be injected without circular dependency.

## DG-DOC-08: Upload idempotency key

**What was built:**
- `Document.IdempotencyKey` nullable string property on `DocumentService.Domain.Entities.Document`
- Migration 107: `document.document` table gets `idempotency_key TEXT` column + partial unique index `ix_document_org_idempotency_key` on `(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL`
- `UploadDocumentCommand` gets additive optional param `string? IdempotencyKey = null` (7th positional param — all existing callers still compile)
- `UploadDocumentResponse` gets additive optional `bool IsExisting = false`
- Handler: checks `(org, idempotency_key)` before uploading; returns existing doc with `IsExisting=true` on match
- `Documents.cs` endpoint: reads `Idempotency-Key` header first, falls back to `idempotencyKey` form field; validates it's a valid UUID; returns 200 (not 201) when `IsExisting=true`
- Handler now also injects `IDocumentDbContext db` (additive — repository still injected for write path)

**Key contract**: `Idempotency-Key` request header (UUID v4). Response 200 = deduped existing, 201 = new doc created.

**Why**: Mobile retries after lost success-ack previously created duplicate rows. The (org, key) partial unique index is the DB-level enforcement even if application-layer check is bypassed.

Build: 0 errors, 24 warnings (all pre-existing).
