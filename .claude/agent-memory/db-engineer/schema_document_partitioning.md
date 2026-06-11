---
name: schema-document-partitioning
description: document.document is a RANGE-partitioned parent; ADD COLUMN propagates to partitions, but document_archive is NOT a partition.
metadata:
  type: project
---

`document.document` is a RANGE-partitioned (by `uploaded_at`, monthly) parent table. Real partitions are `document_2026_01..12`, `document_default`. The `Document` EF entity maps to this parent.

`ADD COLUMN` on the parent propagates automatically to every existing and future partition — add columns once at the parent, never per-partition. (Verified in migration 065.)

**Gotcha:** `document.document_archive` is a STANDALONE table, NOT a partition of `document.document` (confirmed via `pg_inherits` — zero inheritance rows). It is a separate archive/lifecycle destination. Column changes to the `Document` entity do NOT reach `document_archive`, and that is by design — don't treat it as a missed propagation.

**Cross-schema FK convention:** document.* references auth identities BY VALUE (plain UUID, no FK) — `user_id`, `created_by`, `updated_by`, and `approved_by` (added in 065) are all unconstrained UUIDs. Follow this, don't add FKs to `auth.user` from `document.*`.

**Why:** matters for any future additive migration touching `document.document`.
**How to apply:** ALTER the partitioned parent only; skip `document_archive`; reference auth users by value.
