using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="DeviceIntegrityCheck"/>
/// → <c>auth.device_integrity_checks</c>.
/// Migration 089.
/// </summary>
public sealed class DeviceIntegrityCheckConfiguration : IEntityTypeConfiguration<DeviceIntegrityCheck>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<DeviceIntegrityCheck> builder)
    {
        builder.ToTable("device_integrity_checks");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id)
            .HasColumnName("id")
            .IsRequired();

        builder.Property(x => x.UserId)
            .HasColumnName("user_id");

        builder.Property(x => x.OrganizationId)
            .HasColumnName("organization_id");

        builder.Property(x => x.Platform)
            .HasColumnName("platform")
            .HasMaxLength(20);

        builder.Property(x => x.Verdict)
            .HasColumnName("verdict")
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(x => x.Endpoint)
            .HasColumnName("endpoint")
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(x => x.FailureReason)
            .HasColumnName("failure_reason")
            .HasMaxLength(500);

        builder.Property(x => x.ClientIp)
            .HasColumnName("client_ip")
            .HasMaxLength(64);

        builder.Property(x => x.RecordedAt)
            .HasColumnName("recorded_at")
            .IsRequired();

        // Audit columns (BaseAuditableEntity)
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        // Indexes — time-series queries by user and verdict
        builder.HasIndex(x => x.RecordedAt);
        builder.HasIndex(x => new { x.UserId, x.RecordedAt });
        builder.HasIndex(x => x.Verdict);

        // FK → auth.users (nullable — user may not be authenticated yet on OTP-send)
        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Ignore(x => x.DomainEvents);
    }
}
