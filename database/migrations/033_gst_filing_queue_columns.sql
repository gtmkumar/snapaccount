-- Migration 033: GST filing queue columns on gst.gst_return
-- Additive, idempotent — safe to re-run.

ALTER TABLE gst.gst_return
    ADD COLUMN IF NOT EXISTS business_name_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS assigned_ca_user_id    UUID REFERENCES auth."user"(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sla_expires_at          TIMESTAMPTZ;

-- Partial index for queue query: order by SLA, filter active rows only.
CREATE INDEX IF NOT EXISTS ix_gst_return_queue
    ON gst.gst_return (sla_expires_at, status)
    WHERE deleted_at IS NULL;
