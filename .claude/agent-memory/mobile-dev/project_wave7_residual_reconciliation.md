---
name: project-wave7-residual-reconciliation
description: Wave 7 mobile residual reconciliation — all 6 documented contract mismatches closed against shipped backend endpoints (2026-06-12).
metadata:
  type: project
---

# Wave 7 mobile residual reconciliation (2026-06-12)

All "RESIDUAL CONTRACT MISMATCHES" blocks in `src/api/appointments.ts` and
`src/api/auth.ts` are CLOSED — backend reference:
`.claude/agent-memory/backend-agent/project_wave7_mobile_reconciliation.md`.

## Contracts now consumed (verified against backend source, not docs)

- `GET /appointments/{id}` → AppointmentDetailDto (list DTO + Topic, Notes,
  RatingComment, RatedAt, CancelledByCa, CaCancellationReason). getAppointment()
  list-scan removed; returns `AppointmentDetail extends Appointment`.
- `topic` first-class on POST /appointments + AppointmentSummaryDto (migration
  086 CHECK: ACCOUNTING|GST|ITR|LOAN|OTHER, NULL on legacy rows). The
  "[TOPIC] " notes-prefix encode/decode is GONE — never reintroduce.
- `GET /appointments/slots/day-map?caProfileId&from&to` (YYYY-MM-DD, ≤90 days,
  inclusive) → `{days:[{date, availableCount}]}` — feeds DateStrip via a
  separate query in SlotPickerScreen (`['ca-slot-day-map', caId, from, to]`).
  `SlotAvailabilityResponse` no longer has `days`.
- BookmarkDto enriched: `messageCreatedAt`, `senderUserId` (null post-DPDP
  erasure), `senderRole` (USER|CA|ADMIN|SYSTEM|AI), `threadSubject`.
  senderDisplayName INTENTIONALLY absent (schema-per-service isolation) —
  BookmarkRow renders role-based fallback via
  `mobile.chat.bookmarks.sender.*` (you/member/ca/admin/system/ai, en+hi+bn),
  "You" when senderRole=USER && senderUserId === authStore user id.
- `GET /auth/devices/my-approval-status` → `{approvalRequestId, status:
  PENDING|APPROVED|DENIED|EXPIRED|UNKNOWN, decidedAt, expiresAt, mode:
  ENFORCE|NOTIFY_ONLY}`. DeviceWaitingScreen polls this (3s) for the REAL
  verdict; pending-list lookup kept only as one-shot metadata echo.
  `mode=NOTIFY_ONLY` → no gate: markAuthenticated() immediately (spec §4.2 —
  old devices get the info banner, new device proceeds).
  `DeviceApprovalMode` is now `'ENFORCE' | 'NOTIFY_ONLY'` (was 'NOTIFY' —
  DevicesScreen literals updated too).
- GST notice statuses: server shims legacy REQUEST filters (Open→RECEIVED,
  Overdue→UNDER_REVIEW, Responded→RESPONDED, Closed→CLOSED) at the ListNotices
  endpoint; responses were always canonical → removed all client legacy
  tolerance (noticeStatus.ts SETTLED list, `status === 'Overdue'` branch,
  Gst/ItrNoticeDetailScreen 'Closed'/'Responded' spellings).

## Still deferred (product-gated, TL decision pending — do NOT build)
- approximate-location (cityApprox) on approval requests; resend-push action.

## Gotchas
- Old-device DeviceApprovalScreen/DevicesScreen still legitimately use the
  pending-approvals list (that's their contract); only the NEW-device verdict
  heuristic was replaced.
- TanStack Query cache is in-memory only (no persistQueryClient) — "cached
  legacy payload" tolerance arguments are void.

## Gate results (2026-06-12)
- npx jest: 76 suites / 715 tests, all green (was ~710 before this slice).
- npm run lint: clean. npm run type-check: 0 errors.
