-- =============================================================================
-- 054_callback_ef_alignment.sql
-- CallbackService — align the callback.callbacks table with the EF Core
-- `Callback` entity. ADDITIVE migration. Extends 018_callback_schema.sql.
-- Does NOT rename or drop any existing column. Idempotent / re-runnable.
--
-- Context: CallbackService has NO EF migrations — 018_callback_schema.sql is the
-- canonical schema. The EF entity carries several scalar properties that either
--   (a) had no column at all, or
--   (b) only existed in the canonical table as an incompatible tstzrange.
-- The EF column-name mappings for columns that DO exist (org_id, assigned_to,
-- reason_text, body, visibility, ...) were corrected in the entity configurations;
-- this migration only ADDS the genuinely-missing scalar columns.
--
-- Columns added to callback.callbacks (all nullable, except reschedule_count which
-- gets a NOT NULL DEFAULT 0 so existing rows and default inserts are valid):
--   - preferred_window_start  TIMESTAMPTZ   (entity scalar; canonical table only
--                                            had the tstzrange `preferred_window`)
--   - preferred_window_end    TIMESTAMPTZ   (entity scalar; pairs with the above)
--   - scheduled_at_ts         TIMESTAMPTZ   (entity scalar; canonical `scheduled_at`
--                                            is a tstzrange and is left untouched)
--   - resolution_summary      VARCHAR(2000) (agent's post-call summary)
--   - phone_number            VARCHAR(15)   (added NULLABLE — the entity marks it
--                                            required, but a NOT NULL column cannot
--                                            be added to a possibly-populated table
--                                            without a default; required-ness is
--                                            enforced at the application/validator
--                                            layer instead)
--   - escalation_reason       VARCHAR(500)  (reason captured on escalation)
--   - reschedule_count        INTEGER       (NOT NULL DEFAULT 0)
--
-- The legacy `preferred_window` and `scheduled_at` (tstzrange) columns are
-- intentionally preserved untouched.
-- =============================================================================

ALTER TABLE callback.callbacks
    ADD COLUMN IF NOT EXISTS preferred_window_start TIMESTAMPTZ;

ALTER TABLE callback.callbacks
    ADD COLUMN IF NOT EXISTS preferred_window_end TIMESTAMPTZ;

ALTER TABLE callback.callbacks
    ADD COLUMN IF NOT EXISTS scheduled_at_ts TIMESTAMPTZ;

ALTER TABLE callback.callbacks
    ADD COLUMN IF NOT EXISTS resolution_summary VARCHAR(2000);

ALTER TABLE callback.callbacks
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(15);

ALTER TABLE callback.callbacks
    ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(500);

ALTER TABLE callback.callbacks
    ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;
