---
name: feedback-ef-audit-column-text-not-uuid
description: W5-IMS-02 bug class — GuidStringConverter↔TEXT InvalidCastException when created_by/updated_by are TEXT/VARCHAR but BaseDbContext applies uuid converter globally. Fix pattern for both DbContext order and entity config override.
metadata:
  type: feedback
---

When a migration creates `created_by`/`updated_by` as `TEXT` or `character varying` (not `uuid`), a two-part fix is required to avoid Npgsql `InvalidCastException` on full-entity materialization.

**Root cause:** `BaseDbContext.OnModelCreating` applies a global `GuidStringConverter` (`string → Guid`) to `CreatedBy`/`UpdatedBy` on every `BaseAuditableEntity` subtype. If the backing column is `TEXT`/`VARCHAR` instead of `uuid`, Npgsql tries to read a uuid provider type from a text column and throws.

**Why:** Firebase UIDs are strings (not UUIDs), so any table whose migration was written by the db-engineer with `TEXT` for those columns (rather than `uuid`) hits this. Migration 074 (gst.ims_invoices, gstr1a_amendments) and migration 075 (ai.chunks, ai.interactions) both used TEXT.

**Fix — two parts, both required:**

1. **DbContext.OnModelCreating call order** — `base.OnModelCreating(modelBuilder)` MUST be called BEFORE `modelBuilder.ApplyConfigurationsFromAssembly(...)`. When base runs first, per-entity config `HasConversion<string>()` overrides win the last-write. When base runs last (wrong order), it overwrites the per-entity overrides and the bug reappears.

2. **Per-entity config override** — In the `IEntityTypeConfiguration<T>.Configure` method, explicitly override `CreatedBy`/`UpdatedBy`:
   ```csharp
   builder.Property(x => x.CreatedBy)
       .HasColumnName("created_by")
       .HasColumnType("text")       // or "character varying" if varchar
       .HasConversion<string>();    // identity: no conversion, Npgsql uses text path
   builder.Property(x => x.UpdatedBy)
       .HasColumnName("updated_by")
       .HasColumnType("text")
       .HasConversion<string>();
   ```

**How to apply:** Any time a new migration creates `created_by`/`updated_by` as `TEXT` or `VARCHAR` (not `uuid`), apply this two-part fix to both the DbContext and the entity configuration. Scan new migrations with:
```sql
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name IN ('created_by', 'updated_by')
  AND data_type != 'uuid'
  AND table_schema NOT IN ('pg_catalog', 'information_schema');
```

**Test guard — projection tests are insufficient:** `.Select(x => new { x.Id, ... }).ToListAsync()` does NOT surface this bug if `CreatedBy`/`UpdatedBy` are omitted from the projection. Always add a `FirstOrDefaultAsync()` test (no Select) alongside projection tests for any `BaseAuditableEntity` — this materializes ALL columns and will throw on the type mismatch.

**Services affected as of 2026-06-11:**
- `gst.ims_invoices` — FIXED (ImsInvoiceConfiguration, W5-IMS-02)
- `gst.gstr1a_amendments` — FIXED (Gstr1aAmendmentConfiguration, W5-IMS-02)
- `ai.chunks` — FIXED (AiChunkConfiguration, mirror fix)
- `ai.interactions` — FIXED (AiInteractionConfiguration, mirror fix)
- All other services use `uuid` columns — verified clean via `information_schema` scan.
