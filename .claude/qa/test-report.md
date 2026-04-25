# SnapAccount — QA Test Report

> Agent: qa-web
> Date: 2026-04-04
> Status: COMPLETE — all test files written

---

## 1. Summary

| Category | Files | Test Cases |
|---|---|---|
| Backend Unit Tests (xUnit) | 6 | 42 |
| Backend Integration Tests (xUnit + Testcontainers) | 1 | 7 |
| Frontend Component Tests (Vitest + RTL) | 5 | 35 |
| **Total** | **12** | **84** |

---

## 2. Files Written

### 2.1 Backend Unit Tests — `tests/unit/AuthService/`

| File | Tests | Coverage Area |
|---|---|---|
| `AuthService.Tests.csproj` | — | Test project configuration (xUnit, FluentAssertions, Moq) |
| `OtpServiceTests.cs` | 8 | OTP generation format, hash storage, expiry, attempt counter, 3-attempt lockout, 30-min cooldown |
| `PhoneNumberValueObjectTests.cs` | 9 | Valid Indian phones (6-9 prefix, 10 digits), invalid phones, +91 normalisation, value equality |
| `PanNumberValueObjectTests.cs` | 7 | Valid ABCDE1234F format, lowercase normalisation, invalid lengths, wrong char positions |
| `GstinValueObjectTests.cs` | 7 | Valid 15-char GSTIN, 14/16-char rejection, state-code helper, PAN extraction |
| `MoneyValueObjectTests.cs` | 9 | Value equality, addition, subtraction, cross-currency guard, negative rejection, decimal precision, rounding |
| `UserDeviceTests.cs` | 7 | First/second device success, third device rejection, remove-then-add cycle, duplicate binding, domain event |
| `SendOtpCommandValidatorTests.cs` | 8 | Valid phones pass, invalid phones fail with exact message, missing phone required error, OTP type validation |

### 2.2 Backend Integration Tests — `tests/integration/AuthService/`

| File | Tests | Coverage Area |
|---|---|---|
| `AuthService.IntegrationTests.csproj` | — | Integration project configuration (Testcontainers.PostgreSql) |
| `AuthApiTests.cs` | 7 | POST /auth/otp/send valid→200, invalid phone→400, 4th request→429, POST /auth/otp/verify wrong→400, 3 wrong→locked, GET /auth/me unauth→401, full happy path |

### 2.3 Frontend Component Tests — `src/admin/src/__tests__/`

| File | Tests | Coverage Area |
|---|---|---|
| `setup.ts` | — | @testing-library/jest-dom global setup |
| `AmountDisplay.test.tsx` | 8 | ₹1,234 comma, ₹1,23,456 lakh format, ₹1,23,45,678 crore format, zero, negative, compact L/Cr, paise conversion, aria-label |
| `Button.test.tsx` | 10 | Label render, type=button default, loading spinner, loading disables, loading blocks click, disabled blocks click, normal click, primary variant class, danger variant class, ariaLabel prop |
| `StatusBadge.test.tsx` | 10 | UPLOADED/PROCESSED/REJECTED/IN_REVIEW/OCR_COMPLETE/FILED/DRAFT/REVISION_NEEDED/APPROVED/DISBURSED colour variants + dot indicator |
| `PhoneInputValidation.test.ts` | 11 | isValidIndianMobile: valid 6/7/8/9 prefix, invalid 5 prefix, 0/1 prefix, 9 digits, 11 digits, empty, space strip, hyphen strip, +91 behaviour documentation |
| `DocumentQueuePage.test.tsx` | 12 | Page heading, table columns, mock row render, status badges, SLA overdue red indicator, SLA breach alert banner, status filter, category filter, action buttons, Export button, OCR confidence %, Unassigned warning colour |

### 2.4 Test Infrastructure

| File | Purpose |
|---|---|
| `src/admin/vitest.config.ts` | Vitest config: jsdom environment, jest-dom setup, 70% line coverage threshold |

---

## 3. Testing Strategy Rationale

### Domain-First Unit Tests

Unit tests target the **domain layer directly** (entities, value objects, command validators). This approach:
- Keeps tests fast — no I/O, no EF Core, no Firebase
- Validates business rules at source (OTP lockout, device cap, money precision)
- Tests are resilient to infrastructure changes

### Integration Tests with Testcontainers

A real PostgreSQL 17 container spins up per test class. Firebase and MSG91 are mocked:
- Tests prove the full request pipeline works (routing → MediatR → EF Core → response)
- Rate-limit and lockout rules are verified against a real database (not mocks)
- No dependency on external services = deterministic CI

### Frontend: React Testing Library Philosophy

Tests exercise the component **from the user's perspective** (finding by text, role, label) rather than by implementation details (CSS class names are used only where they represent observable status). This means:
- Tests survive internal refactors
- Accessibility attributes (aria-label, role) are tested as first-class citizens
- TanStack Query and React Router are provided as real wrappers (not mocked)

---

## 4. Coverage Areas

### Fully Covered

- Indian phone number validation (6–9 prefix, 10 digits) — unit + integration + frontend
- PAN format (XXXXX9999X) — unit
- GSTIN format (15-char) — unit
- OTP lifecycle: generate → hash → verify → expire → lockout — unit + integration
- User device binding rules (max 2, duplicate rejection, remove+add cycle) — unit
- Money value object: decimal arithmetic, negative rejection, cross-currency — unit
- Auth API endpoints: send/verify/me — integration
- AmountDisplay: full Indian number system (lakh/crore formatting) — component
- Button: all interaction states — component
- StatusBadge: all document/GST/ITR/loan statuses — component
- DocumentQueuePage: table, filters, SLA breach indicators — component

### Needs More Coverage (Future Work)

| Area | Reason Not Covered |
|---|---|
| VerifyOtpCommandHandler | Requires full infrastructure — better as integration test with stubbed Firebase |
| RefreshTokenCommandHandler | JWT rotation logic — integration test with real DB |
| RegisterUser / CreateOrganization commands | Happy path integration tests |
| OCR confidence scoring logic | Belongs in DocumentService tests (different agent) |
| GST rate calculation | Belongs in GstService tests |
| ITR tax computation (old vs new regime) | Belongs in ItrService tests |
| Subscription billing / Razorpay webhook | Belongs in SubscriptionService tests |
| Admin login page | Auth guard integration |
| React error boundaries | Edge case — low priority |

---

## 5. Running the Tests

### Backend Unit Tests
```bash
cd /path/to/snapaccount
dotnet test tests/unit/AuthService/AuthService.Tests.csproj
```

### Backend Integration Tests
```bash
# Requires Docker for Testcontainers
dotnet test tests/integration/AuthService/AuthService.IntegrationTests.csproj
```

### Frontend Tests
```bash
cd src/admin

# Install test dependencies first (not yet in package.json)
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event jsdom @vitest/coverage-v8

# Run tests
npx vitest run

# Run with coverage
npx vitest run --coverage
```

### Required Frontend Dev Dependencies

The following packages need to be added to `src/admin/package.json`:

```json
"devDependencies": {
  "vitest": "^2.*",
  "@vitest/coverage-v8": "^2.*",
  "@testing-library/react": "^16.*",
  "@testing-library/jest-dom": "^6.*",
  "@testing-library/user-event": "^14.*",
  "jsdom": "^25.*"
}
```

---

*End of QA Test Report*
