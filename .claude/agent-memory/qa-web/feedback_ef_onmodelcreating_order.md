---
name: ef-onmodelcreating-order
description: EF Core OnModelCreating call order bug pattern — per-entity config vs BaseDbContext GuidStringConverter conflict causes 500 on full entity materialization
type: feedback
---

When a new entity config in SnapAccount calls `HasMaxLength(128)` on `CreatedBy`/`UpdatedBy` (inherited audit columns), and `GstDbContext.OnModelCreating` (or any service DbContext) called `base.OnModelCreating(modelBuilder)` AFTER `ApplyConfigurationsFromAssembly`, the global `GuidStringConverter<string, Guid>` from `BaseDbContext` overwrites the per-entity varchar hint. Result: Npgsql reads a varchar DB column but EF expects a Guid provider type → `InvalidCastException` → HTTP 500 on full entity materialization.

**Why:** Wave 5 IMS entities (`ImsInvoice`, `Gstr1aAmendment`) added explicit `HasMaxLength(128)` on `created_by`/`updated_by` columns that are `varchar(128)` in the DB. Older entities didn't set `HasMaxLength` so the conflict didn't surface. The ordering bug (base after apply) was already present but latent.

**Symptom pattern:**
- `GET /entity/{id}` (FirstOrDefaultAsync — full entity) → HTTP 500
- `GET /entities` list (Select projection — no CreatedBy materialization) → HTTP 200
- `POST action` (SaveChanges — writes CreatedBy) → HTTP 500

**How to apply:** When reviewing new EF entity configurations in SnapAccount, check if the service's DbContext calls `base.OnModelCreating` BEFORE `ApplyConfigurationsFromAssembly`. Correct order:
```csharp
base.OnModelCreating(modelBuilder);             // global converters first
modelBuilder.ApplyConfigurationsFromAssembly(typeof(XxxDbContext).Assembly); // entity configs override last
```

**Confirmed fix:** W5-IMS-02 in GstService (2026-06-11). Build and runtime verified.

Related: [[project_wave5_state]]
