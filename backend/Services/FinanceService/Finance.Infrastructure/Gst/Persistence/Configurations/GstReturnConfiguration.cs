using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstReturn"/>.
/// Maps the three filing-queue columns added in migration 033.
/// Schema is inherited from <c>GstDbContext.HasDefaultSchema("gst")</c>.
/// </summary>
public sealed class GstReturnConfiguration : IEntityTypeConfiguration<GstReturn>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstReturn> builder)
    {
        builder.ToTable("gst_return");

        // Filing-queue columns (migration 033)
        builder.Property(r => r.BusinessNameSnapshot)
            .HasColumnName("business_name_snapshot")
            .HasColumnType("text");

        builder.Property(r => r.AssignedCaUserId)
            .HasColumnName("assigned_ca_user_id");

        builder.Property(r => r.SlaExpiresAt)
            .HasColumnName("sla_expires_at");
    }
}
