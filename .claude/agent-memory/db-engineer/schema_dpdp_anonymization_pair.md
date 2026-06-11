---
name: schema-dpdp-anonymization-pair
description: DPDP erasure metadata pair (anonymization_reason, anonymized_at) — which entity-backed tables carry it and the gst.notices asymmetry
metadata:
  type: project
---

DPDP Act 2023 right-to-erasure is implemented per-table as an in-place anonymize (scrub PII, keep row for 7-year retention) rather than hard delete. The marker columns are the pair `anonymization_reason VARCHAR(200)` + `anonymized_at TIMESTAMPTZ`, added by `ADD COLUMN IF NOT EXISTS` in additive migrations.

As of migration 068 (2026-06-11), all 10 entity-backed tables carrying `AnonymizationReason` have the full pair: callback.callbacks, chat.messages, itr.notices, itr.form_16_extracts, itr.filings, itr.assessee_profiles, loan.applications, loan.consents, subscription.subscription, subscription.subscription_invoice. (067 added it to subscription.subscription; 068 added the last 3: itr.filings, itr.assessee_profiles, subscription.subscription_invoice — the latter also got razorpay_order_id VARCHAR(100) since Invoice maps RazorpayOrderId but the table only had razorpay_invoice_id.)

**Why:** EF configs for these entities map the columns; a missing column 500s with `42703: column ... does not exist` on read paths (this is what broke the ITR admin listing).

**How to apply:** When adding a new entity that exposes AnonymizationReason, ensure its table gets the pair in the same additive migration. To find drift, scan: entities via `grep -rln "public string? AnonymizationReason" backend/Services --include="*.cs"`, and DB via an `information_schema.columns` GROUP BY HAVING-asymmetric query.

**Known benign asymmetry (do NOT auto-fix):** `gst.notices` has `anonymized_at` but NOT `anonymization_reason`. GstNotice has no AnonymizationReason property (it anonymizes by nulling `responded_by` via `AnonymizeRespondent()`) and its EF config maps neither column — so the orphan `anonymized_at` is unused and the missing column cannot 500. Out of scope; logged only.

See [[conventions_migrations_ef_parity]] for the canonical-SQL-file convention (no EF migrations for itr/subscription).
