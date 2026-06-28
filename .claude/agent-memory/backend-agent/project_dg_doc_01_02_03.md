---
name: dg-doc-01-02-03
description: DG-DOC-01 (DELETE document), DG-DOC-02 (category slug resolve), DG-DOC-03 (PATCH fields OCR override) — all 3 gaps closed, build 0 errors.
metadata:
  type: project
---

## DG-DOC-01: DELETE /documents/{id} — soft-delete endpoint

**What:** Mobile DocumentDetailScreen calls `apiClient.delete('/documents/{id}')`. Backend had no DELETE handler — 404/405.

**Fix:** New command at `Finance.Application/Document/Documents/Commands/DeleteDocument/DeleteDocumentCommand.cs`.
- `[RequiresPermission("document.delete")]`
- IDOR guard: `doc.OrganizationId == currentUser.OrganizationId`
- Ownership guard: `doc.UserId == currentUser.UserId || currentUser.HasPermission("document.admin")`
- Soft-delete: `doc.DeletedAt = DateTime.UtcNow`
- Endpoint: `MapDelete("/{id:guid}")` in Documents.cs → returns 204 NoContent on success
- Migration: `095_document_delete_permission.sql` — seeds `document.delete` permission, grants to SUPER_ADMIN/ORG_ADMIN/ORG_MEMBER

**Why:** Mobile delete was silently failing (404 → catch → error toast). Users couldn't delete their documents.

**How to apply:** The `document.delete` permission is new — migration 095 must run before testing. The IDOR check matches ArchiveDocument/ApproveDocument pattern.

## DG-DOC-02: Upload category slug resolution

**What:** Mobile sends `formData.append('category', 'sales_bill')` (slug string), backend only read `form["categoryId"]` (Guid). Field-name AND value-type mismatch — category always silently dropped.

**Fix:** Updated `UploadDocument` static method in `Documents.cs`:
1. Added `IDocumentDbContext db` and `CancellationToken cancellationToken` params (injected by ASP.NET Core minimal API DI)
2. Priority: `categoryId` (Guid parse) > `category` (slug lookup via `db.DocumentCategories.Where(c => c.Code == slug)`) > null
3. If slug not found, upload continues without category (non-blocking)
4. No change to `UploadDocumentCommand` record — `CategoryId` is still `Guid?`, just resolved from slug before dispatch

**Why:** Every mobile upload was uncategorized, breaking the document processing pipeline categorization.

**How to apply:** DocumentCategories must have rows with `Code` matching the mobile slugs ('sales_bill', 'purchase_bill', 'expense', 'bank_statement', 'salary_slip', 'other'). These are seeded by `999_seed_reference_data.sql` or similar.

## DG-DOC-03: PATCH /documents/{id}/fields — OCR field override persistence

**What:** Admin DocumentReviewPage had full editable-field local state + "Manual" badge, but all 3 Save Draft buttons called `toast.info(t('docReview.saveDraft'))` — comment explicitly said "no PATCH /documents/{id}/fields endpoint". `OcrField.Override()` method existed in Domain but was never called.

**Fix:**
1. New command at `Finance.Application/Document/Documents/Commands/UpdateOcrFields/UpdateOcrFieldsCommand.cs`
   - `[RequiresPermission("document.review")]`
   - IDOR guard (doc org-scope)
   - Loads OcrField rows via `db.OcrFields` filtered by `ocrResultIds` + requested field IDs
   - Calls `field.Override(newValue, currentUser.UserId)` for each matched field
   - Returns 200 `{ message: "OCR field overrides saved." }`
2. Endpoint: `MapPatch("/{id:guid}/fields")` in Documents.cs
   - Body: `{ overrides: [{ fieldId: Guid, newValue: string }] }`
   - DTOs: `OcrFieldOverrideRequest(Guid FieldId, string NewValue)`, `UpdateOcrFieldsRequest(IReadOnlyList<OcrFieldOverrideRequest> Overrides)`

**Why:** Save Draft was a UI-only stub. Reviewers' manual corrections were lost on page refresh.

**How to apply:** Admin documentApi.ts needs `updateOcrFields(id, overrides)` wired to the Save Draft buttons (frontend-dev task). GetDocumentQuery already returns `f.IsOverridden ? f.OverriddenValue : f.FieldValue`, so round-trip display works immediately.

## Build status
All 3 gaps: `dotnet build Services/AppHost/AppHost.csproj` → **0 Errors, 22 Warnings** (warnings pre-existed).

## Key files changed
- `backend/Services/FinanceService/Finance.Application/Document/Documents/Commands/DeleteDocument/DeleteDocumentCommand.cs` (NEW)
- `backend/Services/FinanceService/Finance.Application/Document/Documents/Commands/UpdateOcrFields/UpdateOcrFieldsCommand.cs` (NEW)
- `backend/Services/FinanceService/Finance.WebApi/Endpoints/Document/Documents.cs` (3 changes: new using imports, 2 new endpoints, UploadDocument slug resolution)
- `backend/database/migrations/095_document_delete_permission.sql` (NEW — permission seed)
