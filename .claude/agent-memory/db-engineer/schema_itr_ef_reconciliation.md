---
name: schema-itr-ef-reconciliation
description: ITR schema is fully EF-reconciled as of migration 069; the convention-mapping gap class and the ca_reviewer_id orphan
metadata:
  type: project
---

As of migration 069 (2026-06-11), all 14 itr.* tables are reconciled with the ItrService EF configs — verified by diffing EF-mapped columns vs information_schema for BOTH explicit `HasColumnName` and convention-mapped (default snake_case) properties.

**The recurring bug class:** an entity property with NO explicit `HasColumnName` maps by EF's default snake_case convention, and the DB column was never created → live read paths 500 with `42703: column f.<x> does not exist`. This is harder to spot than explicit-map drift because there's no string literal to grep. itr.filings hit this twice in Phase 7: `reviewed_by_ca_id` (069). A pure explicit-`HasColumnName` diff MISSES this class — always also sweep convention-mapped scalar props.

**Why:** ItrService (like loan/subscription) has no EF migrations — the numbered SQL files are canonical, so EF model and SQL drift independently. See [[conventions_migrations_ef_parity]].

**How to apply:** when reconciling any service's schema, run two diffs: (1) explicit `HasColumnName("...")` literals vs DB; (2) public scalar entity properties lacking HasColumnName/Ignore, snake_cased, vs DB. Both must be empty.

**Orphan to remember — itr.filings.ca_reviewer_id:** uuid/nullable, partial index idx_filings_ca_reviewer, 0 rows, mapped by NO entity. Superseded by reviewed_by_ca_id (069), marked `-- DEPRECATED` in 069 but NOT renamed/dropped (additive rule). Backfill-or-drop is a backend decision, still open. Don't "fix" it by renaming.
