-- =============================================================================
-- V3__audit_log_partition_automation.sql
-- SEC-019: Automated audit log partition creation
-- Depends on: 012_shared_schema.sql (shared.audit_log must exist)
-- =============================================================================
-- Creates monthly partitions for shared.audit_log up to 12 months in advance.
-- This function should be called by Cloud Scheduler monthly.

CREATE OR REPLACE FUNCTION shared.create_audit_log_partitions(months_ahead INTEGER DEFAULT 12)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_range TEXT;
    end_range TEXT;
BEGIN
    FOR i IN 0..months_ahead LOOP
        partition_date := date_trunc('month', CURRENT_DATE + (i || ' months')::INTERVAL);
        partition_name := 'audit_log_' || to_char(partition_date, 'YYYY_MM');
        start_range := to_char(partition_date, 'YYYY-MM-DD');
        end_range := to_char(partition_date + INTERVAL '1 month', 'YYYY-MM-DD');

        -- Only create if it doesn't already exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'shared' AND c.relname = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE shared.%I PARTITION OF shared.audit_log
                 FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_range, end_range
            );
            RAISE NOTICE 'Created partition: shared.%', partition_name;
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION shared.create_audit_log_partitions IS
    'SEC-019: Creates monthly audit_log partitions up to N months in advance. Call via Cloud Scheduler on the 1st of each month.';

-- Create partitions for the next 12 months immediately
SELECT shared.create_audit_log_partitions(12);
