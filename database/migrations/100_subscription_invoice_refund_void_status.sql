-- =============================================================================
-- Migration 100: Extend subscription.subscription_invoice for refund/void
-- DG-SUB-11: Add PENDING/FAILED/REFUNDED status values + refund/void tracking columns.
-- DG-SUB-07: storage_path already exists (migration 010); no change needed for PDF URI.
-- =============================================================================

BEGIN;

-- ── 1. Drop the existing CHECK constraint on status ─────────────────────────
-- The original constraint only allowed 'DRAFT','SENT','PAID','VOID','UNCOLLECTIBLE'.
-- The domain now uses PENDING/FAILED/REFUNDED/VOID + PAID status values.
ALTER TABLE subscription.subscription_invoice
    DROP CONSTRAINT IF EXISTS subscription_invoice_status_check;

-- ── 2. Re-add the constraint with the full set of valid domain statuses ──────
ALTER TABLE subscription.subscription_invoice
    ADD CONSTRAINT subscription_invoice_status_check
    CHECK (status IN (
        'DRAFT',          -- legacy / initial state
        'SENT',           -- invoice sent to customer (legacy)
        'PENDING',        -- generated but not yet paid
        'PAID',           -- payment confirmed
        'FAILED',         -- payment attempt failed
        'REFUNDED',       -- invoice was refunded (DG-SUB-11)
        'VOID',           -- invoice voided (DG-SUB-11)
        'UNCOLLECTIBLE'   -- legacy
    ));

-- ── 3. Add refund/void tracking columns ─────────────────────────────────────
-- These support the DG-SUB-11 RefundInvoice and VoidInvoice commands.
ALTER TABLE subscription.subscription_invoice
    ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_reason VARCHAR(500),
    ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ;

-- ── 4. Index for auditing refunded invoices ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sub_invoice_refunded_at
    ON subscription.subscription_invoice (refunded_at)
    WHERE refunded_at IS NOT NULL;

-- ── 5. Seed new permissions for DG-SUB-08, DG-SUB-11 ──────────────────────
-- subscription.read  — view subscription and proration preview (org members)
-- subscription.manage — platform-admin actions (pause/resume/refund/void)
INSERT INTO auth.permission (id, name, resource, action, description)
VALUES
    (gen_random_uuid(), 'subscription.read',   'subscription', 'read',   'View subscription details and proration previews'),
    (gen_random_uuid(), 'subscription.manage', 'subscription', 'manage', 'Platform-admin: pause/resume subscriptions and refund/void invoices')
ON CONFLICT (name) DO NOTHING;

COMMIT;
