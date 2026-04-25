---
name: QA Phase 6F FINAL State
description: Phase 6F QA COMPLETE (2026-04-25): 677/677 Vitest PASS (+192 tests), ChatService + SubscriptionService integration scaffolds compile clean (P6-INT-02)
type: project
---

Phase 6F (FINAL) QA gate complete as of 2026-04-25.

**Why:** Phase 6F added 5 admin pages (ChatInboxPage, ChatThreadDetailPage, ReportsPage, SubscriptionsPage, TeamPage) + 4 UI primitives (CommandPalette, KeyboardShortcutsOverlay, RoleGuard, ThemeContext/DarkModeToggle). All 8 settings sections verified for API wiring. StubPage usage = 0.

**How to apply:** Regression baseline is now 677 Vitest tests (all green). ChatService and SubscriptionService integration test scaffolds compile clean; blocked on InternalsVisibleTo (P6-INT-02).

## Test Counts (cumulative to Phase 6F)

| Suite | Tests | Status |
|-------|-------|--------|
| Frontend Vitest (35 files) | 677 | 677/677 PASS |
| ChatService integration scaffolds | 6 | Compile clean; Skip=P6-INT-02 |
| SubscriptionService integration scaffolds | 9 | Compile clean; Skip=P6-INT-02 |
| LoanService integration scaffolds | 9 | Compile clean; Skip=P6-INT-02 |
| Phase 6A+6E integration scaffolds | 43 | Compile clean; Skip=P6-INT-01 |

## Phase 6F New Files

Frontend tests (+192 tests, 10 new files):
- `src/admin/src/__tests__/ChatInboxPage.test.tsx` (18)
- `src/admin/src/__tests__/ChatThreadDetailPage.test.tsx` (20)
- `src/admin/src/__tests__/ReportsPage.test.tsx` (18)
- `src/admin/src/__tests__/SubscriptionsPage.test.tsx` (18)
- `src/admin/src/__tests__/TeamPage.test.tsx` (19)
- `src/admin/src/__tests__/CommandPalette.test.tsx` (17)
- `src/admin/src/__tests__/KeyboardShortcutsOverlay.test.tsx` (14)
- `src/admin/src/__tests__/RoleGuard.test.tsx` (9)
- `src/admin/src/__tests__/DarkModeToggle.test.tsx` (14)
- `src/admin/src/__tests__/SettingsSections.test.tsx` (45)

Integration scaffolds:
- `tests/integration/ChatService/ChatService.IntegrationTests.csproj`
- `tests/integration/ChatService/ChatServiceIntegrationTests.cs` (idempotency, IDOR, state machine, SEC-001)
- `tests/integration/SubscriptionService/SubscriptionService.IntegrationTests.csproj`
- `tests/integration/SubscriptionService/SubscriptionServiceIntegrationTests.cs` (state machine, Razorpay HMAC SEC-001)

Setup improvement:
- `src/admin/src/__tests__/setup.ts` — added `HTMLElement.prototype.scrollIntoView = () => {}` stub to suppress jsdom async timer errors

## Key Patterns Discovered (Phase 6F)

- TanStack Query v5 `useMutation.mutationFn` is called with `(variables, context)` — spy receives 2nd arg `{ client: QueryClient }`. Use `mock.calls[0][0]` to check first arg instead of `toHaveBeenCalledWith(value)`.
- `vi.mock('sonner', ...)` with a factory: DO NOT reference outer-scope variables in the factory (hoisting). Import `toast` from 'sonner' AFTER the mock declaration to get the spy instance.
- `EmptyState` with `variant="reports"` sets BOTH defaultTitle AND primaryCta label to "Generate your first report". Use `getAllByText()` not `getByText()`.
- `PlanDialog` with `useState(plan?.name ?? '')` does NOT reset state when `plan` prop changes (component always mounted). Test with explicit field filling rather than `getByDisplayValue`.
- `KeyboardShortcutsOverlay` uses `RoleChip` which maps role codes to human-readable labels (SYSTEM_ADMIN → "Admin"). Test via role descriptions, not raw role names.
- `scrollIntoView` not implemented in jsdom — stub in setup.ts to prevent unhandled async exceptions from chat page `scrollToBottom` timers.
- FluentAssertions `BeOneOf(int, int, string)` ambiguous overload. Use `BeOneOf(new[] { int1, int2 })` instead.

## Settings Wiring Summary (Phase 6F)

- API-wired (5): NotificationSettings, FeatureFlagsSettings, LanguageSettings, AiModelSettings, WhatsAppSettings
- Local-only pending API (2): PaymentGatewaySettings, TallySettings — verified `toast.success` fires with "saved locally — API endpoint pending"
- Pre-existing (1): PartnerBanksSettings (Phase 6C)

## Open Blockers

- P6-INT-01 (Medium): `InternalsVisibleTo` needed in AccountingService.Api.csproj, CallbackService.Api.csproj, NotificationService.Api.csproj — backend-agent
- P6-INT-02 (Medium): `InternalsVisibleTo` needed in LoanService.Api.csproj, GstService.Api.csproj, ChatService.Api.csproj, SubscriptionService.Api.csproj — backend-agent; Docker socket on CI runner — devops-engineer
