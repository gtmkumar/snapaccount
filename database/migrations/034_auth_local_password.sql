-- Migration 034: local-auth password hash on auth.user
-- Additive, idempotent. Supports LOCAL_AUTH dev login (username/password against
-- the local DB) so Firebase is not required for local development.
-- password_hash is NULL for Firebase-authenticated users and never used in prod.

ALTER TABLE auth."user"
    ADD COLUMN IF NOT EXISTS password_hash TEXT;
