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
| `callback.kpi_daily_snapshot` | **MATERIALIZED VIEW**. Per-org daily rollup: counts by status, `avg_ttr_minutes`, `count_sla_breached`, `avg_csat`. Refreshed by scheduled job (ownership TBD with devops-engineer: Hangfire vs Cloud Scheduler decision). Unique index `(org_id, snapshot_date)` supports `REFRESH CONCURRENTLY`. **Org-safe** (`org_id` in SELECT+GROUP BY); audited NEW-D09 — see "Audit: `callback.kpi_daily_snapshot`". `snapshot_date` = IST (`Asia/Kolkata`) day. | `(org_id, snapshot_date)` unique, `(snapshot_date)` | **No** — Postgres MVs cannot have RLS. Consumers must filter by `org_id` at the API layer OR via a `SECURITY INVOKER` wrapper function. Flagged to security-reviewer. |

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

### Audit: `callback.kpi_daily_snapshot` (NEW-D09, 2026-06-11)

Independent audit of the MV against three risks. **Verdict: ORG-SAFE.** No migration was strictly required; `067_callback_kpi_mv_audit_and_subscription_anonymization.sql` was written anyway as an idempotent guard (reasserts the unique index + raises if a CONCURRENTLY-incompatible deployment is ever found).

**Live definition** (`pg_matviews`, abridged):

```sql
SELECT org_id,
       date_trunc('day', requested_at AT TIME ZONE 'Asia/Kolkata')::date AS snapshot_date,
       COUNT(*) FILTER (WHERE status = 'PENDING')   AS count_pending,
       ... (per-status counts) ...,
       COUNT(*) FILTER (WHERE sla_breached) AS count_sla_breached,
       AVG(EXTRACT(EPOCH FROM completed_at - requested_at)/60.0)
           FILTER (WHERE status = 'COMPLETED')      AS avg_ttr_minutes,
       AVG(csat_score) FILTER (WHERE csat_score IS NOT NULL) AS avg_csat,
       COUNT(*) AS total_requested
FROM   callback.callbacks
WHERE  deleted_at IS NULL
GROUP  BY org_id, date_trunc('day', requested_at AT TIME ZONE 'Asia/Kolkata');
```

| Audit dimension | Finding | Evidence |
|---|---|---|
| **(a) Cross-org isolation** | **PASS.** `org_id` is both projected and a `GROUP BY` key, so every output row aggregates exactly one organization's callbacks — no cross-org leakage is structurally possible. The only un-partitioned slice is `snapshot_date`. | `org_id` first column in SELECT + first `GROUP BY` key. Live check: `SELECT count(*), count(DISTINCT org_id) FROM callback.kpi_daily_snapshot` → rows fan out per `(org_id, date)`. |
| **(b) CONCURRENTLY refresh** | **PASS.** Unique index `uq_kpi_daily_snapshot_org_date (org_id, snapshot_date)` exists (from 018). `REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;` ran successfully on the live DB. 067 reasserts the index `IF NOT EXISTS` and a `DO` block raises if no UNIQUE index covers the MV. | `\d+` shows `uq_kpi_daily_snapshot_org_date UNIQUE`; live CONCURRENTLY refresh returned `REFRESH MATERIALIZED VIEW`. |
| **(c) Snapshot-date semantics** | **IST (`Asia/Kolkata`).** `snapshot_date = date_trunc('day', requested_at AT TIME ZONE 'Asia/Kolkata')::date`. `requested_at` is `TIMESTAMPTZ`. **Decision: day boundaries are India Standard Time (UTC+5:30), not UTC** — correct for an India-only product: a callback requested at 02:00 IST (20:30 UTC the prior day) is counted on the IST calendar day the operations team experiences, so daily KPI rollups align with the support team's working day. Documented here as the canonical boundary; any downstream consumer (admin dashboard, reports) must render `snapshot_date` as an IST calendar date and never re-localize it. | `AT TIME ZONE 'Asia/Kolkata'` in the `date_trunc` expression. |

**Observational note (out of NEW-D09 scope — flagged, not changed):** the MV's status filters reference labels `IN_PROGRESS` and `ESCALATED_TO_CA`, but `callback.callbacks.status` currently has a CHECK allowing `PENDING, ASSIGNED, CONFIRMED, COMPLETED, ESCALATED, CANCELLED` (no `IN_PROGRESS`/`ESCALATED_TO_CA`). Those two `FILTER` clauses therefore always evaluate to 0 against the current vocabulary. This is a status-vocabulary drift between 018's MV and a later CHECK change — a backend/data-model decision, not an isolation or refresh defect. Logged for a future reconciliation; the MV is still org-safe.

#### IDOR test scenario (for qa-web — turn into an integration test)

```sql
-- ============================================================================
-- NEW-D09 IDOR scenario: prove kpi_daily_snapshot never aggregates across orgs.
-- Two orgs, callbacks in each on the SAME IST day → expect exactly one MV row
-- per (org_id, snapshot_date), each row counting ONLY its own org's callbacks.
-- ============================================================================
-- Fixed ids for assertions:
--   org A = 11111111-1111-1111-1111-111111111111
--   org B = 22222222-2222-2222-2222-222222222222
-- All requested_at chosen so the IST calendar day is 2026-06-10 for BOTH orgs,
-- including one near the UTC/IST boundary to prove IST bucketing.

-- Org A: 3 callbacks (2 COMPLETED, 1 PENDING) on 2026-06-10 IST
INSERT INTO callback.callbacks (org_id, status, requested_at, completed_at, sla_breached, csat_score)
VALUES
  ('11111111-1111-1111-1111-111111111111','COMPLETED','2026-06-10 09:00:00+05:30','2026-06-10 10:00:00+05:30',false,5),
  ('11111111-1111-1111-1111-111111111111','COMPLETED','2026-06-10 11:00:00+05:30','2026-06-10 11:30:00+05:30',false,3),
  -- 2026-06-09 21:00 UTC == 2026-06-10 02:30 IST → must bucket to 2026-06-10 (IST boundary check)
  ('11111111-1111-1111-1111-111111111111','PENDING','2026-06-09 21:00:00+00:00',NULL,false,NULL);

-- Org B: 2 callbacks (1 CANCELLED, 1 COMPLETED w/ SLA breach) on 2026-06-10 IST
INSERT INTO callback.callbacks (org_id, status, requested_at, completed_at, sla_breached, csat_score)
VALUES
  ('22222222-2222-2222-2222-222222222222','CANCELLED','2026-06-10 14:00:00+05:30',NULL,false,NULL),
  ('22222222-2222-2222-2222-222222222222','COMPLETED','2026-06-10 15:00:00+05:30','2026-06-10 18:00:00+05:30',true,4);

REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;

-- EXPECTED — exactly 2 rows, fully partitioned by org (no cross-org bleed):
--   org A | 2026-06-10 | count_completed=2 | count_pending=1 | total_requested=3 | count_sla_breached=0 | avg_csat=4.0
--   org B | 2026-06-10 | count_completed=1 | count_cancelled=1 | total_requested=2 | count_sla_breached=1 | avg_csat=4.0
-- Assertions for qa-web:
--   1. SELECT count(*) FROM callback.kpi_daily_snapshot
--        WHERE snapshot_date='2026-06-10'
--        AND org_id IN ('1111...','2222...')  => 2  (one row per org, never merged)
--   2. Org A row total_requested = 3 AND org B row total_requested = 2  (no org sees the other's count)
--   3. The org A PENDING callback at 2026-06-09 21:00 UTC lands in the 2026-06-10 row (IST bucketing)
--   4. A query filtering WHERE org_id = '1111...' returns ZERO of org B's metrics (IDOR control)
-- Cleanup:
--   DELETE FROM callback.callbacks WHERE org_id IN
--     ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
--   REFRESH MATERIALIZED VIEW CONCURRENTLY callback.kpi_daily_snapshot;
-- ============================================================================
```

> The API-layer half (`GetKpiSnapshotQuery` must inject `WHERE org_id = <caller-claim>` and reject any org_id from request input) is qa-web's integration assertion against the CallbackService endpoint; the SQL above sets up the data fixture and the per-org expected rows.

### HANDOFF-SWEEP-02 — subscription DPDP erasure metadata (`067`)

Migration **`067_callback_kpi_mv_audit_and_subscription_anonymization.sql`** also adds two DPDP Act 2023 erasure-metadata columns to `subscription.subscription` (additive, idempotent):

| Change | Column | Detail |
|---|---|---|
| ADD `anonymization_reason VARCHAR(200) NULL` | `subscription.subscription` | Free-text reason the subscription PII was anonymized (e.g. data-principal erasure request id). `NULL` = not anonymized. |
| ADD `anonymized_at TIMESTAMPTZ NULL` | `subscription.subscription` | Timestamp the PII was scrubbed. The billing/audit row is **retained** (7-year retention) while its PII fields are anonymized — reconciles DPDP right-to-erasure with statutory retention. `NULL` = not anonymized. |

No FK, CHECK, or RLS change. No EF migration exists for SubscriptionService, so this SQL is canonical.

### HANDOFF-1 — LoanService consent locale + catalog (GAP-040 / P6-HANDOFF-25)

Migration **`061_loan_consent_locale_and_catalog_alignment.sql`** (NEW). Three column deltas + locale seeds:

| Change | Table | Detail |
|---|---|---|
| ADD `consent_locale VARCHAR(10) NOT NULL DEFAULT 'en'` | `loan.consents` | Backs `Consent.ConsentLocale`. BCP-47 locale of the consent text the user actually reviewed — ties the DPDP audit trail to the exact language version. Matches `loan.consent_catalog.locale`. |
| ADD `deleted_at TIMESTAMPTZ NULL` | `loan.consents` | `Consent : BaseAuditableEntity`; `BaseDbContext` applies a **global** `deleted_at IS NULL` query filter and binds `deleted_at` in every INSERT/SELECT. 027 deliberately omitted it, which broke EF reads/writes. The existing `trg_consents_no_delete` trigger still blocks hard DELETE; soft-delete via `UPDATE deleted_at` (what the ORM emits) is allowed, so the DPDP "never hard-delete" intent is preserved (verified: hard DELETE raises, soft-delete UPDATE succeeds). |
| ADD `updated_by UUID NULL` | `loan.consent_catalog` | `ConsentCatalogEntry : BaseAuditableEntity` → EF maps `UpdatedBy → updated_by`. 032 created `last_modified_by` instead. `last_modified_by` is retained and marked `-- DEPRECATED` (Phase-7); `updated_by` is the live audit column. |

**Seed data (consent catalog v1.4):** `032` seeded the three current consent types (`CREDIT_BUREAU`, `DATA_SHARE_WITH_BANK`, `DISBURSEMENT_MANDATE`) for locale `en`. `061` adds the **`hi`** and **`bn`** variants — **6 new rows**, catalog now 9 rows (3 types × 3 locales), unique on `(consent_type, text_version, locale)`, inserted with `ON CONFLICT DO NOTHING`. ⚠ The `hi`/`bn` bodies are **placeholder-but-plausible translations tagged `[PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]`** — legal/compliance must replace them before production (RBI Digital Lending + DPDP legal artifact).

> Note (for backend-agent, observational — not changed here): `loan.consents.consent_type` and `loan.application_documents.*` use PostgreSQL `ENUM` types (`loan.consent_type`, etc.). EF must map the CLR `ConsentType` enum to the `CREDIT_BUREAU`/`DATA_SHARE_WITH_BANK`/`DISBURSEMENT_MANDATE` labels (the repo's `UpperSnakeCaseNameTranslator` handles this). Out of db-engineer scope; flagged for parity awareness only.

---

## Phase 7 Wave 2 Addendum — DPDP self-service, RBI KFS, Razorpay/usage (additive, 2026-06-10)

> Migrations: `062_auth_dpdp_consent_export_correction_and_platform_config.sql` (auth — NEW), `063_loan_key_facts_statement_and_cooling_off.sql` (loan — NEW), `064_subscription_razorpay_config_and_usage_records.sql` (subscription — NEW).
> Status: ADDITIVE. No renames, no drops. Full chain (`000`…`064` + `999`) replays clean on an empty **PostgreSQL 17** database; all three new migrations are idempotent (verified by a second back-to-back apply with `ON_ERROR_STOP=1`).
> Driver: backend-agent Wave 2 (B7/B8/B9/B11/B12) merged EF entities/configurations with **no backing SQL**. AuthService, LoanService and SubscriptionService have **no EF migrations** — the SQL files here are canonical. Every new table backs a `BaseAuditableEntity`, so `BaseDbContext` applies the global `deleted_at IS NULL` query filter and binds `created_by`/`updated_by` (uuid, via a string↔Guid value converter) on every write; therefore **all five audit columns** (`created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`) are present on every table.

### DB-B11/B12 — AuthService DPDP self-service + SEC-056 ghost-route config (`062`)

Five NEW tables in the `auth` schema:

| EF entity → table | Key columns (EF → SQL) | Indexes (exact EF names) | RLS / triggers |
|---|---|---|---|
| `UserConsent` → `auth.user_consent` | `user_id`, `purpose` VARCHAR(200), `purpose_description` VARCHAR(1000), `notice_version` VARCHAR(50), `status` VARCHAR(20), `action_at`, `ip_address` VARCHAR(45), `user_agent` VARCHAR(500), `locale` VARCHAR(20), `withdrawn_at` | `ix_user_consent_user_id`, `ix_user_consent_user_purpose_time (user_id, purpose, action_at)` | RLS user-isolation (`user_id = app.current_user_id`). **APPEND-ONLY**: `trg_user_consent_no_delete` blocks hard DELETE; soft-delete (`UPDATE deleted_at`) allowed (mirrors `loan.consents`). FK→`auth.user` **without** cascade (audit retention). |
| `DataExportRequest` → `auth.data_export_request` | `user_id`, `status` VARCHAR(20), `gcs_object_path` VARCHAR(500), `download_url` VARCHAR(2000), `download_url_expires_at`, `error_message` VARCHAR(1000), `hangfire_job_id` VARCHAR(100) | `ix_data_export_request_user_id`, `ix_data_export_request_user_status` | RLS user-isolation. FK→`auth.user` `ON DELETE CASCADE`. `updated_at` trigger. |
| `DataCorrectionRequest` → `auth.data_correction_request` | `user_id`, `data_category` VARCHAR(100), `description` VARCHAR(2000), `status` VARCHAR(30), `reviewer_note` VARCHAR(2000), `reviewed_by_user_id`, `resolved_at` | `ix_data_correction_request_user_id`, `ix_data_correction_request_user_status` | RLS user-isolation. FK `user_id`→`auth.user` CASCADE; FK `reviewed_by_user_id`→`auth.user` `ON DELETE SET NULL`. |
| `FeatureFlag` → `auth.feature_flag` | `flag_key` VARCHAR(100), `is_enabled` BOOL DEFAULT FALSE, `description` VARCHAR(500). `created_by`/`updated_by` are **inherited** (not in the config) and auto-mapped by `BaseDbContext` → present as uuid. | `ix_feature_flag_flag_key` UNIQUE | **No RLS** (global admin registry; gated by RBAC). `updated_at` trigger. |
| `PlatformConfig` → `auth.platform_config` | `config_key` VARCHAR(100), `config_value` **JSONB** (EF `ConfigValueJson → config_value`). `created_by`/`updated_by` inherited. | `ix_platform_config_config_key` UNIQUE | **No RLS** (global admin store; gated by RBAC). `updated_at` trigger. |

### DB-B7/B8 — LoanService RBI Key Facts Statement + cooling-off (`063`)

| Object | Detail |
|---|---|
| NEW `loan.key_facts_statement` (`KeyFactsStatement`) | `application_id`→`loan.applications(id)` (non-unique; versioning allowed), `annual_percentage_rate` NUMERIC(10,4), `loan_amount` NUMERIC(18,2), `tenure_months` INT, `monthly_emi` NUMERIC(18,2), `fees_json`/`repayment_schedule_json` JSONB, `lender_name` VARCHAR(200), `grievance_officer_contact` VARCHAR(1000), `cooling_off_days` INT, `hmac_signature` VARCHAR(500), `generated_at`, `acknowledged_at`. Index `ix_key_facts_statement_application_id`. RLS org-scoped via parent application (mirrors `loan.consents`). |
| KFS **immutability** trigger | `trg_kfs_immutable_signed_fields` (BEFORE UPDATE) raises if any **signed** field changes (`application_id`, APR, `loan_amount`, `tenure_months`, `monthly_emi`, fees/schedule JSON, `lender_name`, `grievance_officer_contact`, `cooling_off_days`, `hmac_signature`, `generated_at`). **Allows** `acknowledged_at`, audit cols, and `deleted_at` — required because `RecordConsent` calls `RecordAcknowledgement()` (a single legitimate UPDATE). A blanket no-UPDATE trigger would have broken acknowledgement; verified: signed-field UPDATE raises, `acknowledged_at`/soft-delete UPDATE succeed. |
| ALTER `loan.applications` | ADD `cooling_off_ends_at TIMESTAMPTZ NULL`, `cooling_off_days INT NULL` (GAP-021 RBI cooling-off window). Table is `loan.applications` (the Phase 6C v2 table) — the handoff's `loan.loan_applications` name was **incorrect**; verified against `LoanApplicationConfiguration.ToTable("applications")`. |
| `kfs_id` on `loan.consents`? | **Not added.** The handoff asked to check; `RecordConsentCommand` takes a `KfsId` but only uses it to look up + acknowledge the KFS — the `Consent` entity/config has **no `KfsId` property**, so nothing is persisted on `loan.consents`. (Confirmed against `ConsentConfiguration.cs` + `RecordConsentCommandHandler.cs`.) |

### DB-B9 — SubscriptionService Razorpay config + usage metering (`064`)

| EF entity → table | Key columns | Indexes | RLS / notes |
|---|---|---|---|
| `RazorpayConfig` → `subscription.razorpay_config` | `key_id` VARCHAR(100), `encrypted_key_secret` VARCHAR(1000), `encrypted_webhook_secret` VARCHAR(1000) NULL, `test_mode` BOOL DEFAULT TRUE, `is_enabled` BOOL DEFAULT FALSE. AES-256-GCM secrets encrypted by the app. | (PK only) | **No RLS** (single-row global integration config; RBAC-gated). `updated_at` trigger. |
| `UsageRecord` → `subscription.usage_records` (**plural**) | `org_id`, `feature_code` VARCHAR(100), `units` INT DEFAULT 1, `period_start`, `period_end`, `correlation_id` VARCHAR(200) | `ix_usage_records_org_feature_period (org_id, feature_code, period_start)`, `ix_usage_records_org_id` | RLS org-isolation (mirrors `010` org policies). **Distinct** from the pre-existing **singular** `subscription.usage_record` (a per-period rollup from `010`). |

**Partitioning note:** `subscription.usage_records` is an append-only per-event metering ledger and is expected to grow large. It is kept as a single table for now to match the EF model. A future migration may RANGE-partition it by `period_start` (monthly) for retention/pruning — a transparent, additive optimisation that does not change the EF mapping.

### Verification summary (Wave 2)

- **Full-chain replay:** `000`…`064` + `999` applied in order with `ON_ERROR_STOP=1` on a fresh `pgvector/pgvector:pg17` (PostgreSQL 17.9) database — **all 66 files OK**.
- **Idempotency:** `062`/`063`/`064` re-applied a second time back-to-back — **all OK** (every object guarded by `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP ... IF EXISTS` + `CREATE`).
- **EF↔SQL parity:** every column verified column-by-column against `information_schema` (name, type, precision/scale, length, nullability) — exact match for all 8 new tables + the 2 added `loan.applications` columns. All EF `HasDatabaseName` index names present. Trigger/RLS behaviour functionally tested (consent hard-delete blocked + soft-delete allowed; KFS signed-field UPDATE blocked + acknowledgement/soft-delete allowed).
- **Deviations from handoff:** (1) table is `loan.applications`, not `loan.loan_applications`; (2) no `kfs_id` column on `loan.consents` (entity has no such property); (3) `loan.key_facts_statement` uses a signed-field-only immutability trigger rather than a blanket no-UPDATE trigger, to permit borrower acknowledgement.

## Phase 7 Wave 3 — Document review-decision columns

> Migration: `065_document_review_decision_columns.sql` (document — NEW).
> Status: ADDITIVE. No renames, no drops, no constraint/RLS changes. Idempotent (re-applied back-to-back with `ON_ERROR_STOP=1` — clean, `ADD COLUMN IF NOT EXISTS` skips).
> Driver: backend-agent B15 handoff — the document review workflow records who decided an approval/rejection and (on reject) the reason, but the canonical `document.document` table had no columns to persist the decision, causing an EF-entity ↔ DB-table divergence.

### DB-B15 — DocumentService review decision (`065`)

| Column added on `document.document` | Type | Purpose |
|---|---|---|
| `rejection_reason` | `TEXT` NULL | Free-text reason captured when a review decision sets status → `REJECTED`. |
| `approved_by` | `UUID` NULL | `user_id` (auth.user, referenced **by value** — no FK, matching the existing cross-schema convention used by `user_id`/`created_by`/`updated_by`) of the reviewer who recorded the decision. |
| `approved_at` | `TIMESTAMPTZ` NULL | Timestamp the approve/reject decision was recorded. |

**Partitioning note:** `document.document` is a RANGE-partitioned (by `uploaded_at`) parent. `ADD COLUMN` on the parent propagates automatically to every existing monthly partition and all future partitions — verified present on the parent and on partition `document_2026_06`. `document.document_archive` is a **standalone** archive/lifecycle table (NOT a partition of `document.document` per `pg_inherits`), so it does not receive these columns — that is by design and out of scope for the `Document` EF entity.

### Verification summary (Wave 3)

- Migration applied to the live local DB (`snapaccount`, PostgreSQL 17) with `ON_ERROR_STOP=1` — OK. Re-applied back-to-back — OK (idempotent).
- Columns verified against `information_schema.columns` on the partitioned parent + a partition: `rejection_reason TEXT`, `approved_by UUID`, `approved_at TIMESTAMPTZ`, all nullable.
- **Deviation from handoff:** none on naming — the table is `document.document` exactly as the B15 report stated (confirmed via `\d document.*`).

## Phase 7 — EF ↔ DB reconciliation sweep (additive, 2026-06-11)

> Migration: `066_phase7_ef_reconciliation_additive.sql` (cross-service — itr / loan / gst / accounting / notification / subscription).
> Status: ADDITIVE. No renames, no drops, no type changes. Idempotent (applied with `ON_ERROR_STOP=1`, then re-applied back-to-back — second run emitted only `… already exists, skipping` NOTICEs, zero errors).
> Driver: backend-agent left `DDL HANDOFF (db-engineer)` comments in the affected EF entity configurations after the Phase-7 EF↔DB sweep. Each item was verified against the live local DB **before** writing DDL — actual (singular/plural) table names were checked and the live column set diffed.

### Replay gaps discovered (flagged loudly)

Two earlier migrations declared schema that **never reached the live DB** — `IF NOT EXISTS` makes the re-application safe everywhere:

| Earlier migration | Declared | Live DB state before 066 | Re-applied by 066 |
|---|---|---|---|
| `060_notification_ef_alignment.sql` | `notification.notification_event` table + 6 dispatch columns on `notification.notification_log` (`user_id`, `event_code`, `channel`, `language`, `rendered_body`, `dedupe_key`) | table absent; none of the 6 columns present | item 13 (table), item 12 (columns) |
| `061_loan_consent_locale_and_catalog_alignment.sql` | `loan.consents.consent_locale` | column absent | item 4 |

These indicate a **migration-replay drift on the local DB** (the SQL files are the canonical schema but the runner did not apply 060/061 in full). DevOps should confirm the CI migration-replay job covers 060/061 → 066 on a clean DB.

### Table-name reconciliations (singular vs plural)

The schema has several legacy/parallel table pairs; 066 targets the **EF-mapped** table in each case (verified via `ToTable(...)` in the EF config and live `information_schema`):

| Concern | EF-mapped (targeted) | Legacy / parallel (not touched) |
|---|---|---|
| Loan applications | `loan.applications` | `loan.loan_application` |
| Partner banks (FK target) | `loan.partner_banks` (PK `id`) | `loan.partner_bank` |
| Loan consents | `loan.consents` | `loan.loan_consent` |
| Subscription usage | `subscription.usage_record` (singular) | `subscription.usage_records` (plural, from `064`) |
| ITR | `itr.assessee_profiles`, `itr.filings` | — |

> **`subscription.usage_record` (singular)**: `UsageRecordConfiguration.ToTable("usage_record")` currently `Ignore()`s `FeatureCode`/`Units`/`CorrelationId` because the columns didn't exist. 066 adds them to the singular table so backend can drop the `Ignore()`s. The plural `usage_records` (064) already has equivalents but is a different table and is left untouched.

### Columns / tables added by `066`

| # | Object | Added | Notes |
|---|---|---|---|
| 1 | `itr.assessee_profiles` | `organization_id UUID` **NULLABLE** + idx | Security-relevant — org isolation currently RLS-only. NULLABLE first; **backfill → NOT NULL → EF re-enable is a follow-up migration**. |
| 2 | `loan.applications` | `assigned_bank_id UUID` → `loan.partner_banks(id)` + idx | FK `fk_loan_applications_assigned_bank`. |
| 3 | `loan.webhook_idempotency_keys` | **NEW TABLE** | `(bank_id, idempotency_key)` UNIQUE dedupe; `expires_at` idx for TTL. DDL from `WebhookIdempotencyKeyConfiguration.cs`. |
| 4 | `loan.consents` | `consent_locale VARCHAR(10) DEFAULT 'en'` | Replay gap from `061`. |
| 5 | `gst.gst_refund` | `tax_period VARCHAR(20)`, `filed_at TIMESTAMPTZ`, `application_number VARCHAR(100)` | `tax_period` distinct from existing `tax_period_from/to` range. |
| 6 | `gst.lut_filing` | `export_type VARCHAR(20) DEFAULT 'GOODS'`, `is_auto_renewal BOOLEAN DEFAULT FALSE` | |
| 7 | `gst.gst_annual_return` | `form_type VARCHAR(20)`, `total_turnover/total_tax_paid/total_itc_claimed NUMERIC(20,2)`, `notes TEXT`, `is_reconciled BOOLEAN DEFAULT FALSE`, `reconciled_at TIMESTAMPTZ` | GSTR-9 reconciliation. |
| 8 | `accounting.account` | `is_postable BOOLEAN DEFAULT TRUE`, `is_from_template BOOLEAN DEFAULT FALSE`, `template_code VARCHAR(20)` | |
| 9 | `accounting.journal_entry` | `fy_year SMALLINT` | Starting calendar year of the Indian FY. |
| 10 | `accounting.internal_audit` | `audit_title VARCHAR(300)`, `financial_year VARCHAR(10)`, `auditor_firm_name VARCHAR(300)`, `executive_summary TEXT`, `report_document_id UUID` + idx, `report_issued_at TIMESTAMPTZ` | `report_document_id` references `document.document` by value. |
| 11 | `accounting.internal_audit_finding` | `title VARCHAR(500)`, `evidence_document_id VARCHAR(100)`, `resolved_at TIMESTAMPTZ` | `evidence_document_id` is a **VARCHAR token per the entity**, not a UUID FK. |
| 12 | `notification.notification_log` | `user_id UUID`, `event_code VARCHAR(200)`, `channel VARCHAR(30)`, `language VARCHAR(10) DEFAULT 'en'`, `rendered_body TEXT`, `dedupe_key VARCHAR(128)` + 2 idx | Replay gap from `060` (all 6 were the delta). |
| 13 | `notification.notification_event` | **NEW TABLE** + category idx + `updated_at` trigger | Replay gap from `060`. DDL from `NotificationEventConfiguration.cs`. |
| 14 | `subscription.usage_record` (singular) | `feature_code VARCHAR(100)`, `units INTEGER DEFAULT 1`, `correlation_id VARCHAR(200)` + partial idx | Lets EF stop `Ignore()`-ing these. |
| 15 | `itr.filings` | `computation_hash VARCHAR(64)`, `salary_income/house_property_income/business_income/capital_gains/other_income NUMERIC(20,2)` | |

### Follow-ups owed to backend-agent

1. **`itr.assessee_profiles.organization_id`** — separate migration to backfill, then `SET NOT NULL`; backend then re-enables the NOT NULL EF mapping. Until then org isolation on assessee profiles remains RLS-only.
2. **EF `Ignore()` removals** — backend can now map: `SubscriptionService` `UsageRecord.FeatureCode/Units/CorrelationId` (remove the three `builder.Ignore(...)` lines in `UsageRecordConfiguration.cs`); `LoanService` `WebhookIdempotencyKey` and `NotificationService` `NotificationEvent` entities now have real tables.

### Verification summary (066)

- Applied to live local DB (`snapaccount`, PostgreSQL 17) with `ON_ERROR_STOP=1` — OK. Re-applied back-to-back — OK (only `already exists, skipping` NOTICEs).
- End-state spot-checked via `information_schema` / `pg_constraint`: `organization_id` nullable=YES; `consent_locale` default `'en'`; FK `fk_loan_applications_assigned_bank` present; `uq_webhook_idem_bank_key` present; `notification.notification_event` exists; 6/6 `notification_log` dispatch columns; 3/3 singular `usage_record` columns; `itr.filings.salary_income = numeric(20,2)`.

## Phase 7 — ITR + invoice DPDP anonymization (additive, `068`, 2026-06-11)

Migration **`068_itr_subscription_invoice_dpdp_anonymization.sql`** closes the live 500 `42703: column f.anonymization_reason does not exist` on the ITR admin listing. Three entities mapped DPDP Act 2023 erasure metadata that their backing tables lacked. Additive, idempotent (`ADD COLUMN IF NOT EXISTS`), applied to the live local DB under `ON_ERROR_STOP=1` and re-run back-to-back cleanly.

| Table | Columns added | Why |
|---|---|---|
| `itr.filings` | `anonymization_reason VARCHAR(200)`, `anonymized_at TIMESTAMPTZ` | `Filing` entity; admin listing selects `anonymization_reason`. |
| `itr.assessee_profiles` | `anonymization_reason VARCHAR(200)`, `anonymized_at TIMESTAMPTZ` | `Assessee` entity. |
| `subscription.subscription_invoice` | `anonymization_reason VARCHAR(200)`, `anonymized_at TIMESTAMPTZ`, `razorpay_order_id VARCHAR(100)` | `Invoice` entity. Table previously had only `razorpay_invoice_id` (→ `RazorpayPaymentId`); the entity also exposes `RazorpayOrderId`, which had no column. |

The DPDP pair mirrors the shape added to `subscription.subscription` in `067` and to chat/callback/loan tables earlier: anonymize PII in-place on a right-to-erasure request while retaining the row for 7-year compliance retention.

### Completeness check — DPDP `(anonymization_reason, anonymized_at)` pair

Cross-checked every entity carrying `AnonymizationReason` (10 total) against its backing table. After `068`, all 10 tables have the full pair: `callback.callbacks`, `chat.messages`, `itr.notices`, `itr.form_16_extracts`, `itr.filings`, `itr.assessee_profiles`, `loan.applications`, `loan.consents`, `subscription.subscription`, `subscription.subscription_invoice`. No other entity-backed table is missing the pair.

**Out-of-scope observation (flagged, not changed):** a whole-DB scan for asymmetric pairs found `gst.notices` has `anonymized_at` but NOT `anonymization_reason`. This is benign — `GstNotice` has no `AnonymizationReason` property (it anonymizes by nulling `responded_by` via `AnonymizeRespondent()`), and its EF config maps neither anonymization column. So the orphan `anonymized_at` is unused and the missing `anonymization_reason` cannot 500. Logged for a future tidy-up; no action taken under this task's scope.

### Verification summary (068)

- Applied to live local DB (`snapaccount`, PostgreSQL 17) with `ON_ERROR_STOP=1` — OK. Re-applied back-to-back — OK (exit 0).
- End-state confirmed via `information_schema.columns`: 7/7 columns present with correct types (`anonymization_reason` = `varchar(200)`, `anonymized_at` = `timestamptz`, `razorpay_order_id` = `varchar(100)`).

## Phase 7 — `itr.filings.reviewed_by_ca_id` (additive, `069`, 2026-06-11)

Migration **`069_itr_filings_reviewed_by_ca_id.sql`** closes the next ITR admin-listing 500 after 068: `42703: column f.reviewed_by_ca_id does not exist`. The `Filing` entity exposes `ReviewedByCaId` (Guid?, nullable — CA reviewer user id) with **no** explicit `HasColumnName`, so EF maps it by snake_case convention to `reviewed_by_ca_id`, which the table lacked.

- Added `itr.filings.reviewed_by_ca_id UUID` (nullable).
- Added partial index `idx_filings_reviewed_by_ca_id ON itr.filings (reviewed_by_ca_id) WHERE reviewed_by_ca_id IS NOT NULL` (reviewer is sparse), mirroring the existing `idx_filings_ca_reviewer` pattern.
- The id references an `auth` user by value (cross-schema, no FK), consistent with the rest of the schema.

**Orphan column `ca_reviewer_id` (NOT changed):** `itr.filings` already had `ca_reviewer_id` (uuid, nullable, partial index `idx_filings_ca_reviewer`). No EF property maps it (the entity maps `reviewed_by_ca_id`, not `ca_reviewer_id`) and it is empty (0 rows). Per the additive-only rule we did **not** rename `ca_reviewer_id → reviewed_by_ca_id`; we added the EF-expected column alongside and marked the old one `-- DEPRECATED` in 069. Whether to backfill from / drop `ca_reviewer_id` is a backend/data-model decision — flagged to backend-agent.

### Whole-ITR EF ↔ schema verdict (after `069`)

Ran an EF-config-vs-`information_schema` diff across **all 14 ITR tables** (advance_tax, deduction_sections, assessee_profiles, equalisation_levy, grievances, filings, form_16_extracts, notices, lower_tds_certificate, specified_person_check, refund_status_log, tax_computation, tax_slab_versions, transfer_pricing_report), covering both explicitly-mapped (`HasColumnName`) **and** convention-mapped (default snake_case) properties — the latter being the exact class `reviewed_by_ca_id` belonged to.

**Verdict: ITR schema fully reconciled with EF.** Zero missing columns on any ITR table for both mapping styles. `itr.filings` was the last gap; `069` closes it.

### Verification summary (069)

- Applied to live local DB (`snapaccount`, PostgreSQL 17) with `ON_ERROR_STOP=1` — OK. Re-applied back-to-back — OK (exit 0; only `already exists, skipping` index NOTICE).
- End-state confirmed: `itr.filings.reviewed_by_ca_id` = `uuid` nullable; partial index `idx_filings_reviewed_by_ca_id` present.

## Phase 7 — `loan.products.read` permission seed (data-only, `070`, 2026-06-11)

Migration **`070_auth_seed_loan_products_read_permission.sql`** seeds the RBAC permission behind `GET /loans/products` (`[RequiresPermission("loan.products.read")]`). `auth.permission` had no row named `loan.products.read`, so `PermissionBehavior` (which resolves by permission **name**) let only the wildcard `SUPER_ADMIN` through — every other role 403'd on the mobile loan-product hub.

- **Permission seeded:** `name='loan.products.read'`, `resource='loan'`, `action='products.read'` — following the live loan.* convention (resource = first dot-segment, action = remainder), as in the 036 catalog seed. Idempotent via `ON CONFLICT (name) DO NOTHING`.
- **Type backfill:** `resource_type_id` set from `auth.resource_type` where `key='loan'` (matches 044's backfill). `action_type_id` left NULL — no `action_type` with key `products.read` exists and we don't invent one (nullable / `ON DELETE SET NULL` design).
- **Grants (mirror):** granted to exactly the roles already holding `loan.eligibility.check`, resolved by join (not hardcoded) so it self-adjusts. On the live DB that audience = **ORG_ADMIN + SUPER_ADMIN** (2 grants). Set-difference both ways against `loan.eligibility.check` = empty, i.e. exact parity. Idempotent via `ON CONFLICT (role_id, permission_id) DO NOTHING`.

**Audience caveat (flagged to RBAC owner, NOT widened in 070):** `loan.eligibility.check` is currently held only by the two admin-tier roles, so mirroring it does NOT grant `loan.products.read` to customer/staff-tier roles (BUSINESS_OWNER, ORG_MEMBER, EMPLOYEE, etc.). If the loan-product hub is meant for those audiences, that is a separate RBAC decision and a follow-up grant. 070 deliberately stays within the explicit "mirror eligibility.check" scope.

**Fresh-DB note:** the permission catalog + default grants are seeded only by migrations (036 + 070); `database/dev-seed/*` does not touch `auth.permission`/`auth.role_permission`, so no dev-seed file needed editing — fresh DBs get this row by replaying the migration chain.

### Verification summary (070)

- Applied to live local DB with `ON_ERROR_STOP=1` — OK (`INSERT 0 1`, `UPDATE 1`, `INSERT 0 2`). Re-applied back-to-back — OK (`INSERT 0 0`, `UPDATE 0`, `INSERT 0 0`, exit 0).
- Confirmed: permission row present with `resource_type_id` set / `action_type_id` NULL; non-admin role **ORG_ADMIN** now holds `loan.products.read`; grant audience matches `loan.eligibility.check` exactly.

## Phase 7 — MCA statutory edit log for books of account (`071`, GAP-100, 2026-06-11)

Migration **`071_accounting_mca_edit_log.sql`** implements the Companies (Accounts) Rules audit-trail requirement: a per-transaction, **non-disableable, immutable** edit log of every CREATE/ALTER/DELETE on the books of account, with ≥ 8-year retention.

**`accounting.edit_log`** — append-only table. `id`, `org_id`, `entity_type` (`journal_entry`/`journal_entry_line`/`ledger_entry`/`account`/`ledger`), `entity_id`, `operation` (INSERT/UPDATE/DELETE), `changed_by`, `changed_at` (`clock_timestamp()`), `before_state`/`after_state` JSONB, `change_reason`, `request_id`, `correlation_id`, `fy_year`, `retention_until` (= `changed_at + 8 years`), `created_at`. Deliberately **no `updated_at`/`deleted_at`** — a written row is frozen. Indexes: `(org_id, changed_at)`, `(entity_type, entity_id)`, `(org_id, fy_year)`, `(changed_by)`. RLS org-isolation policy added as defence-in-depth (app connects as owner; primary control is app-layer RBAC).

**Immutability at the DB level (statutory, applies to SUPER_ADMIN and the table owner):** `accounting.reject_edit_log_mutation()` is wired as `BEFORE UPDATE`, `BEFORE DELETE`, and `BEFORE TRUNCATE` triggers that `RAISE EXCEPTION`. A Postgres trigger is *not* bypassed by table ownership, so even the owner / a SUPER_ADMIN connection cannot UPDATE/DELETE/TRUNCATE the log — exactly what the statute requires. `REVOKE UPDATE, DELETE, TRUNCATE … FROM PUBLIC` (and from `snapaccount_app` when that role exists) is added as belt-and-braces.

**Non-disableable capture (DB-level, cannot be bypassed by app code):** `accounting.capture_edit_log()` is an `AFTER INSERT/UPDATE/DELETE FOR EACH ROW` trigger attached to `accounting.journal_entry`, `accounting.journal_entry_line`, `accounting.account`, and `accounting.ledger_entries`. Because capture lives in the database, the log is written whether the change comes from EF, raw SQL, or `psql`. The function reads context from request-scoped GUCs (`app.current_user_id`, `app.change_reason`, `app.request_id`, `app.correlation_id`) using the `missing_ok=TRUE` form so capture never fails when a GUC is unset; `changed_by` falls back to the row's `updated_by`/`created_by`/`posted_by`/`reviewer_user_id` when the GUC is absent. `org_id`/`entity_id`/`fy_year` are resolved generically from the row's `to_jsonb`, so one function serves tables with differing spellings (`organization_id` vs `org_id`, `financial_year` vs `fy_year`).

**`ledger_entry` naming / why `accounting.ledger` is excluded:** the task names a `ledger_entry` table; the real transaction tables are `accounting.ledger_entries` (OCR/posting-pipeline single-pair entries) and `accounting.journal_entry(_line)`. `accounting.ledger` holds **derived running balances** (a `GENERATED` `closing_balance`, period rollups) — a recomputable projection of the journals, not source transactions — so it is intentionally NOT captured to avoid duplicating authoritative entries. If a future path writes ledger balances as source-of-truth, add it to the trigger list. (The `ledger` value remains permitted in `entity_type` for forward compatibility.)

**8-year retention = KEEP.** There is no TTL/purge job. `retention_until` documents the statutory minimum keep-until date; nothing deletes rows.

#### Auditor-report contract (071) — backend/frontend handoff

The FY edit-log export that an auditor/CARO review consumes is a straight read of `accounting.edit_log` filtered by org and financial year, ordered chronologically:

```sql
SELECT changed_at, entity_type, entity_id, operation, changed_by,
       change_reason, before_state, after_state, request_id, correlation_id
FROM   accounting.edit_log
WHERE  org_id = :org_id
  AND  fy_year = :fy_year          -- e.g. '2026-27'
ORDER  BY changed_at, id;
```

- Org isolation is the caller's responsibility (inject `org_id` from the authenticated identity, like the callback KPI read path) — the MV-style "no trusting request body" rule.
- For a per-transaction history view, filter `WHERE entity_type = :t AND entity_id = :id ORDER BY changed_at`.
- `changed_by` may be NULL for changes made before the backend sets `app.current_user_id` per request — backend should set that GUC (`SET LOCAL app.current_user_id = '<uuid>'`, plus optionally `app.change_reason`/`app.request_id`/`app.correlation_id`) at the start of each accounting write transaction so the statutory "who" is always captured. **This is the one backend change needed to make the log fully attributable.**
- The export is append-only and tamper-evident by construction (no row can be altered/removed after the fact).

#### Verification summary (071)

- Full chain `000…999 + 071` replays clean on a scratch DB; `071` re-runs idempotently (live + scratch).
- Capture confirmed: inserting an `account` + a `journal_entry` and updating the entry produced 3 `edit_log` rows (account INSERT, journal_entry INSERT + UPDATE) with correct `retention_until = changed_at + 8 years` and `org_id`. With `app.current_user_id` set, `changed_by` is captured from the GUC.
- Immutability confirmed: `UPDATE`, `DELETE`, and `TRUNCATE` on `accounting.edit_log` all raise `restrict_violation` (append-only by statute). Applied to live `snapaccount`; 4 capture triggers + 3 immutability triggers present.

## Phase 7 — IT Act 2025 act-version dimension on ITR config (`072`, GAP-102, 2026-06-11)

Migration **`072_itr_act_version_dimension.sql`** adds the missing *Act* dimension so 1961-era and 2025-era tax config can coexist and be resolved unambiguously once IT Act 2025 content lands (effective FY/tax-year 2026-27).

- **Additive columns** on the FY/AY-versioned config tables `itr.tax_slab_versions`, `itr.deduction_sections`, and the legacy `itr.tax_slab`: `act_version VARCHAR(20) NOT NULL DEFAULT 'IT_ACT_1961'` (CHECK `IN ('IT_ACT_1961','IT_ACT_2025')`) and `tax_year VARCHAR(10)` (new-Act terminology kept **alongside** `ay`/`financial_year`, not replacing them). Default keeps every existing row resolving exactly as today. New resolution indexes include `act_version`. `tax_year` is backfilled from the existing `ay`/`financial_year` (illustrative convenience).
- **`itr.act_section_mapping`** reference table for the 1961→2025 renumbering: `old_section`, `new_section`, `act_version_from` (`IT_ACT_2025`), `description`, `is_illustrative` (default TRUE), `source_citation`, audit cols, UNIQUE `(old_section, act_version_from)`. Reference table — no RLS. Seeded with **three ILLUSTRATIVE** rows (80C→123, 80D→126, 87A→157) each flagged `is_illustrative=TRUE` and citation `'ILLUSTRATIVE — verify against Income-tax Act, 2025 enacted text'`. A complete, legally-vetted mapping is a separate content task; the new-clause numbers MUST be verified before any filing output uses them.

**Backend handoff (072):** ItrService config-resolution handlers must add `act_version` to their lookup predicate once 2025-Act config is seeded — for tax year **2026-27 onward**, resolve `WHERE act_version = 'IT_ACT_2025'`; earlier periods stay `'IT_ACT_1961'`. Until then the default keeps every lookup on `IT_ACT_1961`, so this migration is behaviour-neutral. Do not surface illustrative `act_section_mapping` rows as authoritative in the UI.

#### Verification summary (072)

- Applied to live `snapaccount` + scratch chain replay — OK; idempotent re-run OK.
- Confirmed all 3 tables carry `act_version` + `tax_year`; existing `tax_slab_versions` rows all default to `IT_ACT_1961`; `tax_year` backfilled (e.g. `AY2025-26 → 2025-26`); 3 illustrative mappings seeded with `is_illustrative=TRUE`.

## Phase 7 — callback KPI MV status-vocabulary fix (`073`, GAP-029, 2026-06-11)

Migration **`073_callback_kpi_mv_vocab_fix.sql`** repairs `callback.kpi_daily_snapshot`, whose `FILTER` predicates still used the original `018` status labels (`SCHEDULED`, `IN_PROGRESS`, `ESCALATED_TO_CA`). Migration `056` re-aligned `callback.callbacks.status` to the domain enum vocabulary (`PENDING|ASSIGNED|CONFIRMED|COMPLETED|ESCALATED|CANCELLED`), so those three FILTER counts had been permanently 0.

- The MV is recreated mapping FILTERs to the **real** vocabulary while keeping **every column name identical**: `count_scheduled ← ASSIGNED`, `count_in_progress ← CONFIRMED`, `count_escalated ← ESCALATED` (`count_pending`/`count_completed`/`count_cancelled` unchanged). The IST (`Asia/Kolkata`) day-boundary and all other measures (`count_sla_breached`, `avg_ttr_minutes`, `avg_csat`, `total_requested`) are preserved.
- Column names are stable, so the EF read model (`KpiDailySnapshotConfiguration`) and `GetKpiSnapshotQuery` are **unaffected** (verified READ-ONLY against the live handler — it binds `count_scheduled`/`count_in_progress`/`count_escalated` and the frontend already labels them Scheduled/InProgress/Escalated). The unique index `uq_kpi_daily_snapshot_org_date (org_id, snapshot_date)` is recreated so `REFRESH … CONCURRENTLY` still works.

#### Verification summary (073)

- Applied to live `snapaccount` + scratch replay — OK; idempotent re-run OK.
- Column set on the MV is byte-for-byte the same as before; MV definition no longer references `ESCALATED_TO_CA`/`SCHEDULED`/`IN_PROGRESS`.
- Seeded one callback in each status on the scratch DB → after `REFRESH`, `count_scheduled`/`count_in_progress`/`count_escalated` each = 1 (previously always 0); `REFRESH MATERIALIZED VIEW CONCURRENTLY` succeeds. On live data the existing `ESCALATED` callback now shows `count_escalated = 1`.

## Phase 7 — GSTN IMS + GSTR-1A schema and RBAC (`074`, GAP-101, 2026-06-11)

Migration **`074_gst_ims_gstr1a_schema_and_permissions.sql`** lands the backing tables for the GstService IMS (Invoice Management System — GSTN's mandatory ITC flow from Apr-2026) and GSTR-1A amendments, plus the 5 RBAC permissions guarding the new endpoints. The three EF entity configs carried a "requires db-engineer DDL handoff" note.

**Authoritative shape = the EF configurations** (`ImsInvoiceConfiguration`, `ImsActionLogConfiguration`, `Gstr1aAmendmentConfiguration`), reconstructed column-for-column (the orchestrator's message carried no inline DDL; instruction was to reconstruct from EF and verify exactly). Verified live: every column name, max-length (15/200/50/30/20/6/500/128), `numeric(18,2)`, `jsonb`, and audit column matches the EF `HasColumnName`/`HasMaxLength`/`HasColumnType`; every index name matches the EF `HasDatabaseName`.

- **`gst.ims_invoices`** — inbound supplier invoices for accept/reject/pending. Indexes `ix_ims_invoices_org_period`, `ix_ims_invoices_org_status`, and **unique partial** `uix_ims_invoices_org_supplier_invoice_period (organization_id, supplier_gstin, invoice_number, period) WHERE deleted_at IS NULL` (partial so a soft-deleted row doesn't block re-ingest — matches the EF unique index intent + the house soft-delete convention).
- **`gst.ims_action_logs`** — **APPEND-ONLY** audit of every IMS action. No `updated_at`/`deleted_at` (permanent records, 7-year retention). Immutable at the DB level reusing the `accounting.edit_log` (071) pattern: `gst.reject_ims_action_log_mutation()` rejects `UPDATE`/`DELETE`/`TRUNCATE` for all roles incl. the owner, plus `REVOKE UPDATE,DELETE,TRUNCATE FROM PUBLIC` (+ `snapaccount_app`). No FK to `ims_invoices` (matches EF — avoids cascade-delete risk on the append log). Indexes `ix_ims_action_logs_invoice_id`, `ix_ims_action_logs_org_acted_at`.
- **`gst.gstr1a_amendments`** — supplier GSTR-1A amendments (`amendment_payload_json jsonb`). Indexes `ix_gstr1a_amendments_org_period`, `ix_gstr1a_amendments_org_status`, `ix_gstr1a_amendments_original_ims_invoice`.

**RLS — house style chosen over the handoff sketch (orchestrator instruction).** The handoff sketched `org_id = current_setting('app.current_org_id', true)`, but **no `app.current_org_id` GUC exists anywhere** and every live `gst.*` table uses column `organization_id` (which the EF mapping also uses) with the org-**membership** subquery keyed on `current_setting('app.current_user_id', TRUE)::uuid`. All three new tables follow that established `gst.*` pattern. (RLS is defence-in-depth; the app connects as schema owner — primary control is app-layer RBAC + IDOR org filters.)

**RBAC (5 permissions, 070 seed pattern).** Seeded `gst.ims.read`, `gst.ims.action`, `gst.ims.sync`, `gst.gstr1a.read`, `gst.gstr1a.create` (resource=`gst`; `resource_type_id` backfilled by key; `action_type_id` left NULL — no matching `action_type` key exists, consistent with 070, do not invent). Grants mirror the live audience of the closest existing `gst.*` permission, resolved by join (self-adjusting, idempotent):

| Permission | Mirrored from | Granted roles (live) |
|---|---|---|
| `gst.ims.read` | `gst.itc.reconcile` | CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN |
| `gst.gstr1a.read` | `gst.itc.reconcile` | CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN |
| `gst.ims.action` | `gst.returns.file` | CA, DEV_LIMITED_MANAGER, ORG_ADMIN, SUPER_ADMIN |
| `gst.ims.sync` | `gst.returns.file` | CA, DEV_LIMITED_MANAGER, ORG_ADMIN, SUPER_ADMIN |
| `gst.gstr1a.create` | `gst.returns.file` | CA, DEV_LIMITED_MANAGER, ORG_ADMIN, SUPER_ADMIN |

**Audience flag (NOT invented/widened — for RBAC owner):** the orchestrator's example perm `gst.returns.read` does not exist in `auth.permission`. Closest analogues used: reads → `gst.itc.reconcile` (IMS *is* the ITC-matching system, so the reconcile audience is the natural read audience); writes → `gst.returns.file` (closest GST submit/write audience). If product intent differs — e.g. IMS read should reach a broader staff audience, or `gst.ims.sync` should be admin-only — that is a separate RBAC decision and a follow-up grant.

#### Backend handoff (074)

- Backing tables + RLS + permissions now exist; backend can **un-Skip `ImsEfSmokeTests`** (db-engineer changed no tests, per scope).
- `acted_by` / `actioned_by` are app-populated (no DB GUC). If statutory attribution of IMS actions to a user is required, the backend should set those from the authenticated identity at write time.

#### Verification summary (074)

- Full chain `000…074` replays clean on a scratch DB; applied to live `snapaccount` under `ON_ERROR_STOP=1`; idempotent on back-to-back re-run.
- EF parity verified: all 51 columns across the 3 tables match the EF configs (names, lengths, numeric/jsonb/uuid types, audit cols); `ims_action_logs` correctly has no `updated_at`/`deleted_at`; all index names match `HasDatabaseName`; unique partial index carries `WHERE deleted_at IS NULL`.
- RLS enabled with one org-isolation policy per table (house style). Append-only enforced: INSERT into `ims_action_logs` succeeds; `UPDATE`/`DELETE`/`TRUNCATE` raise `restrict_violation`. The single verification row was removed by dropping + re-applying the (brand-new, otherwise-empty) table via the migration — the immutability control was never disabled.
- 5 permissions present (`resource_type_id` set, `action_type_id` NULL); grants match the mirror table above.

## Phase 7a — AiService RAG chunks/embeddings + AI interaction audit (`075`, 2026-06-11)

Migration **`075_ai_chunks_embeddings_interactions.sql`** lands the three AiService P7a tables (RAG ingestion store + per-call usage/audit log). Shape reconstructed column-for-column from the EF configs (`AiChunkConfiguration`, `AiEmbeddingConfiguration`, `AiInteractionConfiguration`) — same method as 074.

- **`ai.chunks`** — RAG document chunks. `embedding_provider VARCHAR(32)`, `embedding_model VARCHAR(64)`, `page_number` nullable (`int?`), audit cols (`created_by`/`updated_by` are `TEXT` — the EF config sets no `HasMaxLength` on these `string?` props). Indexes `ix_ai_chunks_document_id`, `ix_ai_chunks_organization_id`, and **unique** `uix_ai_chunks_document_index (document_id, chunk_index)`.
- **`ai.embeddings`** — 1:1 with `ai.chunks` via `chunk_id REFERENCES ai.chunks(id) ON DELETE CASCADE`. **`float_vector FLOAT4[]` NOT NULL** for P7a. No audit columns (the EF config maps none). Indexes `ix_ai_embeddings_org_id`, `ix_ai_embeddings_chunk_id`.
- **`ai.interactions`** — **APPEND-ONLY** AI usage/audit log. `organization_id` is **nullable** (`AiInteraction.OrganizationId` is `Guid?`); `user_id VARCHAR(128)`, `feature_code VARCHAR(64)`, `provider VARCHAR(32)`, `model VARCHAR(64)`, token/latency ints, `budget_exceeded bool`. Immutable via the `accounting.edit_log` (071) pattern — `ai.reject_interaction_mutation()` rejects `UPDATE`/`DELETE`/`TRUNCATE` for all roles incl. the owner, plus `REVOKE … FROM PUBLIC` (+ `snapaccount_app`). Indexes `ix_ai_interactions_org_id`, `ix_ai_interactions_created_at`, `ix_ai_interactions_org_feature_date (organization_id, feature_code, created_at)`.

**Vector storage — FLOAT4[] in P7a, pgvector deferred to P7b.** pgvector **is already enabled** in this DB (extension `vector` 0.8.2; HNSW used elsewhere), but P7a keeps `FLOAT4[]` per the P7a/EF compatibility decision (the EF column maps `float4[]`; `Pgvector.EntityFrameworkCore` is a P7b concern). The extension is ready for the P7b upgrade. Migration 075 carries an indicative **P7b upgrade DDL block** (commented, not run): add a `vector(768)` column, backfill from `float_vector`, add an HNSW `vector_cosine_ops` index, then deprecate/drop `float_vector` in a later migration. Dimension 768 matches the P7a embedding model (confirm against the live model before applying).

**RLS — house style** (orchestrator instruction; not the handoff's `app.current_org_id` sketch, which references a GUC that does not exist). All three tables use the org-membership subquery keyed on `current_setting('app.current_user_id', TRUE)::uuid`, consistent with `gst.*` (074) and `accounting.*`.

#### Backend handoff (075)

- Tables + RLS + append-only enforcement now exist; AiService P7a ingestion/audit write paths can rely on them.
- P7b owner: when wiring `Pgvector.EntityFrameworkCore`, use the upgrade DDL block in 075; the float→vector backfill is in-place and additive.

#### Verification summary (075)

- Full chain `000…075` replays clean on a scratch DB; applied to live `snapaccount` under `ON_ERROR_STOP=1`; idempotent on back-to-back re-run.
- **EF parity verified column-by-column** (33 columns across 3 tables): names, `VARCHAR` lengths (32/64/128), `int4`/`bool`/`timestamptz`/`uuid` types, `float4[]` for the vector, `created_by`/`updated_by` as `TEXT`. Nullability matches the entities exactly — `ai.interactions.organization_id` nullable, `ai.chunks.page_number` nullable; `ai.embeddings` has no audit columns. All index names match `HasDatabaseName`; `ai.embeddings.chunk_id` FK is `ON DELETE CASCADE`.
- RLS enabled with one org-isolation policy per table (house style). Append-only enforced on `ai.interactions` (verified on the scratch DB per the 074 lesson — no test data written to live): INSERT succeeds; `UPDATE`/`DELETE`/`TRUNCATE` raise `restrict_violation`. FK cascade verified (deleting a chunk removes its embedding).

## Phase 7 — `accounting.editlog.read` permission seed (data-only, `076`, 2026-06-11)

Migration **`076_auth_seed_accounting_editlog_read_permission.sql`** seeds the RBAC permission behind AccountingService's auditor edit-log read endpoints (`[RequiresPermission("accounting.editlog.read")]` — the FY export over `accounting.edit_log` from 071). `auth.permission` had no such row, so `PermissionBehavior` (resolves by NAME) let only the wildcard SUPER_ADMIN through; every other role 403'd.

- **Permission seeded:** `name='accounting.editlog.read'`, `resource='accounting'`, `action='editlog.read'` — matching the live `accounting.*` convention. Idempotent via `ON CONFLICT (name) DO NOTHING`.
- **Type backfill:** `resource_type_id` set from `auth.resource_type` where `key='accounting'`. `action_type_id` left NULL — no `action_type` with key `editlog.read` exists; not invented (consistent with 070/074).
- **Grants (mirror):** granted to every role holding `accounting.journal.review` — the closest existing accounting read/inspection audience (the review permission, which also includes REVIEWER) — resolved by join, self-adjusting. Live audience = **accounts_clerk, CA, ORG_ADMIN, REVIEWER, SUPER_ADMIN** (set-difference both ways vs `accounting.journal.review` = empty, i.e. exact parity).

**Audience note (flagged, NOT narrowed/widened):** the auditor edit-log read now reaches the same audience as journal review, including the non-admin `accounts_clerk` + `REVIEWER`. If the statutory edit-log export should be restricted to a narrower set (e.g. CA / external auditor only) or broadened, that is a separate RBAC decision and a follow-up grant — 076 stays within the explicit "mirror the closest accounting read audience" scope.

#### Verification summary (076)

- Full chain `000…076` replays clean on a scratch DB; applied to live `snapaccount` under `ON_ERROR_STOP=1` (`INSERT 0 1`, `UPDATE 1`, `INSERT 0 5`); idempotent re-run — all zeros.
- Confirmed: permission present (`resource_type_id` set, `action_type_id` NULL); non-admin roles **accounts_clerk** and **REVIEWER** now hold `accounting.editlog.read`; grant audience matches `accounting.journal.review` exactly.

---

## Local dev seed — the two seed mechanisms and apply order (GAP-072, Wave 6, 2026-06-11)

A fresh developer environment is seeded by **two independent mechanisms**. Confusing them is the source of most "why is my local DB empty / orphaned" reports.

### 1. LOCAL_AUTH logins — backend runtime seed (NOT SQL)
The canonical local logins are seeded **at AuthService startup** by `LocalAuthService.EnsureDevAdminAsync` (only when `LOCAL_AUTH=true`), *not* by any file in `database/`. Do **not** add these to SQL — doing so would race/conflict with the backend seeder.

| Login | Password | Role / perms | Org |
|---|---|---|---|
| `admin@snapaccount.local`   | `Admin@12345`   | `SUPER_ADMIN`, wildcard `*` (in-code, no DB row) | dev org `11111111-1111-1111-1111-111111111111` |
| `manager@snapaccount.local` | `Manager@12345` | `DEV_LIMITED_MANAGER`, 7 perms (`org.roles.read/create/update`, `org.permissions.read/grant`, `gst.returns.file`, `document.read`) | same dev org |

All 7 manager permissions and the `SUPER_ADMIN` role already exist in the migrated schema (`036` + later seeds), so the runtime seeder finds them. The dev org `11111111-…` is created by the backend seeder, **not** by `100_dev_users.sql`.

### 2. Business data — SQL dev seed (`database/dev-seed/`)
Realistic cross-service business data for the admin/mobile UIs lives in `database/dev-seed/`, seeded under a **separate** anchor org/owner so it does not collide with the LOCAL_AUTH dev org:

| File | Seeds | Anchors |
|---|---|---|
| `100_dev_users.sql` | 3 `.dev` users + Acme org + owner membership | user `33333333-…`, org `44444444-…` (Acme Trading Co.) |
| `200_dev_business_data.sql` | loans, GST invoices+ITC (with an intentional ITC mismatch), ITR assessee/filing/grievance, a pending callback, an active subscription, accounting/notification rows | references org `44444444-…`, owner `33333333-…` |

**Apply order:** `…migrations 000→077` → `999_seed_reference_data.sql` → `100_dev_users.sql` → `200_dev_business_data.sql`. All four steps are idempotent (`ON CONFLICT DO NOTHING`); re-running converges to the same state with no duplicate rows.

### Why the cross-service rows are *by value*, not FK
`loan.applications.org_id`, `gst.gst_invoice.organization_id`, `itr.filings.user_id`, `subscription.subscription.organization_id`, etc. reference `auth.organization` / `auth."user"` **by value with no FK constraint** (schema-per-service isolation). A missing anchor therefore inserts **silently orphaned** rows that no API can resolve — there is no constraint to catch it.

### GAP-072 reconciliation (what changed)
- The dev-seed SQL was **column-correct** against the `000→077` migrated schema (no column drift). The real drift was **wiring/ordering robustness**:
  - `200_dev_business_data.sql` now contains a **self-sufficiency guard** that ensures the org/owner/membership anchors exist (mirroring `100_dev_users.sql`) before the business-data inserts. So the file works **standalone** — e.g. when CI's migration-replay applies only the dev seed — *and* chained after `100`, both idempotently. This eliminates the silent-orphan failure mode.
  - Removed a stray `COMMIT;` (no matching `BEGIN`) at the tail of `999_seed_reference_data.sql` that emitted a harmless `there is no transaction in progress` WARNING on every replay.
- **Still owed by devops-engineer** (outside `database/` ownership — flagged to orchestrator):
  - `.github/workflows/ci.yml` migration-replay job references `database/migrations/200_dev_business_data.sql`, but the file lives at `database/dev-seed/200_dev_business_data.sql`; the `[ -f … ]` guard therefore never finds it and the seed is silently skipped (the GAP-072 warning text never even fires). Point CI at `database/dev-seed/100_dev_users.sql` then `…/200_dev_business_data.sql`, and (now that `200` is self-sufficient) flip `|| true` to strict `ON_ERROR_STOP` so seed drift fails the job.
  - `docker-compose.override.yml` mounts `./database/dev-seed` into a **subdirectory** of `/docker-entrypoint-initdb.d` (`/seed`); the Postgres entrypoint only runs files in the top level of that dir, so the dev seed never auto-applies in the docker path. Mount the files at top level (they sort `100_` before `200_`, after the `00_` extensions script).

### Fresh-setup verification (2026-06-11, PG18 scratch DB + pgvector)
- Full chain `000→077` replays clean on a brand-new DB under `ON_ERROR_STOP=1`.
- `999` applies with **zero** warnings (stray COMMIT removed).
- `200` applied **standalone** (no `100`): RC=0, anchors auto-created, every business row resolves to org `44444444-…` / owner `33333333-…` — no orphans.
- Canonical chained flow `999 → 100 → 200`, then a full **double re-run** of `100`+`200`: all RC=0, row counts stable (orgs=1, members=1, partner_banks=2, applications=1, subscriptions=1) — idempotent.
