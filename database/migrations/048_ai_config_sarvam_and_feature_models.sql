-- =============================================================================
-- 048_ai_config_sarvam_and_feature_models.sql
-- Persist the two remaining "UI-only" controls on the admin AI Model panel:
--   - sarvam_languages : Indian languages enabled for Sarvam AI processing (jsonb array)
--   - feature_models   : per-feature model/temperature overrides (jsonb object keyed by
--                        feature name → { "Model": "...", "Temperature": 0.3 })
-- Both columns live on the existing singleton auth.ai_configuration row (047).
-- ADDITIVE, idempotent.
-- =============================================================================

ALTER TABLE auth.ai_configuration
    ADD COLUMN IF NOT EXISTS sarvam_languages jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE auth.ai_configuration
    ADD COLUMN IF NOT EXISTS feature_models jsonb NOT NULL DEFAULT '{}'::jsonb;
