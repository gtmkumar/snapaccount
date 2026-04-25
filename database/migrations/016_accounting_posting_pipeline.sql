-- =============================================================================
-- 016_accounting_posting_pipeline.sql
-- Phase 6A — OCR -> Accounting pipeline additive migration.
--
-- Adds:
--   - accounting.ledger_entries            (simplified double-entry journal rows
--                                           per phase-6A-scope; coexists with the
--                                           existing accounting.journal_entry +
--                                           accounting.journal_entry_line pair)
--   - accounting.posting_audit             (before/after snapshot for every
--                                           OCR-driven auto-post, confidence,
--                                           reviewer)
--   - accounting.coa_template              (Indian-standard chart of accounts
--                                           template used to bootstrap per-org
--                                           accounting.account rows)
--   - document.document.extracted_entities (jsonb column added to partitioned
--                                           parent; propagates to partitions)
--
-- Conventions: snake_case, UUID PKs, audit cols, RLS on org-scoped tables,
-- indexes on every FK + hot query column. Fully additive, idempotent.
--
-- Depends on: 003_accounting_schema.sql, 002_document_schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- accounting.ledger_entries
-- -----------------------------------------------------------------------------
-- Simplified journal entries where each row carries both debit and credit
-- account ids (per phase-6A-scope contract). Used by AccountingService's new
-- posting pipeline. The existing normalized journal_entry / journal_entry_line
-- pair remains authoritative for manual / batch journals; ledger_entries is
-- the write-target for OCR-derived auto-postings where the fan-out is always
-- a single debit / single credit pair.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.ledger_entries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                UUID NOT NULL,                          -- auth.organization.id
    document_id           UUID,                                   -- document.document.id (by value, partitioned parent)
    journal_entry_id      UUID REFERENCES accounting.journal_entry (id),  -- optional link to batch journal
    posted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entry_date            DATE NOT NULL,
    debit_account_id      UUID NOT NULL REFERENCES accounting.account (id),
    credit_account_id     UUID NOT NULL REFERENCES accounting.account (id),
    amount                NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    currency              CHAR(3) NOT NULL DEFAULT 'INR',
    narration             TEXT,
    fy_year               INT NOT NULL,                           -- e.g. 2026 means FY 2026-27
    period_month          SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    source                VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
                              CHECK (source IN ('OCR','MANUAL','IMPORT','SYSTEM')),
    status                VARCHAR(30) NOT NULL DEFAULT 'POSTED'
                              CHECK (status IN ('PENDING_REVIEW','POSTED','REVERSED','REJECTED')),
    confidence_score      NUMERIC(5,4),                           -- 0.0000 - 1.0000 for OCR-sourced rows
    reviewer_user_id      UUID,                                   -- auth.user.id
    reviewed_at           TIMESTAMPTZ,
    reversal_of           UUID REFERENCES accounting.ledger_entries (id),
    dedupe_hash           VARCHAR(128),                           -- sha256(document_id + extracted_payload_hash)
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,
    created_by            UUID,
    updated_by            UUID,
    CONSTRAINT ck_ledger_entries_distinct_accounts
        CHECK (debit_account_id <> credit_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_org_fy_period
    ON accounting.ledger_entries (org_id, fy_year, period_month);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_document_id
    ON accounting.ledger_entries (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_posted_at
    ON accounting.ledger_entries (posted_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_debit_account
    ON accounting.ledger_entries (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_credit_account
    ON accounting.ledger_entries (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_status
    ON accounting.ledger_entries (org_id, status) WHERE status = 'PENDING_REVIEW';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_entries_dedupe_hash
    ON accounting.ledger_entries (dedupe_hash) WHERE dedupe_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal_entry
    ON accounting.ledger_entries (journal_entry_id) WHERE journal_entry_id IS NOT NULL;

ALTER TABLE accounting.ledger_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ledger_entries_updated_at'
    ) THEN
        CREATE TRIGGER trg_ledger_entries_updated_at
            BEFORE UPDATE ON accounting.ledger_entries
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'accounting' AND tablename = 'ledger_entries'
          AND policyname = 'ledger_entries_org_isolation'
    ) THEN
        CREATE POLICY ledger_entries_org_isolation ON accounting.ledger_entries
            USING (org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- accounting.posting_audit
-- -----------------------------------------------------------------------------
-- One row per auto-post action (OCR->ledger). Captures before/after state of
-- the affected accounts + AI confidence + reviewer decision. Useful for
-- regulator audits and user dispute resolution.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.posting_audit (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                UUID NOT NULL,
    ledger_entry_id       UUID REFERENCES accounting.ledger_entries (id) ON DELETE SET NULL,
    document_id           UUID,
    action                VARCHAR(40) NOT NULL
                              CHECK (action IN (
                                  'AUTO_POST','REVIEW_APPROVE','REVIEW_REJECT',
                                  'REVERSE','EDIT','ESCALATE'
                              )),
    before_snapshot       JSONB,
    after_snapshot        JSONB,
    confidence_score      NUMERIC(5,4),
    model_version         VARCHAR(100),
    reviewer_user_id      UUID,
    reviewer_notes        TEXT,
    ip_address            INET,
    user_agent            TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,
    created_by            UUID,
    updated_by            UUID
);

CREATE INDEX IF NOT EXISTS idx_posting_audit_org_id ON accounting.posting_audit (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posting_audit_ledger_entry_id
    ON accounting.posting_audit (ledger_entry_id) WHERE ledger_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posting_audit_document_id
    ON accounting.posting_audit (document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posting_audit_action ON accounting.posting_audit (action);

ALTER TABLE accounting.posting_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_posting_audit_updated_at'
    ) THEN
        CREATE TRIGGER trg_posting_audit_updated_at
            BEFORE UPDATE ON accounting.posting_audit
            FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'accounting' AND tablename = 'posting_audit'
          AND policyname = 'posting_audit_org_isolation'
    ) THEN
        CREATE POLICY posting_audit_org_isolation ON accounting.posting_audit
            USING (org_id IN (
                SELECT om.organization_id FROM auth.organization_member om
                WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
                  AND om.is_active = TRUE
                UNION
                SELECT o.id FROM auth.organization o
                WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
            ));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- accounting.coa_template
-- -----------------------------------------------------------------------------
-- Indian-standard Chart of Accounts template. Not org-scoped — acts as the
-- system-wide seed list consumed by AccountingService when a new organization
-- is onboarded and its accounting.account rows are materialized.
--
-- Account-code ranges (Indian accounting convention):
--   1xxx Assets
--   2xxx Liabilities
--   3xxx Equity
--   4xxx Income / Revenue
--   5xxx Expense
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.coa_template (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code    VARCHAR(10) NOT NULL UNIQUE,
    account_name    VARCHAR(300) NOT NULL,
    account_type    VARCHAR(50) NOT NULL
                        CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    account_subtype VARCHAR(100),
    parent_code     VARCHAR(10),
    is_system       BOOLEAN NOT NULL DEFAULT TRUE,
    description     TEXT,
    display_order   SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coa_template_type ON accounting.coa_template (account_type);
CREATE INDEX IF NOT EXISTS idx_coa_template_parent ON accounting.coa_template (parent_code) WHERE parent_code IS NOT NULL;

-- Seed: Indian standard COA. ON CONFLICT DO NOTHING — safe to re-run.
INSERT INTO accounting.coa_template
    (account_code, account_name, account_type, account_subtype, parent_code, display_order, description)
VALUES
    -- Assets (1xxx)
    ('1000','Assets','ASSET','HEADER',NULL,10,'Top-level assets node'),
    ('1100','Current Assets','ASSET','CURRENT_ASSET','1000',11,NULL),
    ('1110','Cash in Hand','ASSET','CURRENT_ASSET','1100',12,NULL),
    ('1120','Bank Accounts','ASSET','CURRENT_ASSET','1100',13,NULL),
    ('1130','Accounts Receivable','ASSET','CURRENT_ASSET','1100',14,'Sundry debtors'),
    ('1140','Inventory','ASSET','CURRENT_ASSET','1100',15,'Stock on hand'),
    ('1150','Input GST Credit','ASSET','CURRENT_ASSET','1100',16,'Input tax credit — CGST/SGST/IGST receivable'),
    ('1160','TDS Receivable','ASSET','CURRENT_ASSET','1100',17,NULL),
    ('1170','Prepaid Expenses','ASSET','CURRENT_ASSET','1100',18,NULL),
    ('1200','Fixed Assets','ASSET','FIXED_ASSET','1000',20,NULL),
    ('1210','Land & Building','ASSET','FIXED_ASSET','1200',21,NULL),
    ('1220','Plant & Machinery','ASSET','FIXED_ASSET','1200',22,NULL),
    ('1230','Furniture & Fixtures','ASSET','FIXED_ASSET','1200',23,NULL),
    ('1240','Computers & Equipment','ASSET','FIXED_ASSET','1200',24,NULL),
    ('1250','Vehicles','ASSET','FIXED_ASSET','1200',25,NULL),
    ('1290','Accumulated Depreciation','ASSET','CONTRA_ASSET','1200',29,'Contra-asset to fixed assets'),
    -- Liabilities (2xxx)
    ('2000','Liabilities','LIABILITY','HEADER',NULL,30,'Top-level liabilities node'),
    ('2100','Current Liabilities','LIABILITY','CURRENT_LIABILITY','2000',31,NULL),
    ('2110','Accounts Payable','LIABILITY','CURRENT_LIABILITY','2100',32,'Sundry creditors'),
    ('2120','Output GST Payable','LIABILITY','CURRENT_LIABILITY','2100',33,'CGST/SGST/IGST collected on sales'),
    ('2130','TDS Payable','LIABILITY','CURRENT_LIABILITY','2100',34,NULL),
    ('2140','Salaries Payable','LIABILITY','CURRENT_LIABILITY','2100',35,NULL),
    ('2150','Short-Term Loans','LIABILITY','CURRENT_LIABILITY','2100',36,NULL),
    ('2200','Long-Term Liabilities','LIABILITY','LONG_TERM_LIABILITY','2000',40,NULL),
    ('2210','Term Loans','LIABILITY','LONG_TERM_LIABILITY','2200',41,NULL),
    -- Equity (3xxx)
    ('3000','Equity','EQUITY','HEADER',NULL,50,NULL),
    ('3100','Capital Account','EQUITY','CAPITAL','3000',51,'Proprietor / partner capital'),
    ('3200','Retained Earnings','EQUITY','RETAINED_EARNINGS','3000',52,NULL),
    ('3300','Drawings','EQUITY','DRAWINGS','3000',53,'Proprietor drawings (contra-equity)'),
    -- Income / Revenue (4xxx)
    ('4000','Income','REVENUE','HEADER',NULL,60,NULL),
    ('4100','Sales — Goods','REVENUE','OPERATING_REVENUE','4000',61,NULL),
    ('4200','Sales — Services','REVENUE','OPERATING_REVENUE','4000',62,NULL),
    ('4300','Other Operating Income','REVENUE','OPERATING_REVENUE','4000',63,NULL),
    ('4400','Interest Income','REVENUE','NON_OPERATING_REVENUE','4000',64,NULL),
    ('4500','Other Income','REVENUE','NON_OPERATING_REVENUE','4000',65,NULL),
    -- Expenses (5xxx)
    ('5000','Expenses','EXPENSE','HEADER',NULL,70,NULL),
    ('5100','Purchases — Goods','EXPENSE','COGS','5000',71,'Cost of goods purchased for resale'),
    ('5200','Direct Expenses','EXPENSE','DIRECT','5000',72,NULL),
    ('5300','Salaries & Wages','EXPENSE','OPERATING','5000',73,NULL),
    ('5310','Rent','EXPENSE','OPERATING','5000',74,NULL),
    ('5320','Utilities','EXPENSE','OPERATING','5000',75,NULL),
    ('5330','Telephone & Internet','EXPENSE','OPERATING','5000',76,NULL),
    ('5340','Travel & Conveyance','EXPENSE','OPERATING','5000',77,NULL),
    ('5350','Professional Fees','EXPENSE','OPERATING','5000',78,NULL),
    ('5360','Bank Charges','EXPENSE','OPERATING','5000',79,NULL),
    ('5370','Printing & Stationery','EXPENSE','OPERATING','5000',80,NULL),
    ('5380','Repairs & Maintenance','EXPENSE','OPERATING','5000',81,NULL),
    ('5390','Insurance','EXPENSE','OPERATING','5000',82,NULL),
    ('5400','Depreciation Expense','EXPENSE','NON_CASH','5000',83,NULL),
    ('5500','Interest Expense','EXPENSE','FINANCE','5000',84,NULL),
    ('5600','Tax Expense','EXPENSE','TAX','5000',85,NULL),
    ('5900','Miscellaneous Expenses','EXPENSE','OPERATING','5000',90,NULL)
ON CONFLICT (account_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- document.document.extracted_entities
-- -----------------------------------------------------------------------------
-- jsonb column that holds the normalized ExtractedInvoiceDto payload from
-- Document AI (vendor, GSTIN, line_items[], tax blocks, totals). Added at the
-- partitioned parent so it propagates to all existing + future partitions.
-- -----------------------------------------------------------------------------
ALTER TABLE document.document
    ADD COLUMN IF NOT EXISTS extracted_entities JSONB;

CREATE INDEX IF NOT EXISTS idx_document_extracted_entities_gin
    ON document.document USING gin (extracted_entities)
    WHERE extracted_entities IS NOT NULL;

-- -----------------------------------------------------------------------------
-- accounting.fiscal_year_close — NOTE
-- -----------------------------------------------------------------------------
-- The phase-6A-scope calls for `accounting.fiscal_year_close`. This table is
-- already present as `accounting.financial_year_close` from 003_accounting_schema.sql
-- with an equivalent shape (organization_id, financial_year, status, etc.).
-- Per additive-only rules we do NOT rename it. Backend-agent should map the
-- domain name `FiscalYearClose` onto the existing financial_year_close table.
-- =============================================================================
-- End 016_accounting_posting_pipeline.sql
-- =============================================================================
