---
name: task2-b15-wire
description: Task #2 + WEB-13 + WEB-16 — DocumentReviewPage B15 wiring, i18n key fix, gstApi orgId guard
metadata:
  type: project
---

Task #2 + two QA fixes landed on branch 2026-06-10-s5t4.

**Task #2 — Wire DocumentReviewPage review-decision buttons (B15):**
- Added 4 functions to `src/admin/src/lib/documentApi.ts`: `approveDocument`, `rejectDocument`, `requestDocumentClarification`, `archiveDocument`. All Zod-validated with `ReviewDecisionResponseSchema`.
- Removed all TODO B15 disabled stubs from `DocumentReviewPage.tsx`.
- Approve + Reject gated by `<Can permission="document.review">`. Archive gated by `<Can permission="document.archive">`.
- Reject + Request Clarification open `<Modal>` with textarea validation (non-empty, ≤2000 chars). Archive opens confirm modal.
- All 4 mutations invalidate `['document', id]` and `['documents']` on success. `isMutating` flag optimistic-disables all action buttons while any mutation is in flight.
- 25 new/updated tests in `DocumentReviewPage.test.tsx` including: approve call, reject modal validation + submit, clarify modal validation + submit, archive modal confirm.

**WEB-13 — OrganizationDetailPage common.previous missing:**
- Changed `t('common.previous')` → `t('common.prev')` at line 332 of `OrganizationDetailPage.tsx`.
- Added `common.previous` (alias) + `common.pageOf` to en.json, hi.json, bn.json.

**WEB-16 — gstApi.ts listGstReturns organizationId optional → required:**
- `ListReturnsParams.organizationId` changed from `?: string` to `: string` (required).
- Added runtime guard: throws descriptive error if called with falsy organizationId.
- Pages using this function must gate their `useQuery` with `enabled: !!orgId`.

**Why:** `listGstReturns` called before org context resolved caused backend 500s (WEB-10 root cause).

**How to apply:** Any future page calling `listGstReturns` must pass a confirmed non-empty organizationId and gate the query with `enabled: !!orgId`.

**Test/lint/build results:** 923/923 tests pass, 0 lint errors, build clean.
