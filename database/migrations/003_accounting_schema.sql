-- =============================================================================
-- 003_accounting_schema.sql
-- Accounting Service — Ledger, Journal Entries, Financial Reports
-- Depends on: 000_init.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS accounting;

-- =============================================================================
-- accounting.financial_period
-- Represents accounting periods (monthly, quarterly, annual)
-- =============================================================================
CREATE TABLE accounting.financial_period (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,               -- auth.organization.id
    period_type         VARCHAR(20) NOT NULL CHECK (period_type IN ('MONTHLY','QUARTERLY','ANNUAL')),
    financial_year      VARCHAR(10) NOT NULL,         -- e.g. '2024-25'
    period_name         VARCHAR(100) NOT NULL,        -- e.g. 'April 2024'
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    is_closed           BOOLEAN NOT NULL DEFAULT FALSE,
    closed_at           TIMESTAMPTZ,
    closed_by           UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, period_type, start_date)
);

CREATE INDEX idx_fin_period_org_id ON accounting.financial_period (organization_id);
CREATE INDEX idx_fin_period_fy ON accounting.financial_period (financial_year);
CREATE INDEX idx_fin_period_dates ON accounting.financial_period (start_date, end_date);

ALTER TABLE accounting.financial_period ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_financial_period_updated_at
    BEFORE UPDATE ON accounting.financial_period
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.account
-- Chart of Accounts — hierarchical account structure
-- =============================================================================
CREATE TABLE accounting.account (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    parent_account_id   UUID REFERENCES accounting.account (id),
    account_code        VARCHAR(50) NOT NULL,
    account_name        VARCHAR(300) NOT NULL,
    account_type        VARCHAR(50) NOT NULL
                            CHECK (account_type IN (
                                'ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'
                            )),
    account_subtype     VARCHAR(100),                -- e.g. CURRENT_ASSET, FIXED_ASSET
    currency            VARCHAR(10) NOT NULL DEFAULT 'INR',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_system_account   BOOLEAN NOT NULL DEFAULT FALSE,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, account_code)
);

CREATE INDEX idx_account_org_id ON accounting.account (organization_id);
CREATE INDEX idx_account_parent_id ON accounting.account (parent_account_id) WHERE parent_account_id IS NOT NULL;
CREATE INDEX idx_account_type ON accounting.account (account_type, organization_id);

ALTER TABLE accounting.account ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_account_updated_at
    BEFORE UPDATE ON accounting.account
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.journal_entry
-- Double-entry bookkeeping journal entries
-- =============================================================================
CREATE TABLE accounting.journal_entry (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    period_id           UUID REFERENCES accounting.financial_period (id),
    entry_number        VARCHAR(50) NOT NULL,         -- Unique per org: JE-2024-001
    entry_date          DATE NOT NULL,
    description         TEXT NOT NULL,
    entry_type          VARCHAR(50) NOT NULL DEFAULT 'MANUAL'
                            CHECK (entry_type IN (
                                'MANUAL','AUTO_OCR','OPENING_BALANCE',
                                'CLOSING','ADJUSTMENT','REVERSAL'
                            )),
    reference_type      VARCHAR(100),                -- 'DOCUMENT', 'GST_INVOICE', etc.
    reference_id        UUID,                        -- Cross-schema reference by value
    total_debit         NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_credit        NUMERIC(20,2) NOT NULL DEFAULT 0,
    status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT','POSTED','REVERSED','VOID')),
    posted_at           TIMESTAMPTZ,
    posted_by           UUID,
    reversed_by         UUID,                        -- If this entry was reversed
    reversal_entry_id   UUID REFERENCES accounting.journal_entry (id),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, entry_number)
);

CREATE INDEX idx_journal_entry_org_id ON accounting.journal_entry (organization_id);
CREATE INDEX idx_journal_entry_period_id ON accounting.journal_entry (period_id);
CREATE INDEX idx_journal_entry_entry_date ON accounting.journal_entry (entry_date);
CREATE INDEX idx_journal_entry_status ON accounting.journal_entry (status, organization_id);
CREATE INDEX idx_journal_entry_reference ON accounting.journal_entry (reference_type, reference_id) WHERE reference_id IS NOT NULL;

ALTER TABLE accounting.journal_entry ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_journal_entry_updated_at
    BEFORE UPDATE ON accounting.journal_entry
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.journal_entry_line
-- Line items (debit/credit legs) of a journal entry
-- =============================================================================
CREATE TABLE accounting.journal_entry_line (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES accounting.journal_entry (id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES accounting.account (id),
    line_number     SMALLINT NOT NULL,
    description     TEXT,
    debit_amount    NUMERIC(20,2) NOT NULL DEFAULT 0,
    credit_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
    currency        VARCHAR(10) NOT NULL DEFAULT 'INR',
    gst_rate_pct    NUMERIC(5,2),                    -- if this line has GST
    hsn_sac_code    VARCHAR(20),
    cost_center     VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_jel_journal_entry_id ON accounting.journal_entry_line (journal_entry_id);
CREATE INDEX idx_jel_account_id ON accounting.journal_entry_line (account_id);

CREATE TRIGGER trg_journal_entry_line_updated_at
    BEFORE UPDATE ON accounting.journal_entry_line
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.ledger
-- Running ledger balance per account
-- =============================================================================
CREATE TABLE accounting.ledger (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    account_id          UUID NOT NULL REFERENCES accounting.account (id),
    period_id           UUID REFERENCES accounting.financial_period (id),
    opening_balance     NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_debit         NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_credit        NUMERIC(20,2) NOT NULL DEFAULT 0,
    closing_balance     NUMERIC(20,2)
                            GENERATED ALWAYS AS (opening_balance + total_debit - total_credit) STORED,
    as_of_date          DATE NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, account_id, as_of_date)
);

CREATE INDEX idx_ledger_org_id ON accounting.ledger (organization_id);
CREATE INDEX idx_ledger_account_id ON accounting.ledger (account_id);
CREATE INDEX idx_ledger_period_id ON accounting.ledger (period_id);

ALTER TABLE accounting.ledger ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_ledger_updated_at
    BEFORE UPDATE ON accounting.ledger
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.trial_balance
-- Snapshot of trial balance at a point in time
-- =============================================================================
CREATE TABLE accounting.trial_balance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    period_id       UUID REFERENCES accounting.financial_period (id),
    financial_year  VARCHAR(10) NOT NULL,
    as_of_date      DATE NOT NULL,
    data_snapshot   JSONB NOT NULL,                  -- Full trial balance data
    total_debits    NUMERIC(20,2) NOT NULL,
    total_credits   NUMERIC(20,2) NOT NULL,
    is_balanced     BOOLEAN
                        GENERATED ALWAYS AS (total_debits = total_credits) STORED,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_trial_balance_org_id ON accounting.trial_balance (organization_id);
CREATE INDEX idx_trial_balance_period_id ON accounting.trial_balance (period_id);
CREATE INDEX idx_trial_balance_as_of_date ON accounting.trial_balance (as_of_date);

ALTER TABLE accounting.trial_balance ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_trial_balance_updated_at
    BEFORE UPDATE ON accounting.trial_balance
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.balance_sheet
-- =============================================================================
CREATE TABLE accounting.balance_sheet (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    period_id       UUID REFERENCES accounting.financial_period (id),
    financial_year  VARCHAR(10) NOT NULL,
    as_of_date      DATE NOT NULL,
    total_assets    NUMERIC(20,2) NOT NULL,
    total_liabilities NUMERIC(20,2) NOT NULL,
    total_equity    NUMERIC(20,2) NOT NULL,
    data_snapshot   JSONB NOT NULL,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_balance_sheet_org_id ON accounting.balance_sheet (organization_id);
CREATE INDEX idx_balance_sheet_period_id ON accounting.balance_sheet (period_id);

ALTER TABLE accounting.balance_sheet ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_balance_sheet_updated_at
    BEFORE UPDATE ON accounting.balance_sheet
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.profit_and_loss
-- =============================================================================
CREATE TABLE accounting.profit_and_loss (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    period_id       UUID REFERENCES accounting.financial_period (id),
    financial_year  VARCHAR(10) NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    total_revenue   NUMERIC(20,2) NOT NULL DEFAULT 0,
    total_expenses  NUMERIC(20,2) NOT NULL DEFAULT 0,
    gross_profit    NUMERIC(20,2),
    net_profit      NUMERIC(20,2),
    data_snapshot   JSONB NOT NULL,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID
);

CREATE INDEX idx_pnl_org_id ON accounting.profit_and_loss (organization_id);
CREATE INDEX idx_pnl_period_id ON accounting.profit_and_loss (period_id);
CREATE INDEX idx_pnl_dates ON accounting.profit_and_loss (start_date, end_date);

ALTER TABLE accounting.profit_and_loss ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profit_and_loss_updated_at
    BEFORE UPDATE ON accounting.profit_and_loss
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.cash_flow_statement
-- =============================================================================
CREATE TABLE accounting.cash_flow_statement (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL,
    period_id                   UUID REFERENCES accounting.financial_period (id),
    financial_year              VARCHAR(10) NOT NULL,
    start_date                  DATE NOT NULL,
    end_date                    DATE NOT NULL,
    operating_activities_total  NUMERIC(20,2) NOT NULL DEFAULT 0,
    investing_activities_total  NUMERIC(20,2) NOT NULL DEFAULT 0,
    financing_activities_total  NUMERIC(20,2) NOT NULL DEFAULT 0,
    net_cash_change             NUMERIC(20,2)
                                    GENERATED ALWAYS AS (
                                        operating_activities_total +
                                        investing_activities_total +
                                        financing_activities_total
                                    ) STORED,
    opening_cash_balance        NUMERIC(20,2) NOT NULL DEFAULT 0,
    closing_cash_balance        NUMERIC(20,2),
    data_snapshot               JSONB NOT NULL,
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    created_by                  UUID,
    updated_by                  UUID
);

CREATE INDEX idx_cashflow_org_id ON accounting.cash_flow_statement (organization_id);
CREATE INDEX idx_cashflow_period_id ON accounting.cash_flow_statement (period_id);

ALTER TABLE accounting.cash_flow_statement ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_cash_flow_statement_updated_at
    BEFORE UPDATE ON accounting.cash_flow_statement
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.opening_balance
-- Opening balances for accounts at start of financial year
-- =============================================================================
CREATE TABLE accounting.opening_balance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    account_id      UUID NOT NULL REFERENCES accounting.account (id),
    financial_year  VARCHAR(10) NOT NULL,
    balance_date    DATE NOT NULL,
    balance_amount  NUMERIC(20,2) NOT NULL,
    balance_type    VARCHAR(10) NOT NULL CHECK (balance_type IN ('DEBIT','CREDIT')),
    is_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      UUID,
    updated_by      UUID,
    UNIQUE (organization_id, account_id, financial_year)
);

CREATE INDEX idx_opening_balance_org_id ON accounting.opening_balance (organization_id);
CREATE INDEX idx_opening_balance_account_id ON accounting.opening_balance (account_id);

ALTER TABLE accounting.opening_balance ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_opening_balance_updated_at
    BEFORE UPDATE ON accounting.opening_balance
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- accounting.financial_year_close
-- Records the year-end closing process
-- =============================================================================
CREATE TABLE accounting.financial_year_close (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    financial_year      VARCHAR(10) NOT NULL,
    status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','ROLLED_BACK')),
    initiated_by        UUID,
    initiated_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    closing_notes       TEXT,
    retained_earnings   NUMERIC(20,2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          UUID,
    updated_by          UUID,
    UNIQUE (organization_id, financial_year)
);

CREATE INDEX idx_fy_close_org_id ON accounting.financial_year_close (organization_id);
CREATE INDEX idx_fy_close_status ON accounting.financial_year_close (status);

ALTER TABLE accounting.financial_year_close ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_financial_year_close_updated_at
    BEFORE UPDATE ON accounting.financial_year_close
    FOR EACH ROW EXECUTE FUNCTION shared.set_updated_at();

-- =============================================================================
-- Row-Level Security Policies
-- =============================================================================

CREATE POLICY fin_period_org_isolation ON accounting.financial_period
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY account_org_isolation ON accounting.account
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY journal_entry_org_isolation ON accounting.journal_entry
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY ledger_org_isolation ON accounting.ledger
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY trial_balance_org_isolation ON accounting.trial_balance
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY balance_sheet_org_isolation ON accounting.balance_sheet
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY pnl_org_isolation ON accounting.profit_and_loss
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY cashflow_org_isolation ON accounting.cash_flow_statement
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY opening_balance_org_isolation ON accounting.opening_balance
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));

CREATE POLICY fy_close_org_isolation ON accounting.financial_year_close
    USING (organization_id IN (
        SELECT om.organization_id FROM auth.organization_member om
        WHERE om.user_id = current_setting('app.current_user_id', TRUE)::UUID
          AND om.is_active = TRUE
        UNION
        SELECT o.id FROM auth.organization o
        WHERE o.owner_user_id = current_setting('app.current_user_id', TRUE)::UUID
    ));
