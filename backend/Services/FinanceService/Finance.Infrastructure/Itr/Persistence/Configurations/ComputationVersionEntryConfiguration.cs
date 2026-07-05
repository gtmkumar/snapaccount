using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="ComputationVersionEntry"/> → itr.computation_versions.
/// DG-ITR-07: versioned tax-computation history per filing.
/// Rows are append-only; no soft-delete (immutable audit record).
/// </summary>
public sealed class ComputationVersionEntryConfiguration
    : IEntityTypeConfiguration<ComputationVersionEntry>
{
    public void Configure(EntityTypeBuilder<ComputationVersionEntry> builder)
    {
        builder.ToTable("computation_versions");
        builder.HasKey(v => v.Id);

        builder.Property(v => v.FilingId)
            .IsRequired()
            .HasColumnName("filing_id");

        builder.Property(v => v.Version)
            .IsRequired()
            .HasColumnName("version");

        builder.Property(v => v.Label)
            .HasMaxLength(200)
            .HasColumnName("label");

        builder.Property(v => v.ActorName)
            .IsRequired()
            .HasMaxLength(200)
            .HasColumnName("actor_name");

        builder.Property(v => v.CreatedAt)
            .IsRequired()
            .HasColumnName("created_at");

        builder.Property(v => v.InputJson)
            .IsRequired()
            .HasColumnType("jsonb")
            .HasColumnName("input_json");

        builder.Property(v => v.ResultJson)
            .IsRequired()
            .HasColumnType("jsonb")
            .HasColumnName("result_json");

        builder.HasIndex(v => v.FilingId)
            .HasDatabaseName("idx_computation_versions_filing_id");

        builder.HasIndex(v => new { v.FilingId, v.Version })
            .IsUnique()
            .HasDatabaseName("ux_computation_versions_filing_version");
    }
}
