using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="DeviceApprovalRequest"/>
/// → <c>auth.device_approval_requests</c>.
/// GAP-047 (migration 083).
/// </summary>
public sealed class DeviceApprovalRequestConfiguration : IEntityTypeConfiguration<DeviceApprovalRequest>
{
    public void Configure(EntityTypeBuilder<DeviceApprovalRequest> builder)
    {
        builder.ToTable("device_approval_requests");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.NewDeviceId).HasColumnName("new_device_id").IsRequired();
        builder.Property(x => x.NewDeviceIdentifier)
            .HasColumnName("new_device_identifier")
            .HasMaxLength(256)
            .IsRequired();
        builder.Property(x => x.NewDeviceName)
            .HasColumnName("new_device_name")
            .HasMaxLength(200);
        builder.Property(x => x.NewDevicePlatform)
            .HasColumnName("new_device_platform")
            .HasMaxLength(20)
            .IsRequired();
        builder.Property(x => x.ExpiresAt).HasColumnName("expires_at").IsRequired();
        builder.Property(x => x.Status)
            .HasColumnName("status")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        builder.Property(x => x.ReviewedByDeviceId).HasColumnName("reviewed_by_device_id");
        builder.Property(x => x.ReviewedAt).HasColumnName("reviewed_at");
        builder.Property(x => x.DenialReason).HasColumnName("denial_reason").HasMaxLength(500);
        builder.Property(x => x.NewDeviceSessionTokenId).HasColumnName("new_device_session_token_id");

        // Audit columns (UUID — not varchar, past bug class)
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        // Indexes
        builder.HasIndex(x => new { x.UserId, x.Status });
        builder.HasIndex(x => x.NewDeviceId);
        builder.HasIndex(x => x.ExpiresAt);

        // FK → auth.users
        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // FK → auth.user_device
        builder.HasOne<UserDevice>()
            .WithMany()
            .HasForeignKey(x => x.NewDeviceId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Ignore(x => x.DomainEvents);
    }
}
