-- =============================================================================
-- 091_partition_retention.sql
-- GAP-113: retention drop for month-partitioned tables (pairs with migration 090)
--
-- Creates:
--   public.drop_old_partitions(schema, table, retain_months)
--       — drops monthly partitions whose entire month range is older than the
--         retention window. The DEFAULT partition is never matched (it has no
--         _YYYY_MM suffix), and each drop is wrapped so a partition that still has
--         dependent rows (e.g. a foreign key from a related table) is skipped with a
--         NOTICE instead of aborting the whole run.
--
-- SAFETY / CAVEATS — read before enabling (PartitionMaintenance:RetentionEnabled):
--   * This DROPS data. It is OFF by default; the monthly PartitionMaintenanceSubscriber
--     only calls it when PartitionMaintenance:RetentionEnabled = true.
--   * document.document already has an archive/purge path (DocumentArchive +
--     retention_until + GCS lifecycle) and is referenced by FKs (ocr_result,
--     document_page, …). Those FKs will BLOCK a partition drop while referenced rows
--     exist — the function catches that and skips the partition (safe), but it means
--     partition-drop retention for document.document must be reconciled with the
--     archive/purge flow before enabling. notification.notification is the natural
--     candidate (transient; notification_log references it by value, no enforced FK).
--   * Default retain window is 84 months (7-year financial-retention floor, DPDP/MCA).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.drop_old_partitions(
    p_schema        text,
    p_table         text,
    p_retain_months int DEFAULT 84
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_dropped  integer := 0;
    v_cutoff   date := (date_trunc('month', now()) - make_interval(months => p_retain_months))::date;
    v_child    text;
    v_part_end date;
BEGIN
    IF to_regclass(format('%I.%I', p_schema, p_table)) IS NULL THEN
        RAISE NOTICE 'drop_old_partitions: %.% does not exist — skipping', p_schema, p_table;
        RETURN 0;
    END IF;

    FOR v_child IN
        SELECT c.relname
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        JOIN pg_namespace n ON n.oid = p.relnamespace
        WHERE p.relname = p_table
          AND n.nspname = p_schema
          AND c.relkind = 'r'
          AND c.relname ~ ('^' || p_table || '_[0-9]{4}_[0-9]{2}$')  -- skips the DEFAULT partition
    LOOP
        -- Month range end = first day of the month AFTER this partition's month.
        v_part_end := (to_date(replace(right(v_child, 7), '_', '-'), 'YYYY-MM') + interval '1 month')::date;

        -- Only drop partitions whose entire month range is older than the retention cutoff.
        IF v_part_end <= v_cutoff THEN
            BEGIN
                EXECUTE format('DROP TABLE %I.%I', p_schema, v_child);
                v_dropped := v_dropped + 1;
                RAISE NOTICE 'drop_old_partitions: dropped %.% (before %)', p_schema, v_child, v_cutoff;
            EXCEPTION WHEN others THEN
                -- e.g. dependent FK rows still reference this partition — skip, never abort.
                RAISE NOTICE 'drop_old_partitions: could NOT drop %.% (kept): %', p_schema, v_child, SQLERRM;
            END;
        END IF;
    END LOOP;

    RETURN v_dropped;
END;
$$;

COMMENT ON FUNCTION public.drop_old_partitions(text, text, int) IS
    'GAP-113: drops monthly partitions older than retain_months for a month-RANGE-partitioned table. Never touches the DEFAULT partition; skips partitions with dependent FK rows. DESTRUCTIVE — gated behind PartitionMaintenance:RetentionEnabled (default off).';
