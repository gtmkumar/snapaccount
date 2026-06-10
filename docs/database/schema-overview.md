# SnapAccount — Database Schema Overview

> Produced by: db-engineer
> Date: 2026-04-04
> Status: COMPLETE — covers all 12 schemas (11 services + shared)

---

## 1. Migration Execution Order

```
000_init.sql                 — Extensions + schema creation + shared trigger function
001_auth_schema.sql          — Auth service
002_document_schema.sql      — Document service
003_accounting_schema.sql    — Accounting service
004_gst_schema.sql           — GST service
005_loan_schema.sql          — Loan service
006_itr_schema.sql           — ITR service
007_chat_schema.sql          — Chat service
008_notification_schema.sql  — Notification service
009_report_schema.sql        — Report service
010_subscription_schema.sql  — Subscription service
011_ai_schema.sql            — AI service (pgvector)
012_shared_schema.sql        — Shared cross-cutting tables
999_seed_reference_data.sql  — Reference / seed data
```

---

## 2. Table Count per Schema

| Schema         | Tables | Notes                                         |
|----------------|--------|-----------------------------------------------|
| auth           | 9      | user, user_profile, organization, org_member, role, permission, role_permission, user_role, user_device, otp_request, refresh_token, user_preference — actually **11** tables |
| document       | 8      | document (partitioned), document_page, document_category, ocr_result, ocr_field, ocr_feedback, document_tag, document_share, document_archive — **9** tables |
| accounting     | 9      | account, journal_entry, journal_entry_line, ledger, financial_period, trial_balance, balance_sheet, profit_and_loss, cash_flow_statement, opening_balance, financial_year_close — **11** tables |
| gst            | 10     | gst_return, gst_return_line_item, gst_invoice, gst_tax_rate, hsn_sac_code, itc_record, itc_mismatch, gst_callback, gst_notice, e_invoice, e_way_bill, gst_reconciliation — **12** tables |
| loan           | 8      | loan_application, loan_type, eligibility_criteria, document_package, loan_consent, partner_bank, loan_offer, loan_disbursement, emi_schedule — **9** tables |
| itr            | 11     | itr_return, itr_document, itr_checklist, itr_checklist_item, tax_computation, tax_slab, tax_regime, e_verification, itr_callback, itr_notice, itr_refund, tds_entry, tds_return — **13** tables |
| chat           | 7      | conversation, message, message_attachment, appointment, appointment_slot, ca_profile, ca_rating, chat_query — **8** tables |
| notification   | 5      | notification (partitioned), notification_template, notification_preference, device_push_token, notification_log — **5** tables |
| report         | 3      | report, report_template, report_schedule, export_job — **4** tables |
| subscription   | 5      | subscription_plan, subscription, subscription_invoice, payment, usage_record — **5** tables |
| ai             | 6      | knowledge_base, knowledge_document, document_chunk, user_document_embedding, ai_session, ai_message, ai_model_config — **7** tables |
| shared         | 6      | audit_log (partitioned), system_configuration, feature_flag, api_rate_limit, consent_record, data_deletion_request — **6** tables |
| **TOTAL**      | **100**|                                               |

---

## 3. Schema Relationships (ASCII Diagram)

```
auth.user ─────────────────────────────────────────────────────────┐
    │                                                               │
    ├── auth.user_profile                                          │
    ├── auth.user_device                                           │
    ├── auth.user_role ──── auth.role ──── auth.role_permission    │
    ├── auth.user_preference                                       │
    ├── auth.refresh_token                                         │
    ├── auth.otp_request                                           │
    │                                                               │
    └── auth.organization ─── auth.organization_member ───────────┘
            │
            │  (organization_id referenced cross-schema by value)
            │
            ├── accounting.financial_period
            ├── accounting.account ── accounting.journal_entry ── accounting.journal_entry_line
            ├── accounting.ledger
            ├── accounting.trial_balance / balance_sheet / pnl / cash_flow
            ├── accounting.opening_balance / financial_year_close
            │
            ├── gst.gst_return ── gst.gst_return_line_item
            │       │
            │       ├── gst.gst_invoice ── gst.e_invoice
            │       ├── gst.itc_record ── gst.itc_mismatch
            │       └── gst.gst_reconciliation
            ├── gst.gst_callback / gst_notice / e_way_bill
            │
            ├── loan.loan_application ── loan.document_package
            │       ├── loan.loan_consent
            │       ├── loan.loan_offer ── loan.partner_bank
            │       ├── loan.loan_disbursement
            │       └── loan.emi_schedule
            │
            ├── subscription.subscription ── subscription.subscription_plan
            │       ├── subscription.subscription_invoice
            │       ├── subscription.payment
            │       └── subscription.usage_record
            │
            └── report.report / report_schedule / export_job

auth.user (user_id referenced cross-schema by value)
    │
    ├── document.document (partitioned) ── document.document_page
    │       ├── document.ocr_result ── document.ocr_field ── document.ocr_feedback
    │       ├── document.document_tag
    │       ├── document.document_share
    │       └── document.document_archive
    │
    ├── itr.itr_return ── itr.itr_document
    │       ├── itr.itr_checklist ── itr.itr_checklist_item
    │       ├── itr.tax_computation ── itr.tax_regime ── itr.tax_slab (temporal)
    │       ├── itr.e_verification
    │       ├── itr.itr_refund
    │       └── itr.itr_notice / itr_callback
    ├── itr.tds_entry / tds_return
    │
    ├── chat.conversation ── chat.message ── chat.message_attachment
    │       ├── chat.appointment ── chat.appointment_slot
    │       ├── chat.ca_profile ── chat.ca_rating
    │       └── chat.chat_query
    │
    ├── notification.notification (partitioned)
    │       ├── notification.notification_template
    │       ├── notification.notification_preference
    │       ├── notification.device_push_token
    │       └── notification.notification_log
    │
    ├── ai.ai_session ── ai.ai_message
    ├── ai.user_document_embedding
    │
    └── shared.consent_record / data_deletion_request

Reference / Lookup tables (no user FK, global):
    gst.gst_tax_rate (temporal)
    gst.hsn_sac_code
    itr.tax_regime / tax_slab (temporal)
    loan.loan_type / partner_bank / eligibility_criteria
    document.document_category
    notification.notification_template
    subscription.subscription_plan
    ai.knowledge_base ── ai.knowledge_document ── ai.document_chunk (HNSW)
    ai.ai_model_config

Shared / Platform:
    shared.audit_log (partitioned, append-only)
    shared.system_configuration
    shared.feature_flag
    shared.api_rate_limit
```

---

## 4. Key Design Decisions

### 4.1 Row-Level Security (RLS)

RLS is enabled on all user-owned tables. The application sets a per-request session variable:

```sql
SET LOCAL app.current_user_id = '<uuid>';
```

### 4.1.1 Audit Log Immutability (SEC-010)

The `shared.audit_log` table is protected by two PostgreSQL rules that silently discard any DELETE or UPDATE operations, making it append-only at the database level:

- `no_delete_audit_log` -- `ON DELETE DO INSTEAD NOTHING`
- `no_update_audit_log` -- `ON UPDATE DO INSTEAD NOTHING`

Combined with Cloud SQL point-in-time recovery (PITR), this provides a two-layer immutable audit trail as required for ICAI CA audit compliance. See `database/shared/V2__audit_log_immutability.sql`.

Three isolation patterns are used:

**User isolation** (personal data): Policy checks `user_id = current_setting('app.current_user_id')::UUID`.
Used on: `auth.user`, `auth.user_profile`, `auth.user_device`, `auth.refresh_token`, `auth.user_preference`, `document.document`, `itr.itr_return`, all ITR sub-tables, `loan.loan_application`, `chat.conversation`, `chat.message`, `notification.notification`, `ai.ai_session`, `ai.ai_message`, `ai.user_document_embedding`, `shared.consent_record`, `shared.data_deletion_request`.

**Organization isolation** (business data): Policy checks that `organization_id` is in the set of orgs the current user owns or is a member of.
Used on: `accounting.*`, `gst.*`, `subscription.*`, `report.*`.

**Dual isolation** (shared context): Chat conversations and appointments use both user_id and CA user_id.

**System/admin bypass**: Application-level service accounts connect as a superuser role that bypasses RLS for admin operations.

### 4.2 Partitioning Strategy

Three high-volume tables are partitioned by month (`RANGE` on timestamp):

| Table | Partition Column | Partition Type | Retention |
|-------|-----------------|----------------|-----------|
| `document.document` | `uploaded_at` | RANGE monthly | 7 years (statutory) |
| `notification.notification` | `created_at` | RANGE monthly | 2 years (configurable) |
| `shared.audit_log` | `created_at` | RANGE monthly | 7 years (statutory) |

- Initial partitions cover 2026 (full year).
- A `_default` catch-all partition prevents insert failures for unmapped months.
- New monthly partitions are created automatically by `shared.create_audit_log_partitions(12)`, called via Cloud Scheduler on the 1st of each month (SEC-019). See `database/shared/V3__audit_log_partition_automation.sql` and `database/shared/cloud-scheduler-partition-job.md`.
- Old partitions (beyond retention window) can be `DETACH`ed and dropped without table locks.
- All partition parent tables use composite primary keys: `(id, partition_column)`.

### 4.3 Temporal Tables (Versioned Government Data)

Tax rates and tax slabs change with government policy. Both tables use a `valid_from` / `valid_to` date range pattern:

```
gst.gst_tax_rate  — GST rates (changed by GST Council notifications)
itr.tax_slab      — Income tax slabs (changed annually by Union Budget)
```

To find the rate active on a given date:
```sql
SELECT * FROM gst.gst_tax_rate
WHERE rate_pct = 18
  AND valid_from <= '2024-07-01'
  AND (valid_to IS NULL OR valid_to > '2024-07-01');
```

When a rate changes, a new row is inserted with the new `valid_from` date, and the previous row's `valid_to` is set to the same date (application enforces this invariant).

### 4.4 pgvector and HNSW Indexes

The `ai` schema uses the `vector` extension (pgvector) for RAG:

| Table | Column | Dimension | Purpose |
|-------|--------|-----------|---------|
| `ai.document_chunk` | `embedding` | 768 | Knowledge base RAG retrieval |
| `ai.user_document_embedding` | `embedding` | 768 | User document semantic search |

Vector dimension 768 matches Google's `text-embedding-004` model (Vertex AI).

HNSW index configuration:
```sql
CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```
- `m = 16`: 16 connections per node — good balance for recall vs. memory.
- `ef_construction = 64`: Index build quality.
- `vector_cosine_ops`: Cosine similarity (normalized embeddings, appropriate for text).

At query time, set `hnsw.ef_search` for accuracy tuning:
```sql
SET hnsw.ef_search = 100;  -- Higher = better recall, slower
```

### 4.5 Aadhaar Data Handling

Per UIDAI guidelines, Aadhaar numbers are **never stored in full**. Only the last 4 digits are stored in:
- `auth.user_profile.aadhaar_last4 VARCHAR(4)`

The full Aadhaar number is used only transiently (in memory) for OTP-based KYC verification via the UIDAI API and is never persisted.

### 4.6 Cross-Schema References

Services own their own schema. Cross-schema references use **foreign keys by value** (UUID stored, no DB-level FK constraint). This allows future schema-per-database migration without breaking FK constraints.

Key cross-schema references:

| Column | Source Schema | Referenced Schema | Reference Type |
|--------|--------------|-------------------|----------------|
| `user_id` | all schemas | auth.user | By value (UUID) |
| `organization_id` | accounting, gst, loan, subscription, report | auth.organization | By value (UUID) |
| `document_id` | gst.gst_invoice, itr.itr_document | document.document | By value (UUID) |
| `conversation_id` | ai.ai_session | chat.conversation | By value (UUID) |

### 4.7 Audit Columns

Every table (except partitioned tables which use `event_time`/`created_at` only) has:

```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- Auto-updated by trigger
deleted_at  TIMESTAMPTZ                          -- Soft delete (NULL = not deleted)
created_by  UUID                                 -- auth.user.id of creator
updated_by  UUID                                 -- auth.user.id of last updater
```

The `shared.set_updated_at()` trigger function is installed on every mutable table.

Soft deletes: Most queries should include `WHERE deleted_at IS NULL`. The application layer enforces this; partial indexes on frequently filtered columns include this condition.

### 4.8 DPDP Act 2023 Compliance

- `shared.consent_record` — Immutable consent trail with hash of consent text shown.
- `shared.data_deletion_request` — Right-to-erasure request tracking.
- `auth.user.is_deleted` — Flag for DPDP erasure completion.
- `loan.loan_consent` — Per-loan explicit consent for bank data sharing (RBI digital lending guidelines).
- 7-year document retention supported by partitioned tables + `document.document_archive` lifecycle management.
- All data stored in `asia-south1` (Mumbai) region per DPDP data localization requirement.

---

## 5. Index Strategy

### 5.1 Foreign Key Indexes

Every foreign key column has a B-tree index. This prevents table scans during cascades and join operations.

### 5.2 Status/Filter Indexes

Partial indexes are used for active/non-deleted rows to reduce index bloat:

```sql
-- Example partial indexes
CREATE INDEX idx_gst_return_deadline ON gst.gst_return (filing_deadline) WHERE status != 'FILED';
CREATE INDEX idx_notification_unread ON notification.notification (user_id, is_read, created_at) WHERE is_read = FALSE;
```

### 5.3 Text Search Indexes

GIN indexes with `pg_trgm` for ILIKE search:

```sql
CREATE INDEX idx_document_vendor_name ON document.document USING gin (vendor_name gin_trgm_ops);
CREATE INDEX idx_hsn_sac_description ON gst.hsn_sac_code USING gin (description gin_trgm_ops);
```

### 5.4 JSONB Indexes

JSONB columns (`raw_response`, `data_snapshot`, etc.) are not indexed by default. Application code should use `jsonb_path_ops` GIN indexes if specific JSON keys are frequently queried in WHERE clauses.

### 5.5 Composite Indexes

Composite indexes for the most common query patterns:

```sql
-- Documents by user within a time range
idx_document_user_id ON document.document (user_id, uploaded_at)

-- Notifications: user's unread
idx_notification_user_id ON notification.notification (user_id, created_at)

-- Journal entries by org + date
idx_journal_entry_org_id, idx_journal_entry_entry_date

-- GST returns by org + status (pending returns queue)
idx_gst_return_status ON gst.gst_return (status, organization_id)
```

---

## 6. Partition Management (Ongoing)

### 6.1 Automated Partition Creation (SEC-019)

The function `shared.create_audit_log_partitions(months_ahead)` automatically creates monthly partitions for `shared.audit_log` up to N months in advance. It is idempotent -- existing partitions are skipped.

A **Cloud Scheduler** job calls this function on the **1st of each month** at 02:00 IST. See `database/shared/cloud-scheduler-partition-job.md` for setup instructions.

```sql
-- Manually create partitions if needed:
SELECT shared.create_audit_log_partitions(12);
```

For `document.document` and `notification.notification`, partitions are still created manually or via Hangfire:

```sql
-- Example: Create 2027-01 partitions for document and notification
CREATE TABLE document.document_2027_01 PARTITION OF document.document
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE notification.notification_2027_01 PARTITION OF notification.notification
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
```

**Archival (7-year retention):** Old document partitions beyond 7 years can be detached and dropped:

```sql
ALTER TABLE document.document DETACH PARTITION document.document_2019_01;
DROP TABLE document.document_2019_01;
```

---

## 7. Connection Configuration

```
Host:     localhost (dev) / Cloud SQL proxy (prod)
Port:     5432
Database: snapaccount
Username: snapaccount_app   (app user with RLS)
          snapaccount_admin  (admin user, bypasses RLS)
```

**Per-request RLS setup** (application middleware must do this for every request):

```sql
BEGIN;
SET LOCAL app.current_user_id = '<authenticated-user-uuid>';
-- Execute query
COMMIT;
```

For system/background jobs that need to bypass RLS:
```sql
-- Connect as snapaccount_admin role which has BYPASSRLS attribute
SET ROLE snapaccount_admin;
```

---

## Phase 6 Additive Migrations (6A + 6E)

> Added: 2026-04-25 · db-engineer · additive-only, no destructive changes.
> Migrations: `016_accounting_posting_pipeline.sql`, `017_notification_preferences_templates.sql`, `018_callback_schema.sql`.

### Migration Execution Order — Phase 6 addendum

```
016_accounting_posting_pipeline.sql       — OCR -> Accounting pipeline (6A)
017_notification_preferences_templates.sql — Notification extensions + DLQ (6E)
018_callback_schema.sql                    — NEW callback schema (6E, 12th service)
```

### 6A — Accounting posting pipeline

New tables (all in `accounting`):

| Table | Purpose | Key indexes | RLS |
|---|---|---|---|
| `ledger_entries` | Single-row double-entry rows for OCR auto-postings. Each row has `debit_account_id` + `credit_account_id` + `amount`. Co-exists with the normalized `journal_entry` / `journal_entry_line` pair (unchanged). | `(org_id, fy_year, period_month)`, `(document_id)`, `(posted_at)`, partial `(dedupe_hash)` unique | Yes — org isolation via `auth.organization_member` / `organization.owner_user_id` |
| `posting_audit` | Before/after snapshot per auto-post or review action. Captures confidence score, model version, reviewer decision. | `(org_id, created_at)`, `(ledger_entry_id)`, `(document_id)`, `(action)` | Yes — org isolation |
| `coa_template` | System-wide Indian-standard Chart of Accounts seed (1xxx assets / 2xxx liab / 3xxx equity / 4xxx income / 5xxx expense). Consumed at org bootstrap to materialize per-org `accounting.account` rows. Seeded with `ON CONFLICT DO NOTHING`. | `(account_type)`, `(parent_code)` | No — system data |

Column additions:

| Table | Column | Reason |
|---|---|---|
| `document.document` | `extracted_entities JSONB` (+ GIN index) | Normalized Document-AI extraction payload (vendor, GSTIN, line_items, tax, totals) consumed by AccountingService posting pipeline. Added at the partitioned parent — propagates to all existing and future monthly partitions. |

**Note on `fiscal_year_close`:** The phase-6A scope calls for a new `accounting.fiscal_year_close` table. An equivalent table `accounting.financial_year_close` already exists from `003_accounting_schema.sql` with matching shape (`organization_id`, `financial_year`, `status`, `initiated_at`, `completed_at`, `retained_earnings`). Per additive-only rules we did NOT rename it. Backend-agent should map the domain entity `FiscalYearClose` onto the existing `financial_year_close` table.

### 6E — Notification extensions

Column additions to existing notification tables (8 new columns total):

| Table | Columns added | Reason |
|---|---|---|
| `notification.notification_preference` | `quiet_hours_start`, `quiet_hours_end`, `quiet_hours_timezone`, `dnd_enabled`, `dnd_until`, `dedup_window_minutes`, `preferred_locale` | Phase 6E I2 rules: do-not-disturb + quiet hours + 6h dedup window + per-user locale (en/hi/bn). |
| `notification.notification_template` | `version`, `is_current`, `effective_from`, `effective_to`, `dlt_template_id`, `sender_id`, `approval_status` | Versioned templates per-locale; MSG91 DLT template-id registry (Indian SMS regulation); approval workflow. Partial-unique index `(event_type, channel, language)` where `is_current=TRUE`. |
| `notification.notification_log` | `status` (QUEUED/SENT/DELIVERED/FAILED/BOUNCED), `retry_count`, `cost_inr`, `failure_reason`, `last_attempt_at`, `next_retry_at` | Full status progression + retry/backoff bookkeeping; normalized INR cost column. |

New table:

| Table | Purpose | Key indexes | RLS |
|---|---|---|---|
| `notification.dlq_items` | Dead-letter queue for notifications that exhausted retries. Operators inspect + optionally requeue. | `(user_id)`, `(event_type)`, `(channel)`, partial `(resolution_status='OPEN')`, `(last_failed_at)` | Yes — user-scoped (operators use BYPASSRLS admin role) |

### 6E — NEW `callback` schema (CallbackService — the 12th microservice)

This introduces the 12th microservice. The schema-per-service count moves from 11 → 12. `CLAUDE.md` and `project-brief.md` must be updated to reflect this.

| Table | Purpose | Key indexes | RLS |
|---|---|---|---|
| `callback.callbacks` | The callback request + state machine. Status enum: PENDING / SCHEDULED / IN_PROGRESS / COMPLETED / FOLLOW_UP_NEEDED / ESCALATED_TO_CA / CANCELLED. Category: GST / ITR / DOC / LOAN / BILLING / OTHER. Priority: LOW / NORMAL / HIGH / URGENT. Carries `preferred_window` and `scheduled_at` as TSTZRANGE. SLA + CSAT fields. | `(org_id, requested_at DESC)`, `(assigned_to)`, `(status, org_id)`, `(priority, status)` partial, `(sla_due_at)` partial, `(category, org_id)`, `(linked_entity_type, linked_entity_id)`, GiST on `scheduled_at` | Yes — org member **OR** assigned agent |
| `callback.call_notes` | CA-authored notes per callback: body, outcome, duration_minutes, visibility (INTERNAL/USER_VISIBLE). | `(callback_id, recorded_at DESC)`, `(author_id)` | Yes — inherits from parent callback visibility |
| `callback.assignments_log` | Audit of every (re)assignment: `from_user_id`, `to_user_id`, `assigned_by`, `reason`. | `(callback_id, assigned_at DESC)`, `(to_user_id)`, `(assigned_by)` | Yes — inherits from parent callback |
| `callback.kpi_daily_snapshot` | **MATERIALIZED VIEW**. Per-org daily rollup: counts by status, `avg_ttr_minutes`, `count_sla_breached`, `avg_csat`. Refreshed by scheduled job (ownership TBD with devops-engineer: Hangfire vs Cloud Scheduler decision). Unique index `(org_id, snapshot_date)` supports `REFRESH CONCURRENTLY`. | `(org_id, snapshot_date)` unique, `(snapshot_date)` | **No** — Postgres MVs cannot have RLS. Consumers must filter by `org_id` at the API layer OR via a `SECURITY INVOKER` wrapper function. Flagged to security-reviewer. |

### DPDP right-to-erasure changelog (SEC-008 cascade)

The existing DPDP cascade pattern (SEC-008, added in earlier phases) must extend to the new callback schema. Two operations on org erasure:

1. **Soft-delete call notes** — set `callback.call_notes.deleted_at = NOW()` for every row whose `callback_id` belongs to an erased org. Because `call_notes` has `ON DELETE CASCADE` on `callback_id`, hard-deleting the parent row will also remove notes; the soft-delete route is preferred for audit continuity.
2. **Anonymize callback rows** — set `callback.callbacks.user_id = NULL`, `anonymized_at = NOW()`, `anonymization_reason = 'DPDP_ORG_ERASURE'`. Retain the row itself for regulatory + service-quality reporting (no PII remaining).

Enforcement lives in the application layer — the migration provides the `deleted_at`, `anonymized_at`, and `anonymization_reason` columns needed. Security-reviewer should add this to the SEC-008 regression matrix.

### RLS policy conventions used

- Org-scoped tables use the established pattern: `organization_id IN (SELECT ... FROM auth.organization_member WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID AND is_active = TRUE UNION SELECT id FROM auth.organization WHERE owner_user_id = ...)`.
- `callback.callbacks` additionally unions in `assigned_to = current_user_id` so assigned CA/ops agents see callbacks regardless of org membership.
- Child tables (`call_notes`, `assignments_log`) check visibility by re-evaluating the parent `callback.callbacks` policy via subquery.
- DLQ is user-scoped with `user_id IS NULL OR user_id = current_user_id`; operator access is via the BYPASSRLS `snapaccount_admin` role.

### Index rationale (new tables)

- **`ledger_entries.(org_id, fy_year, period_month)`** — supports the trial-balance / P&L / balance-sheet report queries which always filter by these three columns.
- **`ledger_entries.(dedupe_hash)` partial unique** — enforces the I2/idempotency rule (no duplicate post for the same `document_id + payload_hash`). Partial-unique because hash is NULL for MANUAL entries.
- **`callbacks` partial index on `sla_due_at` where `sla_breached=FALSE AND status NOT IN ('COMPLETED','CANCELLED')`** — powers the SLA-breach monitor job (cheap scan of open callbacks approaching SLA).
- **`callbacks` GiST on `scheduled_at` TSTZRANGE** — enables overlap queries for agent-calendar conflict detection.
- **`dlq_items` partial index on `resolution_status='OPEN'`** — keeps the operator inbox query fast as DLQ grows.

---

## Phase 6D Addendum — ITR Engine (additive)

> Migrations: `023_itr_tax_slabs_deductions.sql`, `024_itr_assessee_filings.sql`, `025_itr_notices_refunds_verification.sql`
> Date: 2026-04-25

### New tables

| Table | Purpose |
|-------|---------|
| `itr.tax_slab_versions` | AY-versioned tax slabs (OLD/NEW). `slabs_jsonb` array of `{from, to, rate}` brackets. Source-citation tracked per row. |
| `itr.deduction_sections` | AY-versioned deduction-section catalogue (`80C`, `80CCD(1B)`, `80D`, `80E`, `80G`, `80TTA`, `80TTB`, `HRA`, `24B`, `STD_DEDUCTION`, `80CCD(2)`). `regime` ∈ `OLD`/`NEW`/`BOTH`. |
| `itr.assessee_profiles` | Per-AY profile snapshot (`UNIQUE(user_id, ay)`). PAN encrypted at rest. Holds salary/business/house-property/CG/other-income/deductions JSONB. |
| `itr.filings` | Canonical filing record per `(user_id, ay)`. Holds totals, `tax_slab_version_id` pin (audit/replay), `computation_jsonb` snapshot, status state-machine, CA review fields, ack number, ITR-V GCS object key + short-lived signed URL. |
| `itr.form_16_extracts` | Parsed Form 16 payload (Document AI). Holds employer TAN (plaintext), employee PAN (ciphertext), `parsed_json`. DPDP-cascade fields. |
| `itr.notices` | Unified IT notice tracker (parallel to `gst.notices`). DPDP-cascade fields, CA assignment, due-date partial index. |
| `itr.refund_status_log` | Append-only refund status transitions. Latest by `(filing_id, status_date)` is current. `raw_payload_jsonb` for replay. |
| `itr.verification_queue` | CA review queue with rounds. `UNIQUE(filing_id, queue_round)`; new row per resubmit. Partial SLA-breach index. |

> **Note:** legacy tables `itr.itr_return`, `itr.tax_slab`, `itr.tax_regime`, `itr.itr_notice`, `itr.itr_refund` remain in place for compatibility. New code paths target the Phase 6D tables.

### Tax-slab versioning by AY (CRITICAL — no UPDATEs)

`itr.tax_slab_versions` is **immutable** per `(ay, regime, effective_from)`:

- AY rollover (April 1 each year) is handled by **INSERTing a new row**, never `UPDATE`.
- The tax computation engine resolves slabs by `(ay, regime)`; past filings always replay against the slab version they were filed under.
- A filing pins `tax_slab_version_id` at compute time so audit/replay is deterministic even if the engine later loads a newer row for the same AY.
- Mid-year amendment (rare): insert a new row with later `effective_from` and let the engine pick by date.

**Seeded slabs** (per Finance Act 2024 / 2025):

- **AY2025-26 OLD**: 0/2.5L / 5%/2.5–5L / 20%/5–10L / 30%/>10L; rebate 87A ₹12,500 if ≤ ₹5L; std ded ₹50,000.
- **AY2025-26 NEW**: 0/3L / 5%/3–7L / 10%/7–10L / 15%/10–12L / 20%/12–15L / 30%/>15L; rebate 87A ₹25,000 if ≤ ₹7L; std ded ₹75,000.
- **AY2026-27 OLD**: same as AY2025-26 OLD (no Finance Act 2025 change to old regime).
- **AY2026-27 NEW**: 0/4L / 5%/4–8L / 10%/8–12L / 15%/12–16L / 20%/16–20L / 25%/20–24L / 30%/>24L; rebate 87A ₹60,000 if ≤ ₹12L; std ded ₹75,000.

`-- TODO verify` markers are left on AY2026-27 rows for backend-agent / domain expert pre-July-2026 confirmation.

### Assessee profile per-AY snapshot

- `UNIQUE(user_id, ay)`. A new row per AY captures residency / employment / deductions for that year.
- Engine reads `dob` to determine senior (60–79) / super-senior (80+) basic exemption uplift in OLD regime.
- `pan` column is `TEXT` (not `varchar(10)`) to accommodate AES-256-CBC ciphertext + IV envelope produced by `IPanEncryptionService` (per SEC-013). **Plaintext PAN is never stored**. `pan_last4` is a convenience column for masked UI display.

### DPDP cascade

User right-to-erasure must cascade to:

1. `itr.assessee_profiles` — soft-delete (`deleted_at = NOW()`), null out PII fields, retain row only if `retention_until > now()` (7-yr IT minimum).
2. `itr.filings` — soft-delete; ITR-V object should be deleted from GCS, `itr_v_object_key`/`itr_v_uri` nulled.
3. `itr.form_16_extracts` — set `anonymized_at = NOW()`, `anonymization_reason = 'DPDP_USER_ERASURE'`, null out `parsed_json`, `employer_tan`, `employee_pan_cipher`.
4. `itr.notices` — set `anonymized_at`, null user-identifying fields; retain row for regulatory audit.
5. `itr.refund_status_log` — soft-delete; cascades automatically via `ON DELETE CASCADE` on `filing_id` if filing is hard-deleted (preferred path: soft-delete and let retention sweep purge).
6. `itr.verification_queue` — cascades via `ON DELETE CASCADE` on `filing_id`.

### RLS policies

| Table | Visibility |
|-------|-----------|
| `itr.assessee_profiles` | `user_id = current_user` |
| `itr.filings` | `user_id = current_user` OR `ca_reviewer_id = current_user` |
| `itr.form_16_extracts` | `user_id = current_user` |
| `itr.notices` | `user_id = current_user` OR `assigned_to = current_user` |
| `itr.refund_status_log` | `user_id = current_user` |
| `itr.verification_queue` | `user_id` OR `assigned_to` OR `escalated_to` |
| `itr.tax_slab_versions`, `itr.deduction_sections` | Reference data — no RLS (readable by all authenticated). |

### Index rationale

- **`tax_slab_versions(ay, regime)`** — engine's hot lookup path.
- **`deduction_sections(ay, regime)`** — checklist / engine catalogue load.
- **`assessee_profiles(user_id, ay)`** — single-row lookup per filing flow.
- **`filings(user_id, ay)` UNIQUE** — at most one canonical filing per user per AY.
- **`filings(status)`** — admin queue filters.
- **`notices(due_date) WHERE status NOT IN ('RESOLVED','CLOSED','APPEALED')`** — partial index for the deadline reminder job.
- **`refund_status_log(filing_id, status_date DESC)`** — composite for "latest status per filing" query.
- **`verification_queue(sla_due_at) WHERE sla_breached=FALSE AND queue_status NOT IN ('APPROVED','REJECTED','CANCELLED')`** — partial index for SLA breach monitor.

### Cross-agent contracts

- **backend-agent** must read tax slabs from `itr.tax_slab_versions` (AY text format `"AY2025-26"`) and deduction limits from `itr.deduction_sections` — **no hard-coded rates or caps anywhere**.
- **backend-agent** must encrypt PAN via `IPanEncryptionService` (AES-256-CBC) before INSERT into `itr.assessee_profiles.pan` and `itr.form_16_extracts.employee_pan_cipher`.
- **backend-agent** must persist `tax_slab_version_id` and `computation_jsonb` snapshot on every compute so audit/replay is deterministic.
- **backend-agent / devops** must regenerate `itr_v_uri` on demand (TTL ≤ 15 min); `itr_v_object_key` is the durable handle.
- **security-reviewer**: `itr_v_uri` must never be a long-lived URI; verify TTL enforcement at API layer. `form_16_extracts.parsed_json` may contain employer TAN/PAN/salary — confirm DPDP cascade in SEC-008 regression matrix.

---

## Phase 6B — GST Completion addendum (additive, 2026-04-25)

Phase 6B introduces seven new tables in the existing `gst.*` schema to complete GSTR-1 invoice-level filing, the notice tracker, e-invoicing (IRP), e-way bills, and nil-return logging. **All Phase-6B work is additive** — none of the legacy 004_gst_schema.sql tables (`gst.gst_invoice`, `gst.hsn_sac_code`, `gst.gst_notice`, `gst.e_invoice`, `gst.e_way_bill`) are altered or dropped. The legacy tables remain readable; the new tables are the canonical Phase-6B-onwards stores. Migration of legacy rows is an **ops data migration**, not a schema migration.

### Migration files

| File | Tables added |
|---|---|
| `019_gst_invoices_line_items.sql` | `gst.invoices`, `gst.invoice_line_items` |
| `020_gst_hsn_sac_codes.sql` | `gst.hsn_sac_codes` (plural) — distinct from legacy `gst.hsn_sac_code` |
| `021_gst_notices.sql` | `gst.notices` (plural) — distinct from legacy `gst.gst_notice` |
| `022_gst_e_invoice_eway_nil.sql` | `gst.e_invoice_irn_log`, `gst.e_way_bills` (plural), `gst.nil_return_log`; backfills FKs `gst.invoices.irn_log_id` and `gst.invoices.e_way_bill_id` |

### New tables

| Table | Purpose | Key indexes | RLS |
|---|---|---|---|
| `gst.invoices` | GSTR-1-aligned invoice header. Columns: `invoice_no`, `invoice_date`, `customer_gstin`, `place_of_supply`, supplier/customer details, header tax totals, IRN+EWB linkage, status (DRAFT/VALIDATED/SUBMITTED/REJECTED/CANCELLED). GSTIN format CHECK constraints applied. | `(org_id)`, `(gst_return_id)` partial, `(invoice_date)`, `(customer_gstin)` partial, `(status, org_id)`, `(org_id, invoice_no)`, `(place_of_supply)`. Unique `(org_id, invoice_no, invoice_date)`. | Yes — org_id via `auth.organization_member` |
| `gst.invoice_line_items` | Line-level breakdown: HSN/SAC, qty, rate, taxable_value, CGST/SGST/IGST/CESS. `line_total` is a STORED generated column. | `(invoice_id)`, `(org_id)`, `(hsn_sac_code)`. Unique `(invoice_id, line_no)`. | Yes — org_id (denormalized) |
| `gst.hsn_sac_codes` | CBIC HSN/SAC reference dataset. Columns: `code`, `code_type` (HSN/SAC), `description`, `default_gst_rate_pct`, `chapter`, auto-maintained `description_tsvector`. **Sentinel seed: 20 rows.** Full ~12k-row CBIC dataset must be loaded by ops as a separate data migration. | `(code)`, `(code_type)`, `(chapter)` partial, GIN on `description_tsvector` (full-text search), GIN on `code` trigram (fuzzy match) | **No** — global reference table; readable by all |
| `gst.notices` | GST notice tracker. 4-state lifecycle: RECEIVED → UNDER_REVIEW → RESPONDED → CLOSED. `attachments_jsonb` stores GCS URI metadata only (NEVER raw bytes). `response_text`, `response_attachments_jsonb`, `responded_at/by`, `closed_at/by`. DPDP `anonymized_at/by` columns. Linkable to `callback.callbacks` via `callback_id`. GSTIN format CHECK applied. | `(org_id)`, `(gstin)`, `(status, org_id)`, `(due_date)` partial (open notices only), `(assigned_to)` partial, `(notice_date)`, `(callback_id)` partial. Unique `(org_id, gstin, notice_number)`. | Yes — org_id |
| `gst.e_invoice_irn_log` | IRP request/response log for IRN generation. `request_payload_jsonb`/`response_payload_jsonb` capture the full IRP exchange (REDACTED of API tokens by the backend before insert). `irn_number`, `ack_no`, `ack_date`, `qr_code`, `signed_invoice`, status, `adapter_mode` (MOCK/PRODUCTION). Links to both `gst.invoices` (new) and legacy `gst.gst_invoice`. | `(org_id)`, `(invoice_id)` partial, `(irn_number)` partial, `(status, org_id)` | Yes — org_id |
| `gst.e_way_bills` (plural) | EWB log. `ewb_number`, `valid_from`, `valid_to`, `vehicle_no`, `transport_mode` (ROAD/RAIL/AIR/SHIP), transporter details, distance, origin/destination pincodes, status (PENDING/GENERATED/EXTENDED/CANCELLED/EXPIRED/FAILED). Same redacted-payload contract as IRN log. | `(org_id)`, `(invoice_id)` partial, `(status, org_id)`, `(valid_to)` partial (active EWBs) | Yes — org_id |
| `gst.nil_return_log` | Log of nil GSTR returns (zero-transaction periods). Columns: `gstin`, `return_type` (GSTR-1/3B/CMP-08/9), `return_period`, `financial_year`, `filed_at`, `arn_number`, `user_confirmed_at/by`, status, `adapter_mode`. GSTIN format CHECK applied. | `(org_id)`, `(gstin)`, `(financial_year, return_period)`, `(status, org_id)`. Unique `(org_id, gstin, return_type, return_period)`. | Yes — org_id |

### RLS posture

All seven tables (except the global `gst.hsn_sac_codes` reference) use the established org-isolation pattern: `org_id IN (SELECT om.organization_id FROM auth.organization_member ... WHERE user_id = current_setting('app.current_user_id', TRUE)::UUID AND is_active = TRUE UNION SELECT o.id FROM auth.organization WHERE owner_user_id = ...)`. Policies are created with `IF NOT EXISTS` guards so the migrations are idempotent.

`gst.hsn_sac_codes` is intentionally a global reference table with no RLS — HSN/SAC codes are not tenant-scoped data.

### DPDP cascade extensions (SEC-008)

The existing DPDP right-to-erasure cascade gains three new entry points in Phase 6B:

1. **`gst.invoices`** — `customer_gstin`, `customer_name`, `supplier_legal_name` are PII. On org erasure: soft-delete via `deleted_at`. Application-layer enforced.
2. **`gst.notices`** — `body_text`, `subject`, `response_text`, plus `attachments_jsonb` and `response_attachments_jsonb` reference GCS objects with PII payloads. On org erasure: soft-delete row via `deleted_at`, NULL out the four text columns, set `anonymized_at` + `anonymized_by`, and trigger GCS object deletion for both attachment arrays. The migration provides the `anonymized_at`/`anonymized_by` columns; the GCS-side deletion is owned by backend-agent.
3. **`gst.e_invoice_irn_log` / `gst.e_way_bills`** — `request_payload_jsonb` and `response_payload_jsonb` may contain GSTIN, vehicle no, transporter PAN. On org erasure: soft-delete and NULL out both payload columns. `irn_number`, `ack_no`, and `ewb_number` are retained for regulatory continuity (these are issued by NIC/GSTN, not derivable PII).

`gst.hsn_sac_codes` and `gst.nil_return_log` carry no resident PII (return_period and ARN are non-personal). `nil_return_log` rows are retained on org erasure for regulatory audit; only `user_confirmed_by` is NULL'd.

### Audit log linkage

Status transitions on `gst.notices` (RECEIVED → UNDER_REVIEW → RESPONDED → CLOSED) and `gst.invoices` (DRAFT → VALIDATED → SUBMITTED) are written to `shared.audit_log` by the application layer (consistent with the rest of the codebase — the migration only stamps `updated_at` via the trigger). Backend-agent owns the audit-row writes; entity_type values are `gst.notices` and `gst.invoices` respectively.

### Index rationale (Phase 6B)

- **`gst.invoices.(org_id, invoice_no)`** — admin "find by invoice number within org" lookup; also backs the unique constraint with `invoice_date`.
- **`gst.invoices.(status, org_id)`** — powers the GST Filing Queue page's status-filtered tabs.
- **`gst.invoice_line_items.(invoice_id)`** — drives the per-invoice line-item fetch (always invoice-scoped).
- **`gst.hsn_sac_codes` GIN on `description_tsvector`** — supports the `<300ms` HSN/SAC search target (Exit Criterion 8). Trigger maintains the tsvector with weighted code (A) + description (B) for ranking.
- **`gst.hsn_sac_codes` GIN on `code` trigram** — supports starts-with / fuzzy match for users typing partial HSN codes (e.g. "8517...").
- **`gst.notices.(due_date) WHERE status NOT IN ('RESPONDED','CLOSED')`** — partial index powers the "Notices due this week" dashboard widget cheaply.
- **`gst.notices.(callback_id)` partial** — fast lookup when a callback is opened to find the originating notice.
- **`gst.e_invoice_irn_log.(irn_number)` partial** — IRN deduplication checks; partial because PENDING rows have no IRN yet.
- **`gst.e_way_bills.(valid_to) WHERE status='GENERATED'`** — daily Hangfire job that flips expired EWBs to status=EXPIRED.
- **`gst.nil_return_log` unique `(org_id, gstin, return_type, return_period)`** — prevents double-filing of a nil return for the same period.

### HSN/SAC seeding — production note

The Phase 6B migration `020_gst_hsn_sac_codes.sql` seeds only **20 sentinel rows** to keep dev/staging boots quick and to keep the migration file readable. Production deployments **must** run a separate ops data migration (CSV bulk-import of the official CBIC HSN+SAC dataset, ~12,000 rows) before users can rely on HSN/SAC search results. Tracking ticket and CSV source URL are owned by devops-engineer.

---

## Phase 6C Addendum — Loan Hub (additive)

> Migrations: `026_loan_products_applications.sql`, `027_loan_documents_consents.sql`, `028_loan_partner_banks_packages.sql`.
> Status: ADDITIVE — legacy `loan.loan_application`, `loan.partner_bank`, `loan.loan_consent`, `loan.document_package` (Phase 1) are preserved as-is for back-compat with EMI/disbursement records. Phase 6C introduces a parallel, adapter-aware lifecycle.

### New tables

| Table | Purpose |
|---|---|
| `loan.loan_products` | Per-bank product catalog. JSONB `eligibility_criteria` is consumed by the eligibility engine. |
| `loan.applications` | Phase 6C application entity with state-machine `status` (enum `application_status_v2`). Org-scoped via `org_id`. |
| `loan.application_documents` | Links uploaded `document.document` rows to an application by `document_type` (PAN/AADHAAR/GSTR3B/PL/BS/BANK_STMT/ITR/TRADE_LICENSE). Logical FK to `document.document` (table is partitioned). |
| `loan.consents` | DPDP-compliant signed consent. `signature_hash` = HMAC-SHA256(user_id ‖ app_id ‖ consent_text_version ‖ timestamp, server_key). `BEFORE DELETE` trigger blocks hard-delete. |
| `loan.partner_banks` | Adapter-aware bank registry (EMAIL/REST/OAUTH). `api_config_encrypted` stores AES-GCM ciphertext; key reference in `api_config_key_ref`. |
| `loan.application_status_log` | Append-only status-transition audit (`from_status`, `to_status`, `actor_type`, `metadata`). Hard-delete blocked. |
| `loan.pdf_packages` | Watermarked loan-package PDFs in GCS (`gcs_uri`, `gcs_object_key`, `sha256_hash`, `pages_count`, `watermark_text`). |

### Indian COA / lending notes

- `loan.applications.purpose` is free-text but the LoanService domain validates against the COA-aligned purpose list (Working Capital, Term Loan, Equipment Finance, MSME-Mudra, Inventory, Receivables — these map to dedicated COA contra accounts when disbursement posts a journal entry in AccountingService).
- `requested_amount` and `disbursed_amount` use `NUMERIC(15,2)` consistent with the Money value object across the codebase.
- All amounts treated as INR; foreign-currency loans not in scope for 6C.

### Audit trail design

- **Status transitions:** every `loan.applications.status` change writes a row to `loan.application_status_log` (handler-side, not a DB trigger — domain enforces valid transitions before logging). Append-only via `BEFORE DELETE` trigger.
- **Consents:** immutable. The HMAC `signature_hash` lets us verify the consent text version, signer, and timestamp were not tampered with post-signing. Verification is server-side using the secret-manager-backed key.
- **PDF packages:** `sha256_hash` of the rendered PDF bytes is stored on insert; integrity is re-verified on every download (signed-URL handler recomputes hash before serving).

### DPDP cascade entry points

- **`loan.applications`** — soft-deletable via `deleted_at`. On user erasure: NULL `user_id`, set `anonymized_at` + `anonymization_reason`. Org-level data preserved (lending compliance).
- **`loan.consents`** — NEVER hard-deleted. `BEFORE DELETE` trigger raises. On user erasure: NULL `user_id`, `ip_address`, `user_agent`; set `anonymized_at` + `anonymization_reason`. Signature record retained for the 7-year compliance window via `retention_until` (generated column).
- **`loan.application_status_log`** — append-only; metadata may be redacted (PII scrub) but rows are not deleted.
- **`loan.pdf_packages`** — soft-delete via `deleted_at`; the GCS object lifecycle (devops-engineer) enforces the 7-year hot/cold tiering. Cold storage after 90 days; deletion only after `retention_until`.
- **`loan.application_documents`** — `ON DELETE CASCADE` from `loan.applications`. The actual `document.document` row is governed by document-service's own DPDP cascade.

### Indexes — rationale

- `idx_applications_status WHERE deleted_at IS NULL` — powers admin "open applications" filter without scanning soft-deleted rows.
- `idx_consents_retention`, `idx_pdf_packages_retention` — daily retention sweeper job (Hangfire) scans these to drive GCS lifecycle and anonymization workflows.
- `idx_app_status_log_occurred DESC` — timeline view in `LoanDetailPage` reads recent transitions first.
- `idx_partner_banks_active WHERE deleted_at IS NULL` — catalog endpoint (`GET /loans/partner-banks`) hits this exclusively.

### Cross-agent handoffs

- **backend-agent:** see migration headers for HMAC formula, AES-GCM credential envelope, status state-machine. The DB only validates HMAC length (32 bytes); domain enforces transition validity.
- **security-reviewer:** consents and status-log tables block hard-delete at the DB layer (triggers). Verify on review.
- **devops-engineer:** `gs://snapaccount-{env}-docs/loan-packages/` lifecycle — retain 7 years, cold storage after 90 days; webhook HMAC secrets per-bank in Secret Manager (referenced via `loan.partner_banks.webhook_secret_ref`).

---

## Phase 6F Addendum — ChatService canonical schema (SignalR-backed)

> Added by: db-engineer (2026-04-25)
> Migrations: `029_chat_signalr.sql`, `030_chat_audit_indexes.sql`

### Why a new canonical set of tables

Phase 6F introduces canonical plural-named chat tables (`chat.threads`, `chat.messages`, `chat.thread_participants`, `chat.read_receipts`, `chat.categories`, `chat.routing_rules`) that supersede the legacy singular tables in `007_chat_schema.sql` (`chat.conversation`, `chat.message`, `chat.message_attachment`, etc.). Migrations are additive: legacy tables are kept untouched and remain readable for any historical data, but Phase-6F-onwards backend code reads/writes only the new tables. Legacy → canonical data migration is an ops task, not in these SQL files.

### New tables

| Table | Purpose | PK |
|---|---|---|
| `chat.threads` | One row per conversation. `category` enum (GST/ITR/DOC/LOAN/BILLING/GENERAL), `status` (OPEN/ASSIGNED/RESOLVED/CLOSED), `priority` (LOW/NORMAL/HIGH/URGENT), `assigned_ca_id`, `last_message_at`, retention/anonymization columns. | `id` |
| `chat.messages` | Individual message. `body TEXT` plus `attachments_jsonb` (GCS URI metadata only — same contract as `gst.notices`, P6-HANDOFF-14). `sender_role` (USER/CA/ADMIN/SYSTEM/AI). `client_message_id` for mobile-offline idempotency. Generated `body_tsvector STORED` for FTS. | `id` |
| `chat.thread_participants` | Composite PK `(thread_id, user_id)`. `role` enum (USER/CA/ADMIN/OBSERVER). Soft-delete + DPDP anonymization columns. | `(thread_id, user_id)` |
| `chat.read_receipts` | Per-user `(thread_id, user_id) → last_read_message_id, last_read_at`. Drives unread-count math without scanning messages. | `(thread_id, user_id)` |
| `chat.categories` | Org-customizable category dictionary. `org_id IS NULL` rows = SnapAccount-wide defaults; per-org overrides allowed. Seeded with the 6 default categories. | `id` |
| `chat.routing_rules` | Keyword pattern → target role auto-routing. POSIX regex in `keyword_pattern`, `priority` (lower = higher), `target_role` (CA/ADMIN/OPS). Seeded with platform defaults. ChatService caches in memory at startup and refreshes on rule update. | `id` |

### Indexes (migration 030)

- `idx_chat_threads_org_status_last_msg (org_id, status, last_message_at DESC)` — admin/CA inbox.
- `idx_chat_threads_ca_status_last_msg (assigned_ca_id, status, last_message_at DESC)` — CA inbox.
- `idx_chat_threads_user_last_msg (user_id, last_message_at DESC)` — user thread list.
- `idx_chat_threads_org_category` — admin filter chips.
- `idx_chat_threads_reference (reference_type, reference_id)` — "show all threads for this loan/return".
- `idx_chat_threads_retention_until` — daily retention sweeper.
- `idx_chat_messages_thread_sent_at (thread_id, sent_at DESC)` — keyset pagination.
- `idx_chat_messages_thread_unread` — partial index on `is_read_by_recipient = FALSE`.
- `idx_chat_messages_sender_sent_at` — admin/audit "messages by user X".
- `idx_chat_messages_body_tsvector` — **GIN** index on `body_tsvector` for chat-history full-text search (English config baseline).

### Ephemeral state lives in Redis, NOT Postgres

Per Phase 6F scope:

- **Typing indicators** — Redis (`chat:typing:{thread_id} -> set of user_ids`, TTL 5s).
- **Presence / online status** — Redis (`chat:presence:{user_id}`, refreshed on every SignalR ping).
- **Active SignalR connection IDs** — Redis (per-pod, evicted on disconnect).

Postgres is the system-of-record for durable state (threads, messages, read receipts) only. Devops handoff: ChatService Cloud Run service requires Redis (in-cluster Memorystore acceptable) and **session affinity** (sticky sessions) for SignalR.

### DPDP cascade for chat (regulated communication, 7-year retention)

Chat with CAs is regulated communication and is **retained 7 years** for compliance. The cascade pattern is **anonymize-only**, identical to loans:

| Table | Behavior on user erasure |
|---|---|
| `chat.messages` | `sender_user_id → NULL`; stamp `anonymized_at`, `anonymization_reason='DPDP_USER_ERASURE'`. **Body retained** (regulated record). `BEFORE DELETE` trigger blocks hard-delete. |
| `chat.thread_participants` | Soft-delete the row for the erased user (`deleted_at` stamped, `anonymization_reason` set). Composite PK preserved for audit. |
| `chat.threads` | Retained until `retention_until` (default 7 years from `last_message_at`). `BEFORE DELETE` trigger blocks hard-delete. `created_by`/`updated_by`/`assigned_ca_id` may be NULL'd if those users are erased; `user_id` of the requester may be NULL'd with `anonymized_at`/`anonymization_reason` stamped. |
| `chat.read_receipts` | May be hard-deleted on user erasure (no compliance value once user is gone). |

### RLS

- `chat.threads` — visible if (a) the current user is in an org that owns the thread, OR (b) `user_id` matches, OR (c) `assigned_ca_id` matches.
- `chat.messages` — visible if the user can see the parent thread (same predicate).
- `chat.thread_participants` — visible to the participant themselves and to thread end-user / assigned CA.
- `chat.read_receipts` — owner-only (`user_id = current_user_id`).

### Cross-agent handoffs

- **backend-agent:** Use the new canonical plural-named tables (`chat.threads`, `chat.messages`, `chat.thread_participants`, `chat.read_receipts`). Legacy `007_chat_schema.sql` tables are not canonical for Phase 6F. Attachments are GCS URI metadata only — same contract as `gst.notices` (P6-HANDOFF-14). Category routing reads `chat.routing_rules`; cache in memory at startup with refresh on rule update event.
- **security-reviewer:** DPDP cascade extends to `chat.messages` (anonymize sender) + `chat.thread_participants` (soft-delete). Messages retained 7 years for compliance. Same anonymize-only pattern as loans. `BEFORE DELETE` triggers block hard-deletes on `chat.threads` and `chat.messages`.
- **devops-engineer:** ChatService needs Redis for ephemeral typing/presence state; Cloud Run **sticky sessions / session affinity** required for SignalR. Daily Hangfire retention sweeper queries `idx_chat_threads_retention_until`.

## Module 1 — Auth & RBAC (Multi-Tenant Custom Roles + Invitations, additive 2026-05-29)

> Scope: `.claude/orchestrator/auth-rbac-module-scope.md`. Additive on top of `001_auth_schema.sql`.
> Org-scoped custom roles, constrained delegation (enforced server-side), token-based invitations.

### Migration files

| File | Purpose |
|---|---|
| `035_auth_org_roles_invitations.sql` | Schema: `auth.role` org-scoping columns, partial unique indexes, `auth.invitation` table, RLS. |
| `036_auth_rbac_permission_catalog_seed.sql` | Seed: full permission catalog, 6 baseline system roles, default `role_permission` grants. |
| `037_permission_is_active.sql` | Increment 1.2: `auth.permission.is_active` flag + partial index (soft-retire permissions). |
| `038_user_permission.sql` | Increment 1.3: `auth.user_permission` table — per-user direct permission overrides, RLS. |
| `039_reference_data.sql` | Increment 1.4 Phase A: `auth.reference_data` master-data table + seed; `platform.refdata.manage` permission. |

All are idempotent / re-runnable (verified by applying twice against local Postgres).

### `auth.permission.is_active` — soft-retire flag (Increment 1.2, migration 037)

`is_active BOOLEAN NOT NULL DEFAULT TRUE` (existing rows backfilled to `TRUE`; column is nullable-with-default so it is safe to add against a running AuthService).

- **`is_active = FALSE` = a RETIRED permission.** Retired permissions are **excluded** from the role permission-matrix UI, from `GET /auth/me/grantable-permissions`, and from effective-permission computation. This lets the catalog evolve (deprecate a permission) without breaking historical `role_permission` rows that still reference it.
- This is **distinct from soft-delete**: `deleted_at` (delete) still soft-removes a row entirely; `is_active = FALSE` keeps the row visible for history/audit but treats it as retired. Live-catalog queries should filter `is_active = TRUE AND deleted_at IS NULL`.
- Index: `idx_permission_is_active` — partial `ON (is_active) WHERE is_active = TRUE AND deleted_at IS NULL`, keeping the matrix/grantable/effective hot paths efficient.

### `auth.user_permission` — per-user direct permission overrides (Increment 1.3, migration 038)

A direct permission grant to a user, **independent of their roles** — for one-off elevations or exceptions that don't warrant a custom role.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `user_id` | `UUID NOT NULL` | FK → `auth.user(id)` `ON DELETE CASCADE`, indexed |
| `permission_id` | `UUID NOT NULL` | FK → `auth.permission(id)` `ON DELETE CASCADE`, indexed |
| `organization_id` | `UUID NULL` | FK → `auth.organization(id)` `ON DELETE CASCADE`. **NULL = platform/global grant**; non-NULL = scoped to that org. Indexed (partial). |
| `granted_by_user_id` | `UUID NULL` | FK → `auth.user(id)` `ON DELETE SET NULL`. Provenance of who granted it. |
| `created_at`/`updated_at`/`deleted_at` | `TIMESTAMPTZ` | audit + soft-delete |
| `created_by`/`updated_by` | `UUID` | per existing convention |

**Effective permissions** for a user in a given scope = **(role permissions) ∪ (user_permission grants in scope)**, with retired permissions (`auth.permission.is_active = FALSE`) excluded. The org scope of a `user_permission` row narrows the grant: a NULL-org row applies platform-wide, a non-NULL-org row applies only within that org.

**Uniqueness.** `uq_user_permission_scope` — `UNIQUE (user_id, permission_id, COALESCE(organization_id,'00000000-0000-0000-0000-000000000000')) WHERE deleted_at IS NULL` — one **active** grant per (user, permission, scope); the nil-UUID COALESCE makes platform-scoped (NULL-org) grants dedupe too.

> NOTE (backend): this is an **expression** unique index, not a plain column unique. To use it as an `ON CONFLICT` arbiter you must restate the exact expression: `ON CONFLICT (user_id, permission_id, COALESCE(organization_id,'00000000-0000-0000-0000-000000000000')) WHERE deleted_at IS NULL`. A bare `ON CONFLICT (user_id, permission_id, organization_id)` will NOT match.

**RLS.** `user_permission_org_isolation` — same pattern as `auth.role` / `auth.invitation`: platform-admin bypass (`app.is_platform_admin='true'`), NULL-org rows globally visible, otherwise visible only within the caller's owned/member orgs (via `app.current_user_id`). Defense-in-depth; the constrained-delegation rule (a delegate may only grant permissions within their own effective set) remains authoritative in the application layer.

### `auth.reference_data` — global master data (Increment 1.4 Phase A, migration 039)

Single-table master data for dropdowns / lookups. **Global, NOT tenant-scoped → no RLS** (readable by all authenticated users). Managed by SUPER_ADMIN via the new `platform.refdata.manage` permission.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `category` | `VARCHAR(50) NOT NULL` | `LANGUAGE`, `USER_TYPE`, `GENDER`, `STATE`, `COUNTRY` |
| `code` | `VARCHAR(50) NOT NULL` | lookup key (e.g. `en`, `MH`, `IN`) |
| `name` | `VARCHAR(200) NOT NULL` | human label (native script where applicable, e.g. `हिन्दी (Hindi)`) |
| `parent_code` | `VARCHAR(50) NULL` | hierarchy link — `STATE.parent_code` = `COUNTRY` code (`IN`) |
| `is_active` | `BOOLEAN NOT NULL DEFAULT TRUE` | inactive = hidden from pickers, retained for history |
| `sort_order` | `INT NOT NULL DEFAULT 0` | display ordering within a category |
| `created_at`/`updated_at`/`deleted_at` | `TIMESTAMPTZ` | audit + soft-delete |
| `created_by`/`updated_by` | `UUID` | per existing convention |

- **Uniqueness:** `uq_reference_data_category_code` — `UNIQUE (category, code) WHERE deleted_at IS NULL`. As a partial index it must be restated as the `ON CONFLICT` arbiter: `ON CONFLICT (category, code) WHERE deleted_at IS NULL`.
- **Indexes:** `idx_reference_data_category_active (category, is_active)` for active-picker queries; `idx_reference_data_parent_code` (partial) for `STATE → COUNTRY` joins.
- **`set_updated_at`** trigger attached.

**Seed counts (54 rows):** `LANGUAGE`=3 (`en`, `hi`, `bn`), `USER_TYPE`=4 (`BUSINESS_OWNER`, `EMPLOYEE`, `STAFF`, `DATA_ENTRY_OPERATOR`), `GENDER`=4 (`MALE`, `FEMALE`, `OTHER`, `PREFER_NOT_TO_SAY`), `COUNTRY`=7 (ISO alpha-2: `IN` default, `US`, `GB`, `AE`, `SG`, `AU`, `CA`), `STATE`=36 (28 Indian states + 8 union territories, ISO 3166-2:IN codes, `parent_code='IN'`).

**New permission:** `platform.refdata.manage` (resource `platform`, action `refdata.manage`) seeded into `auth.permission` and granted to the `SUPER_ADMIN` role.

### `auth.role` — new columns (additive)

| Column | Type | Notes |
|---|---|---|
| `organization_id` | `UUID NULL` | FK → `auth.organization(id)` `ON DELETE CASCADE`. **NULL = system/global role** (read-only to org admins); non-NULL = org-owned custom role. |
| `created_by_user_id` | `UUID NULL` | FK → `auth.user(id)` `ON DELETE SET NULL`. Provenance of who created a custom role. |

**Role-name uniqueness (multi-tenant safe).** Migration 035 **drops** the original global `UNIQUE(name)` (pre-production, nothing seeded yet) and replaces it with two partial unique indexes:

- `uq_role_system_name` — `UNIQUE (name) WHERE organization_id IS NULL AND deleted_at IS NULL` — system roles globally unique.
- `uq_role_org_name` — `UNIQUE (organization_id, name) WHERE organization_id IS NOT NULL AND deleted_at IS NULL` — custom role names unique **per org** (org A and org B may both have a "Manager").

> Because the global `UNIQUE(name)` is gone, any `INSERT ... ON CONFLICT (name)` on `auth.role` for a **system** role must target the partial arbiter: `ON CONFLICT (name) WHERE organization_id IS NULL AND deleted_at IS NULL`.

### `auth.invitation` — new table

Token-based org member invitations. Columns: `id` (PK), `organization_id` (FK org, NOT NULL), `email` (NULL), `phone_number` (NULL), `role_id` (FK role, NOT NULL), `invited_by_user_id` (FK user, NOT NULL), `token_hash` (`VARCHAR(256)` UNIQUE — SHA-256 of the invite token, never store plaintext), `status` (`PENDING`/`ACCEPTED`/`REVOKED`/`EXPIRED`, default `PENDING`), `expires_at` (NOT NULL), `accepted_at` (NULL), `accepted_user_id` (FK user, NULL — set on accept), plus standard audit cols (`created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`).

- CHECK `chk_invitation_contact`: at least one of `email` / `phone_number` is present.
- `set_updated_at` trigger attached.

### RLS posture

`auth.role` is now **RLS-enabled** (it was not in 001). Both policies use the existing session-var convention `current_setting('app.current_user_id', TRUE)::UUID` and add a platform-admin bypass `current_setting('app.is_platform_admin', TRUE) = 'true'` (set for SUPER_ADMIN to allow cross-org reads).

| Table | Policy | Visibility |
|---|---|---|
| `auth.role` | `role_org_isolation` | platform-admin sees all; system roles (`organization_id IS NULL`) world-readable; custom roles only within the caller's owned/member orgs. |
| `auth.invitation` | `invitation_org_isolation` | platform-admin sees all; otherwise only invitations for the caller's owned/member orgs. |

> RLS is **defense-in-depth**. The authoritative **constrained-delegation / no-privilege-escalation** rule (a delegate may only grant a subset of their own effective permissions, and may not assign a role exceeding their set) is enforced in the backend application layer (scope §4 backend-agent), not in RLS.

### Permission catalog (`auth.permission`) — dot-notation `resource.action`

Seeded **74 permissions** across **12 modules**. `resource` = first dot-segment, `action` = remainder. Names match backend `[RequiresPermission("...")]` exactly.

| Module (`resource`) | Count | Examples |
|---|---|---|
| `org` | 14 | `org.members.{read,invite,update,remove,suspend}`, `org.roles.{read,create,update,delete,assign}`, `org.permissions.{read,grant}`, `org.settings.{read,update}` |
| `platform` | 6 | `platform.orgs.{read,create,suspend}`, `platform.admins.invite`, `platform.roles.manage`, `platform.permissions.manage` |
| `gst` | 9 | `gst.returns.file`, `gst.returns.approve`, `gst.itc.reconcile`, `gst.einvoices.generate` |
| `itr` | 13 | `itr.filings.{create,compute,file,submit,verify,ca_review}`, `itr.notices.respond` |
| `loan` | 12 | `loan.application.{create,submit,close}`, `loan.bank.decision`, `loan.disbursement.record` |
| `document` | 4 | `document.{read,update,share,archive}` |
| `callback` | 4 | `callback.{assign,complete,escalate,cancel}` |
| `accounting` | 3 | `accounting.journal.{review,reverse}`, `accounting.fiscal_year.close` |
| `chat` | 3 | `chat.thread.{assign,escalate,resolve}` |
| `admin` | 3 | `admin.dashboard.read`, `admin.gst.queue.read`, `admin.users.read` |
| `subscription` | 2 | `subscription.plan.{create,update}` |
| `notification` | 1 | `notification.dlq.manage` |

### Baseline system roles + default grants

All six are `is_system_role = TRUE`, `organization_id = NULL`. `CA` reuses the row already seeded in `999_seed_reference_data.sql` (via `ON CONFLICT DO NOTHING`).

| Role | Default grant count | Summary |
|---|---|---|
| `SUPER_ADMIN` | 74 (all) | Platform staff. Full catalog incl. `platform.*`. Cross-org. |
| `ORG_ADMIN` | 65 | All `org.*` + every service module; **no** `platform.*`, no `admin.*`. |
| `CA` | 31 | Review/compute/file across gst/itr/accounting/document/chat + org reads. |
| `MANAGER` | 20 | Member management + role assign + module reads + callback/chat workflow ops. |
| `REVIEWER` | 11 | Read-only + review/approve (`*.review`, `gst.returns.approve`, `itr.filings.ca_review`). |
| `HR` | 6 | Member onboarding/offboarding (`org.members.{read,invite,update,suspend}`, role/perm read). |

### Index rationale (Module 1)

- `idx_role_organization_id` (partial, `WHERE organization_id IS NOT NULL`) — fast lookup of an org's custom roles.
- `idx_role_created_by_user_id` (partial) — provenance queries.
- `auth.invitation`: FK indexes on `organization_id`, `role_id`, `invited_by_user_id`, `accepted_user_id`; `token_hash` unique (invite-accept lookup is the hot path); partial `status` index (`WHERE deleted_at IS NULL`) for pending-invite listing; `email` and `expires_at` indexes for resend/dedup and expiry sweeps.

### Cross-agent handoffs

- **backend-agent:** New columns `auth.role.organization_id` (NULL=system) + `auth.role.created_by_user_id`. New table `auth.invitation` (token-based; store **SHA-256** of the token in `token_hash`, never plaintext; `status` ∈ PENDING/ACCEPTED/REVOKED/EXPIRED). Permission names are dot-notation matching `[RequiresPermission]`; the catalog and 6 baseline roles are seeded. Set `app.is_platform_admin='true'` in the DB session for SUPER_ADMIN so RLS allows cross-org reads. Enforce the constrained-delegation rule in the application layer — RLS does not enforce it.
- **security-reviewer:** Invite-token entropy/expiry/replay (`token_hash` UNIQUE + `expires_at` + `status`), org tenant isolation via RLS on `auth.role`/`auth.invitation`, and privilege-escalation-via-delegation are the focus areas.

---

## Phase 7 Wave 1 Addendum — EF ↔ SQL reconciliation (additive, 2026-06-10)

> Migrations: `060_notification_ef_alignment.sql` (notification — pre-existing), `061_loan_consent_locale_and_catalog_alignment.sql` (loan — NEW).
> Status: ADDITIVE. No renames, no drops. Full chain (`000`…`061` + `999`) replays clean on an empty PostgreSQL 18 database; all migrations idempotent.
> Driver: backend-agent Wave 1 merged EF entities/configurations with no backing SQL. NotificationService, CallbackService, and LoanService have **no EF migrations** — the SQL files in `database/migrations/` are canonical, so the entity configs are mapped onto existing columns and any genuinely-missing columns are added here.

### DB1 — NotificationService reconciliation (GAP-070)

**Outcome: already reconciled by `060_notification_ef_alignment.sql` — no new migration required.** All seven entity configurations map cleanly onto existing columns (008 + 017 + 060). Verified column-by-column against a fresh replay:

| EF entity → table | Notable EF→column mappings | Parity |
|---|---|---|
| `NotificationEvent` → `notification.notification_event` | `EventCode→event_code`, `DefaultChannels→default_channels` (table added by 060) | ✓ |
| `NotificationLogEntry` → `notification.notification_log` | `Locale→language`, `ErrorMessage→failure_reason`, `CostInr→cost_inr`, dispatch cols (`user_id`, `event_code`, `channel`, `rendered_body`, `dedupe_key`) added by 060 | ✓ |
| `DlqItem` → `notification.dlq_items` | `EventCode→event_type`, `LastErrorMessage→failure_reason`, `ExhaustedAt→last_failed_at`, `OriginalPayload→original_payload`, `IsResolved→is_resolved`, `Locale→locale` (last three added by 060) | ✓ |
| `NotificationTemplate` → `notification.notification_template` | `EventCode→event_type`, `Locale→language`, `Body→body_template`, `SenderName→sender_id`, `IsCurrent→is_current` | ✓ |
| `NotificationPreference` → `notification.notification_preference` | `EventCode→event_type`, `DoNotDisturb→dnd_enabled` | ✓ |
| `InboxNotification` → `notification.notification` (partitioned) | read model: `id`, `user_id`, `channel`, `event_type`, `title`, `body`, `is_read`, `status` | ✓ |
| `PushToken` → `notification.device_push_token` | `Token→push_token`, platform upper-case converter | ✓ |

Seed note: the C# `DbSeeder` writes the event catalogue into `notification.notification_event` (created by 060) and templates into `notification.notification_template`. Because the chain now provides every column the seeder touches, the PR #19 try/catch band-aid (GAP-070) can be removed by backend-agent.

### HANDOFF-2 — CallbackService `assignments_log` + KPI snapshot (GAP-012 / SEC-030)

**Outcome: both objects already exist in `018_callback_schema.sql` and match the EF configurations exactly — no new migration required.**

| Object | Status | EF parity |
|---|---|---|
| `callback.assignments_log` (table) | Existed in 018 | `AssignmentLog`: `id`, `callback_id`, `from_user_id`, `to_user_id`, `assigned_by`, `reason` (text), `assigned_at` + audit cols (`created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`). All present; indexes `(callback_id, assigned_at)`, `(to_user_id)`, `(assigned_by)` match `HasIndex(...)`. ✓ |
| `callback.kpi_daily_snapshot` (**MATERIALIZED VIEW**) | Existed in 018 | Keyless `KpiDailySnapshot` (`ToView`) columns `org_id`, `snapshot_date`, `count_pending/scheduled/in_progress/completed/cancelled/escalated/sla_breached`, `avg_ttr_minutes`, `avg_csat`, `total_requested` match the MV projection exactly (bigint→`long`, numeric→`double?`, date→`DateOnly`, uuid→`Guid`). ✓ |

**MV refresh strategy:** `callback.kpi_daily_snapshot` is a materialized view with a unique index `uq_kpi_daily_snapshot_org_date (org_id, snapshot_date)`, which enables non-blocking concurrent refresh:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;
```

Schedule this from a Cloud Scheduler → CallbackService endpoint (or a Hangfire recurring job) — recommended cadence every 15–30 min, plus an on-demand refresh after bulk status transitions. Postgres MVs cannot enforce RLS, so `GetKpiSnapshotQuery` mandatorily filters `WHERE org_id = <caller-claim>` (P6-HANDOFF-04 IDOR control) — the org id is taken from the caller's identity, never from request input. **Owner of the scheduled refresh job: devops-engineer** (Cloud Scheduler vs Hangfire decision still open).

### HANDOFF-1 — LoanService consent locale + catalog (GAP-040 / P6-HANDOFF-25)

Migration **`061_loan_consent_locale_and_catalog_alignment.sql`** (NEW). Three column deltas + locale seeds:

| Change | Table | Detail |
|---|---|---|
| ADD `consent_locale VARCHAR(10) NOT NULL DEFAULT 'en'` | `loan.consents` | Backs `Consent.ConsentLocale`. BCP-47 locale of the consent text the user actually reviewed — ties the DPDP audit trail to the exact language version. Matches `loan.consent_catalog.locale`. |
| ADD `deleted_at TIMESTAMPTZ NULL` | `loan.consents` | `Consent : BaseAuditableEntity`; `BaseDbContext` applies a **global** `deleted_at IS NULL` query filter and binds `deleted_at` in every INSERT/SELECT. 027 deliberately omitted it, which broke EF reads/writes. The existing `trg_consents_no_delete` trigger still blocks hard DELETE; soft-delete via `UPDATE deleted_at` (what the ORM emits) is allowed, so the DPDP "never hard-delete" intent is preserved (verified: hard DELETE raises, soft-delete UPDATE succeeds). |
| ADD `updated_by UUID NULL` | `loan.consent_catalog` | `ConsentCatalogEntry : BaseAuditableEntity` → EF maps `UpdatedBy → updated_by`. 032 created `last_modified_by` instead. `last_modified_by` is retained and marked `-- DEPRECATED` (Phase-7); `updated_by` is the live audit column. |

**Seed data (consent catalog v1.4):** `032` seeded the three current consent types (`CREDIT_BUREAU`, `DATA_SHARE_WITH_BANK`, `DISBURSEMENT_MANDATE`) for locale `en`. `061` adds the **`hi`** and **`bn`** variants — **6 new rows**, catalog now 9 rows (3 types × 3 locales), unique on `(consent_type, text_version, locale)`, inserted with `ON CONFLICT DO NOTHING`. ⚠ The `hi`/`bn` bodies are **placeholder-but-plausible translations tagged `[PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]`** — legal/compliance must replace them before production (RBI Digital Lending + DPDP legal artifact).

> Note (for backend-agent, observational — not changed here): `loan.consents.consent_type` and `loan.application_documents.*` use PostgreSQL `ENUM` types (`loan.consent_type`, etc.). EF must map the CLR `ConsentType` enum to the `CREDIT_BUREAU`/`DATA_SHARE_WITH_BANK`/`DISBURSEMENT_MANDATE` labels (the repo's `UpperSnakeCaseNameTranslator` handles this). Out of db-engineer scope; flagged for parity awareness only.
