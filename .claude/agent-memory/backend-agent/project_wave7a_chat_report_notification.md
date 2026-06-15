---
name: wave-7a-chat-report-notification
description: Wave 7A GAP-031/032/037/043 — CA appointments, Tally export, template CRUD, bookmarks. Migrations 080/081. 216 tests green.
metadata:
  type: project
---

Wave 7A (batch A) complete on branch `2026-06-10-s5t4`. Migrations 080 and 081 applied + scratch-replayed against live PG.

**GAP-031 (ChatService, migration 080):** CaProfile + AppointmentSlot + Appointment entities. 7 endpoints under `/appointments/*`. IMeetingLinkProvider (Mock default, GoogleCalendar config-gated). AppointmentBookedEvent published to Pub/Sub. 2h cancel/reschedule rule enforced in domain. Rating aggregate on CaProfile (RecordRating rolling average). Permissions: `chat.appointments.book` (SUPER_ADMIN/ORG_ADMIN/ORG_MEMBER), `chat.slots.manage` (SUPER_ADMIN/ORG_ADMIN).

**GAP-043 (ChatService):** MessageBookmark entity (UNIQUE index user_id+message_id WHERE deleted_at IS NULL). ToggleBookmark command + ListBookmarks query under `/appointments/bookmarks/*`. Permission: `chat.read`.

**GAP-032 (ReportService):** TallyExportGenerator (IReportGenerator, not BaseReportGenerator). ReportType.TallyExport=8. Feature flag `Report:TallyExportEnabled`. XML: ENVELOPE/HEADER/BODY/IMPORTDATA (Masters+Vouchers). CSV fallback. Cross-schema raw Npgsql reads from `accounting.*`. POST `/reports/tally-export`.

**GAP-043 (ReportService):** ChatThreadPdfGenerator. ReportType.ChatThreadPdf=9. Thread ID encoded in FinancialYear field. IDOR guard via raw SQL on chat.threads. QuestPDF render. POST `/reports/chat-thread-pdf`.

**GAP-037 (NotificationService, migration 081):** NotificationTemplate CRUD (6 endpoints under `/notifications/templates`). Retire(), Update(), RenderWithWarnings() domain methods. TestSend dispatches to calling admin only. Permission: `notification.templates.manage` (SUPER_ADMIN only). Migration 081 adds created_by/updated_by UUID + backfills effective_from NULLs (2024-04-01 default — existing seeded rows had NULL, which caused InvalidCastException on non-nullable DateOnly).

**Why:** effective_from NULL fix is critical — EF maps DateOnly as non-nullable; old seeded template rows from migration 008/015 lacked this value.

**How to apply:** Any future service that adds a DateOnly (non-nullable) column to an existing table with seeded rows MUST include a backfill UPDATE in the same migration.

**Test counts:** ChatService 99 (50 unit + 12 EfSmoke + 37 pre-existing), NotificationService 89 (80 unit + 9 EfSmoke), ReportService 28 (all unit). All green.

**ICurrentUser pattern confirmed:** `UserId` is `Guid` (non-nullable) — never use `.HasValue` / `.Value`. Check `currentUser.UserId == default` for unauthenticated guard. `OrganizationId` is `Guid?` — use `.HasValue` as normal.
