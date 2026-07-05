---
name: schema-ef-reverse-divergence-sentinel
description: Fixing EF↔DB divergence where the live table has NOT-NULL columns the entity does not model — sentinel DEFAULT vs DROP NOT NULL, and the UNIQUE-constraint trap.
metadata:
  type: feedback
---

When an additive migration reconciles an EF entity onto a richer live table, check BOTH directions of divergence, not just the columns the entity maps that are absent.

The reverse divergence: live NOT-NULL columns the entity does NOT model. EF inserts only entity-mapped columns, so any such column without a DB default makes the INSERT fail.

**How to apply (per unmapped NOT-NULL column):**
- If it already has a DEFAULT (e.g. `residential_status DEFAULT 'RESIDENT'`, `is_disability_claim DEFAULT false`) → no action, DB fills it.
- If it has NO default → give it a sensible DB DEFAULT, OR drop NOT NULL. **Prefer a sentinel DEFAULT over DROP NOT NULL when the column participates in a UNIQUE constraint.** Postgres treats NULLs as DISTINCT in a unique index, so dropping NOT NULL silently allows duplicate rows and breaks one-row-per-key semantics.

**Worked example (migration 111, itr.assessee_profiles, BUG-ITR-ASSESSEE-MAPPING):** the Assessee profile is one-row-per-USER, but the table had `ay text NOT NULL` (no default) plus `UNIQUE (user_id, ay)`. The entity does not model AY (assessment year lives on itr.filings). Fix = `ALTER COLUMN ay SET DEFAULT '_PROFILE_'` keeping NOT NULL, so EF inserts that omit `ay` get the sentinel and UNIQUE(user_id, ay) still enforces one profile row per user. DROP NOT NULL would have allowed multiple NULL-ay rows per user.

**Why:** be-diverge (EF-config owner) flagged this and it was validated against the live constraint set (ay is `text`; uq_assessee_profiles_user_ay confirmed; 0 rows so sentinel can't collide). See also [[schema_itr_ef_reconciliation]].

**Validation checklist before committing a sentinel default:** (a) column type/length can hold the sentinel; (b) enumerate the exact UNIQUE/CHECK constraints on the column via `pg_get_constraintdef`; (c) confirm no existing rows collide with the sentinel value. Always smoke-test with a rolled-back INSERT that supplies ONLY the entity-mapped columns.
