# COA + ITR migration verdicts — orchestrator-derived from live schema + code (2026-07-05)

Derived directly (be-diverge silent on #23; de-risking the Phase-6 migration-111 dependency). Verified against live `snapaccount` DB + source.

## BUG-ACCT-COA-TEMPLATE-CODE → **CODE-ONLY. NO migration.**
- `CoaTemplateRepository.cs:22` (Dapper): `SELECT template_code AS TemplateCode, account_code AS AccountCode, ... FROM accounting.coa_template` → 500 because `accounting.coa_template` has **no `template_code`** column (live cols: id, account_code, account_name, account_type, account_subtype, parent_code, is_system, description, display_order, created_at, updated_at, deleted_at; 52 rows).
- `TemplateCode` is vestigial provenance: the consuming EF entity `ChartOfAccount` already does `builder.Ignore(e => e.TemplateCode)` (`ChartOfAccountConfiguration.cs:42`, comment "DB has no ... template_code columns — seeding provenance is not in schema yet"). It is never persisted anywhere.
- **Fix:** remove `template_code AS TemplateCode, ` from the SELECT and drop `TemplateCode` from the `CoaTemplateRow` record (or `SELECT NULL AS TemplateCode`). BootstrapCoa copies account lines fine without it. No DDL, no migration 111 for this bug.

## BUG-ITR-ASSESSEE-MAPPING → **schema decision; most likely a small ADDITIVE migration 111.**
- `AssesseeConfiguration.cs` maps `Assessee` entity props to columns that **do not exist** in live `itr.assessee_profiles`:
  - phantom (no live column): `full_name` (FullName), `assessee_type` (AssesseeType), `email` (Email), `phone_number` (PhoneNumber), `aadhaar_last4` (AadhaarLast4), `annual_turnover_cr` (AnnualTurnoverCr); `address` (Address) — live has `address_jsonb` (type mismatch).
  - real/mapped OK: `pan` (PanCipher), `pan_last4`, `organization_id`, `id`, `user_id`.
- Live table is a RICHER, newer DPDP design (29 cols): ay, dob, gender, residential_status, occupation, salary/business/house_property/capital_gains/other_income/deductions/bank_account_for_refund/address_jsonb, consent_given_at, consent_withdrawn_at, retention_until, created_by/updated_by, organization_id, anonymization_reason, anonymized_at. It has **no name column at all**.
- Symptom: any EF query against Assessee 500s (SQL references nonexistent columns) → breaks GET/PUT /itr/profile + POST /itr/filings.
- **Two directions — needs the ITR write-path read (does the create/upsert command populate FullName/Email/etc.?):**
  - (A) ADDITIVE MIGRATION 111: add full_name, assessee_type, email, phone_number, aadhaar_last4, annual_turnover_cr (+ decide address vs address_jsonb) so the table matches the entity. Simplest to make the app work; but note DPDP implication of storing a plaintext `full_name` in the ITR table (currently deliberately absent — name may be intended to derive from the user/auth record).
  - (B) CODE REFACTOR: realign the `Assessee` entity/config onto the rich `_jsonb` schema; Ignore/relocate the simple fields. No migration, but larger and must not lose fields the write-path persists.
- **Recommendation:** if the ITR create/upsert command WRITES those fields, (A) additive migration is the low-risk fix (Ignore() would silently drop written data). db-engineer on standby for an additive migration 111. Confirm direction with be-diverge (owns #23) or via reading `Finance.Application/Itr/**` create path.

## Migration 111 status
- Needed for: **ITR (probable, additive)** — pending direction confirmation.
- NOT needed for: COA (code-only).
- If authored, it is `111_*` (110 = ACM reconcile is the current highest); the Phase-6 drop migration then becomes `112_drop_unused_tables.sql`.
