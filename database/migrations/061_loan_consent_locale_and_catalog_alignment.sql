-- =============================================================================
-- 061_loan_consent_locale_and_catalog_alignment.sql
-- LoanService — align loan.consents and loan.consent_catalog with the EF Core
-- entities added by backend-agent Wave 1 (GAP-040 / P6-HANDOFF-25 / backend B6).
-- ADDITIVE migration. Extends 027_loan_documents_consents.sql and
-- 032_loan_consent_catalog.sql. Does NOT rename or drop any column. Idempotent /
-- re-runnable.
--
-- Context: backend-agent merged EF entities/configurations with NO backing SQL
-- (LoanService has no EF migrations — these SQL files are canonical). Three deltas
-- are required for EF ↔ SQL parity:
--
--   1. Consent.ConsentLocale → loan.consents.consent_locale
--      New scalar property; the column did not exist. EF config:
--      VARCHAR(10) NOT NULL DEFAULT 'en'.
--
--   2. Consent : BaseAuditableEntity → loan.consents.deleted_at
--      BaseDbContext applies a GLOBAL soft-delete query filter (deleted_at IS NULL)
--      to every BaseAuditableEntity and binds deleted_at on every INSERT/SELECT.
--      027 deliberately omitted the column, so EF reads/writes against
--      loan.consents would fail with "column deleted_at does not exist". Adding the
--      nullable column restores parity. The existing trg_consents_no_delete trigger
--      still blocks hard DELETEs — soft-delete (UPDATE deleted_at) remains allowed,
--      which is exactly what the ORM emits, so the DPDP "never hard-delete" intent
--      is preserved.
--
--   3. ConsentCatalogEntry : BaseAuditableEntity → loan.consent_catalog.updated_by
--      EF maps UpdatedBy → updated_by (snake_case convention). 032 created
--      last_modified_by instead, so EF reads/writes referencing updated_by fail.
--      Add updated_by; retain last_modified_by (marked DEPRECATED — never dropped
--      per additive-migration policy).
--
-- Seed: hi + bn locale variants of the three current consent types at version 1.4
-- so GET /loans/consents/catalog can serve Hindi/Bengali consent text (en already
-- seeded by 032). Bodies are placeholder-but-plausible legal translations —
-- ⚠ MARK FOR LEGAL REVIEW before production use.
--
-- Depends on: 027_loan_documents_consents.sql, 032_loan_consent_catalog.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. loan.consents.consent_locale  (Consent.ConsentLocale; default 'en')
-- -----------------------------------------------------------------------------
ALTER TABLE loan.consents
    ADD COLUMN IF NOT EXISTS consent_locale VARCHAR(10) NOT NULL DEFAULT 'en';

COMMENT ON COLUMN loan.consents.consent_locale IS
    'GAP-040 / P6-HANDOFF-25: BCP-47 locale of the consent text shown to the user (e.g. en, hi, bn). Ties the DPDP audit trail to the exact language version reviewed. Matches loan.consent_catalog.locale.';

-- -----------------------------------------------------------------------------
-- 2. loan.consents.deleted_at  (EF BaseAuditableEntity parity)
-- -----------------------------------------------------------------------------
ALTER TABLE loan.consents
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN loan.consents.deleted_at IS
    'Soft-delete marker required by EF BaseAuditableEntity global query filter. Hard DELETE is still blocked by trg_consents_no_delete; DPDP erasure anonymizes (sets anonymized_at) rather than deleting. Normally always NULL for consents.';

-- -----------------------------------------------------------------------------
-- 3. loan.consent_catalog.updated_by  (EF BaseAuditableEntity parity)
-- -----------------------------------------------------------------------------
ALTER TABLE loan.consent_catalog
    ADD COLUMN IF NOT EXISTS updated_by UUID NULL;

-- DEPRECATED: last_modified_by superseded by updated_by (EF audit convention),
-- deprecated in Phase-7. Retained (not dropped) per additive-migration policy.
COMMENT ON COLUMN loan.consent_catalog.last_modified_by IS
    'DEPRECATED: superseded by updated_by (EF BaseAuditableEntity convention), deprecated in Phase-7. Retained for back-compat; not written by the application layer.';

-- -----------------------------------------------------------------------------
-- 4. Seed hi + bn consent text (version 1.4) for the three current consent types.
--    en is already seeded by 032. (consent_type, text_version, locale) is UNIQUE.
--    ⚠ PLACEHOLDER TRANSLATIONS — LEGAL REVIEW REQUIRED before production.
-- -----------------------------------------------------------------------------
INSERT INTO loan.consent_catalog (consent_type, text_version, locale, body_md, effective_from)
VALUES
    -- ── Hindi (hi) ──────────────────────────────────────────────────────────
    ('CREDIT_BUREAU', '1.4', 'hi',
     'मैं SnapAccount और साझेदार बैंकों को इस ऋण आवेदन के मूल्यांकन के उद्देश्य से CIBIL/Experian/Equifax/CRIF से मेरी क्रेडिट जानकारी प्राप्त करने के लिए अधिकृत करता/करती हूँ। यह सहमति 30 दिनों के लिए मान्य है। [PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]',
     TIMESTAMPTZ '2025-04-01 00:00:00+00'),
    ('DATA_SHARE_WITH_BANK', '1.4', 'hi',
     'मैं SnapAccount द्वारा ऋण अंडरराइटिंग हेतु मेरे वित्तीय दस्तावेज़ (ITR, बैंक विवरण, GST रिटर्न) चयनित साझेदार बैंक के साथ साझा करने की सहमति देता/देती हूँ। बैंक अपनी नीति के अनुसार प्रतियाँ रख सकता है। [PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]',
     TIMESTAMPTZ '2025-04-01 00:00:00+00'),
    ('DISBURSEMENT_MANDATE', '1.4', 'hi',
     'मैं साझेदार बैंक को स्वीकृत ऋण राशि, स्वीकृति पत्र में बताए गए लागू प्रोसेसिंग शुल्क काटने के बाद, सीधे मेरे पंजीकृत बैंक खाते में वितरित करने के लिए अधिकृत करता/करती हूँ। [PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]',
     TIMESTAMPTZ '2025-04-01 00:00:00+00'),
    -- ── Bengali (bn) ────────────────────────────────────────────────────────
    ('CREDIT_BUREAU', '1.4', 'bn',
     'আমি এই ঋণ আবেদন মূল্যায়নের উদ্দেশ্যে SnapAccount এবং অংশীদার ব্যাঙ্কগুলিকে CIBIL/Experian/Equifax/CRIF থেকে আমার ক্রেডিট তথ্য সংগ্রহ করার অনুমতি দিচ্ছি। এই সম্মতি ৩০ দিনের জন্য বৈধ। [PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]',
     TIMESTAMPTZ '2025-04-01 00:00:00+00'),
    ('DATA_SHARE_WITH_BANK', '1.4', 'bn',
     'আমি ঋণ আন্ডাররাইটিংয়ের জন্য SnapAccount কর্তৃক আমার আর্থিক নথি (ITR, ব্যাঙ্ক স্টেটমেন্ট, GST রিটার্ন) নির্বাচিত অংশীদার ব্যাঙ্কের সাথে শেয়ার করার সম্মতি দিচ্ছি। ব্যাঙ্ক তার নীতি অনুযায়ী অনুলিপি রাখতে পারে। [PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]',
     TIMESTAMPTZ '2025-04-01 00:00:00+00'),
    ('DISBURSEMENT_MANDATE', '1.4', 'bn',
     'আমি অংশীদার ব্যাঙ্ককে অনুমোদিত ঋণের পরিমাণ, অনুমোদন পত্রে উল্লিখিত প্রযোজ্য প্রসেসিং ফি কাটার পরে, সরাসরি আমার নিবন্ধিত ব্যাঙ্ক অ্যাকাউন্টে বিতরণ করার অনুমতি দিচ্ছি। [PLACEHOLDER TRANSLATION — LEGAL REVIEW REQUIRED]',
     TIMESTAMPTZ '2025-04-01 00:00:00+00')
ON CONFLICT (consent_type, text_version, locale) DO NOTHING;

-- =============================================================================
-- End 061_loan_consent_locale_and_catalog_alignment.sql
-- =============================================================================
