# Auth — 2FA, Password Reset & KYC tables

Additive auth-schema tables introduced by migrations **050 / 051 / 052**. All are
schema-qualified under `auth.*`, use UUID PKs (`gen_random_uuid()`), carry the
standard soft-delete audit columns (`created_at` / `updated_at` / `deleted_at`,
plus `created_by` / `updated_by`), have an `updated_at` trigger
(`shared.set_updated_at`), and have RLS enabled with per-user isolation on
`app.current_user_id` (mirroring the `auth.refresh_token` policy in 001).

| Migration | Table | Purpose |
|-----------|-------|---------|
| `050_auth_user_totp.sql` | `auth.user_totp` | TOTP 2FA enrollment, one row per user |
| `051_auth_password_reset_token.sql` | `auth.password_reset_token` | Time-boxed, single-use password reset tokens |
| `052_auth_kyc_verification.sql` | `auth.kyc_verification` | PAN / Aadhaar KYC verification records |
| `053_auth_kyc_gov_verification_toggle.sql` | `auth.organization`, `auth.kyc_verification` | Per-org gov-verification toggle; extends KYC kinds/status; upsert unique index |

## `auth.user_totp`

One TOTP secret per user (`user_id` is **UNIQUE**, FK → `auth.user` ON DELETE CASCADE).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL UNIQUE | FK → `auth.user(id)` ON DELETE CASCADE |
| `secret_encrypted` | text NOT NULL | TOTP shared secret — **encrypted at rest by the app layer**, never plaintext |
| `is_enabled` | boolean NOT NULL DEFAULT false | 2FA active flag |
| `confirmed_at` | timestamptz NULL | Set when user confirms the first valid code |
| `recovery_codes` | text NULL | JSON array of **hashed** one-time recovery codes |
| `created_at`/`updated_at` | timestamptz NOT NULL | audit |
| `deleted_at` | timestamptz NULL | soft delete |
| `created_by`/`updated_by` | uuid NULL | audit |

Indexes: `idx_user_totp_user_id`.

## `auth.password_reset_token`

Mirrors the shape of `auth.refresh_token`. Single-use, time-boxed reset tokens.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | FK → `auth.user(id)` ON DELETE CASCADE |
| `token_hash` | text NOT NULL UNIQUE | SHA-256 hex of the reset token — never plaintext |
| `expires_at` | timestamptz NOT NULL | token expiry |
| `used_at` | timestamptz NULL | set when the token is consumed (single-use) |
| `created_at`/`updated_at` | timestamptz NOT NULL | audit |
| `deleted_at` | timestamptz NULL | soft delete |
| `created_by`/`updated_by` | uuid NULL | audit |

Indexes: `idx_password_reset_token_user_id`, `idx_password_reset_token_token_hash`,
`idx_password_reset_token_expires_at`.

## `auth.kyc_verification`

Per-user identity verification attempts/results (PAN or Aadhaar).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | FK → `auth.user(id)` ON DELETE CASCADE |
| `kind` | text NOT NULL | CHECK IN (`'PAN'`,`'AADHAAR'`,`'GSTIN'`,`'TAN'`) — last two added in 053 |
| `reference_number` | text NOT NULL | PAN (`XXXXX9999X`) / GSTIN (15-char) / TAN, or **masked** Aadhaar (DPDP Act 2023 — no full Aadhaar in clear) |
| `status` | text NOT NULL DEFAULT `'PENDING'` | CHECK IN (`'SAVED'`,`'PENDING'`,`'VERIFIED'`,`'FAILED'`) — `'SAVED'` added in 053 |
| `provider` | text NULL | 3rd-party KYC provider name |
| `provider_ref` | text NULL | provider-side reference id |
| `verified_at` | timestamptz NULL | set when status → VERIFIED |
| `created_at`/`updated_at` | timestamptz NOT NULL | audit |
| `deleted_at` | timestamptz NULL | soft delete |
| `created_by`/`updated_by` | uuid NULL | audit |

Indexes: `idx_kyc_verification_user_id`, `idx_kyc_verification_user_id_kind`,
`idx_kyc_verification_status` (partial: `WHERE deleted_at IS NULL`).

## Migration 053 — gov-verification toggle + extended KYC kinds/status

`053_auth_kyc_gov_verification_toggle.sql` is additive over 052. It introduces:

1. **`auth.organization.government_verification_enabled`** — `boolean NOT NULL DEFAULT false`.
   Per-org switch. When **OFF**, a KYC number can be stored unverified with
   status `'SAVED'`; when **ON**, the number flows through the
   `PENDING → VERIFIED / FAILED` provider lifecycle.

2. **Extended `auth.kyc_verification` CHECK constraints** (dropped + recreated):
   - `kind` now allows `PAN`, `AADHAAR`, **`GSTIN`**, **`TAN`**.
   - `status` now allows **`SAVED`**, `PENDING`, `VERIFIED`, `FAILED`.

3. **`ux_kyc_verification_user_kind`** — partial **unique** index on
   `(user_id, kind) WHERE deleted_at IS NULL`. Guarantees at most one active
   record per user per document kind, enabling upsert. Before creating it, the
   migration defensively soft-deletes any pre-existing active duplicates
   (keeping the most-recently-created row per `(user_id, kind)` group); on the
   live DB this affected 0 rows.

## Idempotency

All migrations use `CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DROP CONSTRAINT IF EXISTS` → `ADD CONSTRAINT`, and `DROP TRIGGER/POLICY IF EXISTS`
→ `CREATE` guards, so they are safe to re-run.
Applied cleanly to the local `snapaccount` DB (verified re-run, no errors).
