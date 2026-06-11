---
name: project_wave7c_gst_notice_engine
description: Wave 7C GAP-108 GST notice automation — form-type taxonomy, statutory deadline engine, DRC simulator, GSTAT appeal tracking. Migration 084 applied. 164+16 tests green.
metadata:
  type: project
---

GAP-108 GST Notice Engine built on 2026-06-12 (migration 084).

**Why:** GSTN started enforcing DRC-01B (Rule 88C) and DRC-01C (Rule 88D) auto-notices in 2023. GSTAT backlog-appeal deadline is 30 Jun 2026. Customers need visibility before filing + deadline tracking.

**How to apply:** When extending GstService notice or appeal functionality, read these patterns first.

## What was built

### Domain changes
- `GstService.Domain/Enums/GstNoticeFormType.cs` — 7 enum values: ASMT_10, DRC_01, DRC_01A, DRC_01B, DRC_01C, ADT_01, OTHER
- `GstService.Domain/Enums/GstNoticeAppealStage.cs` — 6 stages: NONE, REPLY_FILED, ORDER_RECEIVED, APPEAL_FILED, GSTAT_PENDING, RESOLVED
- `GstService.Domain/Entities/GstNotice.cs` — 6 new fields + domain methods (SetFormType, SetStatutoryDeadline, OverrideDeadline, RecordOrderReceived, RecordAppealFiled, RecordGstatPending, ResolveAppeal, SetGstatBacklogFlag)
- `GstService.Domain/Entities/GstNoticeDeadlineRule.cs` — config entity for `gst.notice_deadline_rules`

### Application layer
- `IGstNoticeDeadlineService` — static `GetFinancialYear(DateOnly)` method + async deadline computation
- `IGstServiceOptions` — Clean Architecture boundary for config reading (no IConfiguration in Application)
- `SetNoticeFormTypeCommand` — PATCH /gst/notices/{id}/form-type; stamps statutory deadline on set
- `UpdateAppealStageCommand` — forward-only appeal stage machine; ORDER_RECEIVED requires OrderDate; sets 90-day appeal window; evaluates GSTAT backlog flag
- `GetNoticeDeadlineQuery` — full deadline DTO with days-remaining, overdue, GSTAT flag
- `SimulateDrcQuery` — DRC-01B (GSTR-1 vs 3B) and DRC-01C (itc_mismatches EXCESS_CLAIM) simulator; `dataAvailable=false` when source absent (never fakes verdict)
- `ListDeadlineRulesQuery` — lists `gst.notice_deadline_rules`
- Existing `ListNoticesQuery` and `GetNoticeQuery` extended with new fields + filters

### Infrastructure
- `GstNoticeDeadlineService` — DB-first deadline lookup with "ALL" sentinel + hardcoded fallback + warning log
- `GstServiceOptions` — reads `GstService:GstatBacklogAppealDeadline` from IConfiguration
- `GstNoticeDeadlineRuleConfiguration` — EF config for new table
- `GstNoticeConfiguration` — updated with 6 new columns, enum-as-string converters, new indexes

### API (`GstNoticeEngine.cs`)
New `EndpointGroupBase` under `/gst`:
- `PATCH /gst/notices/{id}/form-type` (gst-write-strict)
- `GET /gst/notices/{id}/deadline` (standard)
- `PATCH /gst/notices/{id}/appeal-stage` (gst-write-strict)
- `GET /gst/notices/simulate-drc?orgId=&formType=&fy=&month=` (standard)
- `GET /gst/notice-deadline-rules?fy=` (standard)

### Migration 084
File: `database/migrations/084_gst_notice_form_type_deadline_appeal.sql`
- Creates `gst.notice_deadline_rules` (21 seeded rows: FY 2025-26 + 2026-27 + "ALL" sentinel)
- Adds 6 columns to `gst.notices`
- Backfills form_type from notice_type text where possible (best-effort ILIKE matching)
- Fully idempotent (IF NOT EXISTS on all DDL)

## Key design decisions
- **Config-driven via DB table** (not appsettings) for deadline rules — FY-versioned, operator-editable without deploy
- **"ALL" sentinel row** for FY-agnostic fallback when no FY-specific rule exists
- **`IGstServiceOptions`** interface keeps `IConfiguration` out of Application layer (Clean Architecture boundary)
- **Enum-as-string** converter in EF (`HasConversion`) — resilient to enum reordering
- **DRC simulator reuses existing `gst.itc_mismatches` and `gst.gst_return`** data — no new data sources
- **GSTAT backlog flag** is stored on the notice entity (denormalized) AND recomputed in handlers to handle config date changes

## Test state (2026-06-12)
- GstService Unit: 164 pass (was 134; +30 new tests)
- GstService EfSmoke: 16 pass (was 12; +4 new tests including full-entity materialization for enum converters)
