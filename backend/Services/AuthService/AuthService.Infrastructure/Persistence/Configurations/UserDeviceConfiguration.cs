using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class UserDeviceConfiguration : IEntityTypeConfiguration<UserDevice>
{
    public void Configure(EntityTypeBuilder<UserDevice> builder)
    {
        builder.ToTable("user_device");

        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).HasColumnName("id");
        builder.Property(d => d.UserId).HasColumnName("user_id");
        builder.Property(d => d.DeviceId).HasColumnName("device_id").HasMaxLength(256);
        builder.Property(d => d.DeviceName).HasColumnName("device_name").HasMaxLength(200);
        builder.Property(d => d.Platform).HasColumnName("platform").HasMaxLength(20);
        builder.Property(d => d.OsVersion).HasColumnName("os_version").HasMaxLength(50);
        builder.Property(d => d.AppVersion).HasColumnName("app_version").HasMaxLength(50);
        builder.Property(d => d.FcmToken).HasColumnName("fcm_token");
        builder.Property(d => d.IsActive).HasColumnName("is_active");
        builder.Property(d => d.LastActiveAt).HasColumnName("last_active_at");
        builder.Property(d => d.BoundAt).HasColumnName("bound_at");
        builder.Property(d => d.CreatedAt).HasColumnName("created_at");
        builder.Property(d => d.UpdatedAt).HasColumnName("updated_at");
        builder.Property(d => d.DeletedAt).HasColumnName("deleted_at");
        builder.Property(d => d.CreatedBy).HasColumnName("created_by");
        builder.Property(d => d.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(d => new { d.UserId, d.DeviceId }).IsUnique();
        builder.Ignore(d => d.DomainEvents);
    }
}
