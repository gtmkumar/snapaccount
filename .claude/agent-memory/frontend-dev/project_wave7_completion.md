---
name: project_wave7_completion
description: Wave 7 admin UI build completion — GAP-037/031/108/032/051 — reconciled contracts + Wave 7A residual reconciliation complete
metadata:
  type: project
---

Wave 7 (board task #46) complete as of 2026-06-12.
Wave 7A residual reconciliation complete as of 2026-06-12.

**Why:** 5 GAPs shipped concurrently with backend agents. All [confirm 7A/7B] markers reconciled against backend source.
Wave 7A addendum: 3 CA admin UI contract residuals that had workarounds in Wave 7 are now wired to the real endpoints.

## Features built (Wave 7)

- **GAP-037 Notification Template Manager**: `notificationTemplateApi.ts` (full 26-event catalog from `NotificationEventCatalog.cs`), `TemplateListPage`, `TemplateEditorPage`, plus 9 new UI primitives: `TemplateSourceChip`, `CharCounter`, `VariablePalette`, `TemplateBodyEditor`, `TemplatePreviewPane`
- **GAP-031 CA Consultations**: `caApi.ts`, `CaAvailabilityPage`, `CaAppointmentsPage`, `AvailabilityRuleEditor`
- **GAP-108 GST notice taxonomy**: `NoticeFormTypeBadge`, `GstatStageChip`, `GstatStageLadder`, `SimulatorEntryBanner`; extended `GstNoticeSchema` + `GstNoticeTypeSchema`
- **GAP-032 Tally Export**: added to `ReportsPage` + `reportApi.ts`
- **GAP-051 Auth security migration**: `authToken.ts` in-memory token, `api.ts` silent refresh + refresh-storm prevention + CSRF header

## Wave 7A residual reconciliation

### 1. CA profiles list
- **Before**: `GET /auth/admin/team-members?role=CA` (AuthService workaround), shape `{ userId, displayName, avatarUrl }`
- **After**: `GET /appointments/ca-profiles?activeOnly=true&pageSize=100` (ChatService, perm `chat.appointments.book`)
- **Backend DTO**: `CaProfileSummaryDto { caProfileId, userId, displayName, bio, specialisations, averageRating, ratingCount, isActive, createdAt }`
- **Frontend**: `caId = caProfileId` (normalisation in API client). `effectiveCaId` in `CaAvailabilityPage` is now the `caProfileId` UUID (not `userId`).

### 2. CA-initiated cancel
- **Before**: `POST /appointments/{id}/cancel` (user cancel, 2h rule, no reason)
- **After**: `POST /appointments/{id}/cancel-by-ca { reason }` (perm `chat.slots.manage`, no 2h rule)
- **Backend response**: `CancelByCaResponse { appointmentId, status, cancelledByCa }`
- Reason is mandatory on backend (FluentValidation: `NotEmpty()`). UI already had reason-required guard.
- `AppointmentSchema` extended with `cancelledByCa?: boolean`, `caCancellationReason?: string | null`.

### 3. Recurring availability rules
- **Before**: `/ca/:caId/availability/rules` (non-existent path, workarounds in all 4 CRUD functions)
- **After**: Real ChatService endpoints:
  - `GET /appointments/availability-rules?caProfileId=&activeOnly=true` → `ListAvailabilityRulesResponse { items: AvailabilityRuleResponse[] }`
  - `POST /appointments/availability-rules { weekday (int 0=Sun..6=Sat), startTimeIst (TimeSpan "HH:MM:SS"), endTimeIst, slotDurationMinutes, effectiveFrom (DateOnly "YYYY-MM-DD"), effectiveTo? }` → `AvailabilityRuleResponse`
  - `DELETE /appointments/availability-rules/{id}` → `{ ruleId, deleted }`
  - `POST /appointments/availability-rules/generate { caProfileId?, weeksAhead? }` → `GenerateSlotsFromRulesResponse { caProfileId, rulesProcessed, slotsCreated, slotsSkipped }`
- **Key contract notes**:
  - Backend weekday is .NET `DayOfWeek` int (0=Sunday, 1=Monday, ..., 6=Saturday), not string enum. Conversion maps kept in `caApi.ts`.
  - Backend time fields are `TimeSpan` serialised as `"HH:MM:SS"`. API client converts to/from `"HH:mm"` for HTML time inputs.
  - `AvailabilityRuleResponse.ruleId` (not `id`), `.caProfileId` (not `caId`), `.isActive` (not `active`). Frontend normalises these.
  - `ListAvailabilityRulesResponse.items` is a flat list (no pagination — unlike `ListCaProfilesResponse` which paginates).
  - `deleteAvailabilityRule(ruleId)` — now takes only `ruleId` (no `caId` param; backend scopes via `ICurrentUser`).
  - Availability blocks (blocked dates) have NO backend endpoint — stubs kept returning `[]`.
  - Preview panel replaced with `GenerateSlotsPanel` (on-demand slot generation).
- **New i18n keys added** (7 keys × 3 locales = 21): `ca.admin.availability.generateSlots`, `.generateSlots.desc`, `.generate`, `.generate.success`, `.weeksAhead`, `.weeks`; en/hi/bn parity maintained.

## Contract reconciliations ([confirm] markers resolved)

- **[7B] Auth**: `POST /auth/admin/refresh` returns `{ accessToken, expiresAt }`. Requires `X-Requested-With: XMLHttpRequest` CSRF header.
- **[7B] Notification templates**: Backend uses `id:guid` routing. Field names: `eventCode`, `locale`, `isActive`. Channel enum PascalCase: `Push/Sms/Email/InApp`.
- **[7A] CA appointments**: Live under `/appointments` (ChatService). Book body: `{ CaProfileId, SlotId, Notes? }`.
- **[7A/7B] Tally export**: `POST /reports/tally-export { PeriodStart?, PeriodEnd? }` returns `GenerateReportResponse`.

## Residual mismatches (all 3 now CLOSED)

All 3 residuals from the Wave 7 build are now wired to real backend contracts (Wave 7A addendum).

## i18n

2140 keys in en/hi/bn (perfect parity). Wave 7A added 7 new keys (`ca.admin.availability.generate*`, `.weeksAhead`, `.weeks`).

## Gates at Wave 7A reconciliation completion

- `npx vitest run`: 1078/1078 passing (57 files)
- `npm run lint`: 0 warnings, 0 errors
- `npm run build`: succeeds (tsc + vite)

## New test files

- `src/__tests__/caApiReconciliation.test.ts` — 19 tests: all 3 new API functions + conversion round-trips
- `src/__tests__/CaAvailabilityPage.test.tsx` — 6 tests: CA profile loading, rule list, generate slots panel
- `src/__tests__/CaAppointmentsPage.test.tsx` — 6 tests: list, drawer, cancel-by-ca flow

**How to apply:** When building future CA consultation features, use UUID-based routing (caProfileId from ChatService, not userId from AuthService). Weekday conversions and TimeSpan parsing are encapsulated in `caApi.ts` — do not duplicate elsewhere.
