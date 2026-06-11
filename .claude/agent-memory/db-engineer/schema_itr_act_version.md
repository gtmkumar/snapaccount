---
name: schema-itr-act-version
description: IT Act 2025 act_version dimension added to ITR config tables (migration 072) + itr.act_section_mapping reference
metadata:
  type: project
---

Migration 072 (GAP-102, 2026-06-11) added an Act dimension to ITR config so 1961-era and 2025-era tax config can coexist (Income-tax Act 2025 is effective FY/tax-year 2026-27).

- Added `act_version VARCHAR(20) NOT NULL DEFAULT 'IT_ACT_1961'` (CHECK `IN ('IT_ACT_1961','IT_ACT_2025')`) + `tax_year VARCHAR(10)` to the three FY/AY-versioned config tables: `itr.tax_slab_versions` (023), `itr.deduction_sections` (023), `itr.tax_slab` (006, legacy). Default keeps every existing row behaving exactly as before — behaviour-neutral until 2025-Act rows are seeded (a content task). `tax_year` kept ALONGSIDE `ay`/`financial_year`, backfilled from them.
- New reference table `itr.act_section_mapping` (old_section, new_section, act_version_from='IT_ACT_2025', is_illustrative DEFAULT TRUE, UNIQUE(old_section, act_version_from)), no RLS. Seeded 3 ILLUSTRATIVE rows (80C→123, 80D→126, 87A→157) — new-clause numbers MUST be verified against enacted text; full mapping is a separate content task. Never surface illustrative rows as authoritative.

**Backend handoff:** ItrService config-resolution handlers must add `act_version` to the lookup predicate once 2025-Act config is seeded — tax year 2026-27 onward resolve `WHERE act_version='IT_ACT_2025'`, earlier stays `'IT_ACT_1961'`.

ITR config versioning is otherwise (ay/fy, regime)-keyed and IMMUTABLE per row (INSERT new on rollover, never UPDATE — see 023 header). See also [[schema-itr-ef-reconciliation]].
