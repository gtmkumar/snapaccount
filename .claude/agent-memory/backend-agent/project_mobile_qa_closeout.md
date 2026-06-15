---
name: mobile-qa-closeout-loan-products-consent-align
description: Mobile QA close-out — GET /loans/products implemented, GET /auth/me/consents DTO aligned additively. 1185 unit tests passing.
metadata:
  type: project
---

## Phase 7 Mobile QA Close-Out (2026-06-11)

### Task 1: GET /loans/products + GET /loans/products/{id} (HIGH)

**Root cause:** LoanHubScreen called `listLoanProducts()` → `GET /loans/products` which returned 404 — endpoint was not implemented despite `loan.loan_products` table and `LoanProduct` entity existing.

**Solution:**
- Added `ListLoanProductsQuery` + handler in `LoanService.Application/LoanProducts/Queries/ListLoanProducts/`
- Added `GetLoanProductQuery` + handler in `LoanService.Application/LoanProducts/Queries/GetLoanProduct/`
- `LoanProductDto` fields match mobile TypeScript `LoanProduct` interface exactly: `productId`, `bankId`, `productName`, `description`, `minAmount`, `maxAmount`, `tenureMonths`, `interestRate`, `eligibilityCriteriaJson`, `isActive`
- `interestRate` maps to `InterestRateMin` (shadow property `interest_rate_min_pct`)
- `description` and `eligibilityCriteriaJson` are null (shadow/JsonDocument excluded from projection)
- Both endpoints wired in `Loans.cs` with `[RequiresPermission("loan.products.read")]`
- Permission: `loan.products.read`
- Route group: `/loans/products` (GET list) + `/loans/products/{id}` (GET single)
- Pagination: page/pageSize query params, pageSize clamped to [1,100], totalCount always returned

**Key pattern:** Do NOT use `EF.Property<string?>(entity, "shadowProp")` inside a LINQ `.Select()` projection — it fails on the InMemory provider used in unit tests. Instead, load entities with `.ToListAsync()` then project client-side.

### Task 2: GET /auth/me/consents DTO alignment (MEDIUM)

**Root cause:** `GetMyConsentsResult` returned `{ Consents: [...] }` with `ConsentEntry` fields `purpose/purposeDescription/noticeVersion/actionAt`. Mobile expected `{ items: [...] }` with `purposeCode/description/consentTextVersion/grantedAt`.

**Decision: ADDITIVE (not rename)**
- Admin web does NOT call `/auth/me/consents` — confirmed by grepping all admin TS files. No admin breakage risk.
- Mobile `privacy.ts` `normalizeConsent()` already handles both shapes (IOS-01/AND-08 normalization layer).
- Added property aliases on `ConsentEntry` record: `PurposeCode`, `Description`, `ConsentTextVersion`, `GrantedAt`
- Added `Items` property alias on `GetMyConsentsResult` (same list as `Consents`)
- System.Text.Json serializes both canonical + alias names, so response now includes all 8 field names simultaneously
- Mobile normalizer can be dropped in a future cleanup pass

### Test Results

1,185 unit tests, 0 failures across all 11 services (run without category filter):
- AuthService: 674 (+79 from ConsentDtoAlignmentTests: 12 new tests)
- LoanService: 131 (+75 from LoanProductQueryTests: 10 new tests)
- All other services: unchanged

**Why:** relates to [[project_live_qa_web_sweep]]

**How to apply:** When implementing CQRS queries over shadow properties or JsonDocument columns, always materialize entities first (ToListAsync) then project in C# — never use EF.Property in server-side Select projections. When aligning DTO field names, check ALL client surfaces (admin + mobile + any API gateway) before deciding additive vs rename.
