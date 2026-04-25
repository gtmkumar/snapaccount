-- =============================================================================
-- V2__audit_log_immutability.sql
-- SEC-010: Enforce audit log immutability at PostgreSQL level
-- Depends on: 012_shared_schema.sql (shared.audit_log must exist)
-- =============================================================================
-- This rule prevents DELETE operations on the audit log table.
-- The INSTEAD NOTHING means the DELETE silently does nothing.
-- Combined with Cloud SQL point-in-time recovery, this provides a two-layer immutable audit trail.

CREATE OR REPLACE RULE no_delete_audit_log
    AS ON DELETE TO shared.audit_log
    DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_update_audit_log
    AS ON UPDATE TO shared.audit_log
    DO INSTEAD NOTHING;

COMMENT ON RULE no_delete_audit_log ON shared.audit_log IS
    'SEC-010: Prevents deletion of audit log records. Audit log is APPEND-ONLY. Required for ICAI CA audit compliance.';
COMMENT ON RULE no_update_audit_log ON shared.audit_log IS
    'SEC-010: Prevents modification of audit log records. Combined with RLS and Cloud SQL PITR for two-layer immutability.';
