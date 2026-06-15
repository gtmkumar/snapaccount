-- =============================================================================
-- 068_itr_subscription_invoice_dpdp_anonymization.sql
-- Phase 7 sweep. Closes the EF<->SQL divergence behind the live 500
--   42703: column f.anonymization_reason does not exist
-- on the ITR admin listing (and the equivalent on the assessee and invoice
-- read paths).
--
-- Three entities map DPDP Act 2023 erasure metadata that their backing tables
-- lack:
--
--   (A) itr.filings            — ITR filing record (Filing entity). The admin
--                                listing query selects f.anonymization_reason.
--   (B) itr.assessee_profiles  — assessee/taxpayer PII (Assessee entity).
--   (C) subscription.subscription_invoice — invoice (Invoice entity). Also
--                                lacks razorpay_order_id; the table has only
--                                razorpay_invoice_id (mapped to RazorpayPaymentId)
--                                while the entity additionally exposes
--                                RazorpayOrderId, which currently has no column.
--
-- DPDP pair added to (A)(B)(C): anonymization_reason VARCHAR(200) + anonymized_at
-- TIMESTAMPTZ. Records WHY and WHEN a row's PII was anonymized during a
-- right-to-erasure request, without hard-deleting the row (7-year retention vs
-- DPDP erasure reconciliation). razorpay_order_id VARCHAR(100) added to (C) so
-- the Razorpay payment order id can be persisted alongside the invoice id.
--
-- ADDITIVE only. No column is renamed, dropped, or re-typed. Re-runnable: every
-- statement is guarded with ADD COLUMN IF NOT EXISTS. Verified by a second
-- back-to-back apply under ON_ERROR_STOP=1.
--
-- Conventions: matches 060-067 (idempotent guards, COMMENT ON, TIMESTAMPTZ,
-- snake_case). No EF migration exists for ItrService or SubscriptionService —
-- this SQL file is canonical (see 064, 067). Mirrors the DPDP pair shape added
-- to subscription.subscription in 067 and to chat/callback/loan tables earlier.
--
-- Depends on: itr.filings + itr.assessee_profiles (ITR schema) and
--             subscription.subscription_invoice (037_subscription_schema.sql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (A) itr.filings — DPDP erasure metadata
-- -----------------------------------------------------------------------------
ALTER TABLE itr.filings
    ADD COLUMN IF NOT EXISTS anonymization_reason VARCHAR(200),
    ADD COLUMN IF NOT EXISTS anonymized_at        TIMESTAMPTZ;

COMMENT ON COLUMN itr.filings.anonymization_reason IS
    'DPDP Act 2023 erasure metadata: free-text reason the filing PII was anonymized (e.g. data-principal erasure request id). NULL = not anonymized. Added in migration 068.';
COMMENT ON COLUMN itr.filings.anonymized_at IS
    'DPDP Act 2023 erasure metadata: timestamp the filing PII was anonymized. The filing/audit row is retained (7-year retention) but its PII fields are scrubbed. NULL = not anonymized. Added in migration 068.';

-- -----------------------------------------------------------------------------
-- (B) itr.assessee_profiles — DPDP erasure metadata
-- -----------------------------------------------------------------------------
ALTER TABLE itr.assessee_profiles
    ADD COLUMN IF NOT EXISTS anonymization_reason VARCHAR(200),
    ADD COLUMN IF NOT EXISTS anonymized_at        TIMESTAMPTZ;

COMMENT ON COLUMN itr.assessee_profiles.anonymization_reason IS
    'DPDP Act 2023 erasure metadata: free-text reason the assessee PII was anonymized (e.g. data-principal erasure request id). NULL = not anonymized. Added in migration 068.';
COMMENT ON COLUMN itr.assessee_profiles.anonymized_at IS
    'DPDP Act 2023 erasure metadata: timestamp the assessee PII was anonymized. The assessee row is retained (7-year retention) but its PII fields are scrubbed. NULL = not anonymized. Added in migration 068.';

-- -----------------------------------------------------------------------------
-- (C) subscription.subscription_invoice — DPDP erasure metadata + razorpay_order_id
-- -----------------------------------------------------------------------------
ALTER TABLE subscription.subscription_invoice
    ADD COLUMN IF NOT EXISTS anonymization_reason VARCHAR(200),
    ADD COLUMN IF NOT EXISTS anonymized_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS razorpay_order_id    VARCHAR(100);

COMMENT ON COLUMN subscription.subscription_invoice.anonymization_reason IS
    'DPDP Act 2023 erasure metadata: free-text reason the invoice PII was anonymized (e.g. data-principal erasure request id). NULL = not anonymized. Added in migration 068.';
COMMENT ON COLUMN subscription.subscription_invoice.anonymized_at IS
    'DPDP Act 2023 erasure metadata: timestamp the invoice PII was anonymized. The billing/audit row is retained (7-year retention) but its PII fields are scrubbed. NULL = not anonymized. Added in migration 068.';
COMMENT ON COLUMN subscription.subscription_invoice.razorpay_order_id IS
    'Razorpay payment order id (order_xxx) for this invoice. Distinct from razorpay_invoice_id (mapped to Invoice.RazorpayPaymentId). NULL until a Razorpay order is created. Added in migration 068.';

-- =============================================================================
-- End 068_itr_subscription_invoice_dpdp_anonymization.sql
-- =============================================================================
