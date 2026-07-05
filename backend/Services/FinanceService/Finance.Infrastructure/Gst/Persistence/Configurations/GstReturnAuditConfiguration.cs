using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstReturnAudit"/>.
/// Maps to <c>gst.gst_return_audit</c> (migration 096).
///
/// Append-only table: no soft-delete filter, no UpdatedAt column.
/// 7-year document retention applies per SnapAccount compliance policy.
/// </summary>
public sealed class GstReturnAuditConfiguration : IEntityTypeConfiguration<GstReturnAudit>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstReturnAudit> builder)
    {
        builder.ToTable("gst_return_audit");

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id");

        builder.Property(a => a.GstReturnId)
            .HasColumnName("gst_return_id")
            .IsRequired();

        builder.Property(a => a.EventType)
            .HasColumnName("event_type")
            .HasMaxLength(30)
            .IsRequired();

        builder.Property(a => a.ActorUserId)
            .HasColumnName("actor_user_id")
            .IsRequired();

        builder.Property(a => a.ActorEmail)
            .HasColumnName("actor_email")
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(a => a.ActorDisplayName)
            .HasColumnName("actor_display_name")
            .HasMaxLength(200);

        builder.Property(a => a.PreviousStatus)
            .HasColumnName("previous_status")
            .HasMaxLength(30);

        builder.Property(a => a.Detail)
            .HasColumnName("detail")
            .HasColumnType("text");

        builder.Property(a => a.ArnReceived)
            .HasColumnName("arn_received")
            .HasMaxLength(50);

        builder.Property(a => a.Timestamp)
            .HasColumnName("timestamp")
            .IsRequired();

        // Indexes
        builder.HasIndex(a => a.GstReturnId)
            .HasDatabaseName("ix_gst_return_audit_return_id");

        builder.HasIndex(a => new { a.GstReturnId, a.Timestamp })
            .HasDatabaseName("ix_gst_return_audit_return_id_timestamp");
    }
}
