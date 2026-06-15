# Phase 7 Tasks — db-engineer

> Ownership: `database/`, `docs/database/`. All migrations additive. Reference: `.claude/orchestrator/gap-analysis-2026-06-10.md`.

## HIGH priority

### DB1 — NotificationService schema reconciliation (GAP-070, with backend B10)
- Review/author the migration aligning `notification.*` column names with the new snake_case entity configs; ensure seed data applies cleanly on an empty DB.

## MEDIUM priority

### DB2 — Additive schemas for Phase 7 features
- `chat.appointments`, `chat.appointment_slots`, `chat.ca_profiles`, `chat.ca_ratings` (GAP-031, backend B18).
- `notification.notification_templates` (event × channel × language, variables) (GAP-037, B14).
- `subscription.usage_records` (metering) (GAP-034, B9).
- `document.document_tags`, `document.document_shares`, `document.ocr_feedback`, SLA config columns (GAP-013/014/015, B15).
- `loan.key_facts_statements` (immutable, signed payload hash) + cooling-off columns (GAP-021, B8).
- `auth.user_consents` (purpose-coded, versioned, withdrawn_at, audit metadata) (GAP-020, B7).
- Standards: UUID PKs, snake_case, created/updated/deleted_at, FK indexes, RLS on user-owned tables.

### DB3 — Platform audit-log sink (GAP-024, B21)
- `shared.audit_log` append-only, partitioned by month (7-year retention), indexed on (org_id, entity, occurred_at); RLS; no UPDATE/DELETE grants to app role.

### DB4 — Dev seed drift fix (GAP-072)
- Reconcile `database/dev-seed/200_dev_business_data.sql` with current schema (e.g. `loan.partner_banks` column names); verify against the CI migration-replay job (devops D4).

### DB5 — AI schema enablement (GAP-030, B13)
- Finish `ai` schema tables for embeddings/sessions with pgvector columns + HNSW indexes; confirm `docs/database/schema-overview.md` updated.

## Notes / open ack items
- SEC-035: define or remove the `snapaccount_admin` BYPASSRLS role referenced in earlier migrations (P6-HANDOFF-06).
- Migrations 042–045 must be applied to staging/prod at next deploy (HANDOFF.md).
- Sweep `bug-log.md` P6-HANDOFF-01..33 db ack items: mark each verified-in-schema or reopen.
