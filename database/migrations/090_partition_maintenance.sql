-- =============================================================================
-- 090_partition_maintenance.sql
-- GAP-113: monthly-partition maintenance for time-partitioned tables
--
-- Creates:
--   public.create_monthly_partitions(schema, table, months_ahead)
--       — idempotent helper that creates upcoming monthly RANGE partitions for a
--         month-partitioned table, so rows land in proper per-month partitions
--         rather than piling into the catch-all DEFAULT partition.
--   document.document_2027_01 .. _2027_12          (ahead-of-time partitions)
--   notification.notification_2027_01 .. _2027_12
--
-- Background: document.document (migration 002) and notification.notification
-- (migration 008) are RANGE-partitioned by month and EACH already has a DEFAULT
-- partition, so inserts never hard-fail. But the seeded partitions stop at
-- 2026-12 and migration 002's own comment promised a scheduled job that was
-- never built. Without it, every row after 2026-12 lands in the single default
-- partition, which (a) defeats partition pruning and month-granular retention
-- drops, and (b) eventually BLOCKS adding a proper partition for that month —
-- Postgres refuses to split a default partition that already holds matching rows.
--
-- This migration installs the maintenance function and pre-creates all of 2027
-- deterministically. A monthly scheduled job must then call the function to stay
-- ahead of the data (see docs/devops/recurring-jobs-decision.md):
--     SELECT public.create_monthly_partitions('document', 'document', 6);
--     SELECT public.create_monthly_partitions('notification', 'notification', 6);
-- Retention (7-year DPDP/MCA window) is handled separately by a detach+drop job.
-- =============================================================================

-- ── Maintenance function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_monthly_partitions(
    p_schema       text,
    p_table        text,
    p_months_ahead int DEFAULT 3
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_created     integer := 0;
    v_month_start date := date_trunc('month', now())::date;
    v_from        date;
    v_to          date;
    v_part        text;
    i             integer;
BEGIN
    IF to_regclass(format('%I.%I', p_schema, p_table)) IS NULL THEN
        RAISE NOTICE 'create_monthly_partitions: %.% does not exist — skipping', p_schema, p_table;
        RETURN 0;
    END IF;

    -- Create the current month plus the next p_months_ahead months.
    FOR i IN 0..p_months_ahead LOOP
        v_from := (v_month_start + make_interval(months => i))::date;
        v_to   := (v_from + interval '1 month')::date;
        v_part := format('%s_%s', p_table, to_char(v_from, 'YYYY_MM'));

        -- Skip months that already have a partition (idempotent).
        IF to_regclass(format('%I.%I', p_schema, v_part)) IS NULL THEN
            BEGIN
                EXECUTE format(
                    'CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
                    p_schema, v_part, p_schema, p_table, v_from, v_to);
                v_created := v_created + 1;
            EXCEPTION WHEN others THEN
                -- Most likely the DEFAULT partition already holds rows for this range;
                -- log and continue so one bad month never aborts the maintenance run.
                RAISE NOTICE 'create_monthly_partitions: could not create %.% (% .. %): %',
                    p_schema, v_part, v_from, v_to, SQLERRM;
            END;
        END IF;
    END LOOP;

    RETURN v_created;
END;
$$;

COMMENT ON FUNCTION public.create_monthly_partitions(text, text, int) IS
    'GAP-113: idempotently creates the current + N upcoming monthly partitions for a month-RANGE-partitioned table. Call monthly from a scheduled job to keep ahead of the data and out of the DEFAULT partition.';

-- ── Pre-create 2027 partitions (deterministic, replay-safe via IF NOT EXISTS) ─
-- document.document (partition key: uploaded_at)
CREATE TABLE IF NOT EXISTS document.document_2027_01 PARTITION OF document.document FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS document.document_2027_02 PARTITION OF document.document FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS document.document_2027_03 PARTITION OF document.document FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS document.document_2027_04 PARTITION OF document.document FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS document.document_2027_05 PARTITION OF document.document FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS document.document_2027_06 PARTITION OF document.document FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS document.document_2027_07 PARTITION OF document.document FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE IF NOT EXISTS document.document_2027_08 PARTITION OF document.document FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE IF NOT EXISTS document.document_2027_09 PARTITION OF document.document FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE IF NOT EXISTS document.document_2027_10 PARTITION OF document.document FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE IF NOT EXISTS document.document_2027_11 PARTITION OF document.document FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE IF NOT EXISTS document.document_2027_12 PARTITION OF document.document FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- notification.notification (partition key: created_at)
CREATE TABLE IF NOT EXISTS notification.notification_2027_01 PARTITION OF notification.notification FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_02 PARTITION OF notification.notification FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_03 PARTITION OF notification.notification FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_04 PARTITION OF notification.notification FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_05 PARTITION OF notification.notification FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_06 PARTITION OF notification.notification FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_07 PARTITION OF notification.notification FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_08 PARTITION OF notification.notification FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_09 PARTITION OF notification.notification FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_10 PARTITION OF notification.notification FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_11 PARTITION OF notification.notification FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE IF NOT EXISTS notification.notification_2027_12 PARTITION OF notification.notification FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');
