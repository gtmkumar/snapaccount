using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NotificationService.Domain.Entities;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="PushToken"/> to <c>notification.device_push_token</c>
/// (created by SQL migration 008 — SQL is canonical, no EF migrations).
///
/// Column reconciliation:
///   Token → push_token.
///   Platform is a lowercase string on the entity ("ios"/"android") but the SQL CHECK
///   requires UPPER ('ANDROID','IOS','WEB'); a converter upper-cases on write and
///   lower-cases on read so writes satisfy the CHECK constraint.
/// </summary>
public sealed class PushTokenConfiguration : IEntityTypeConfiguration<PushToken>
{
    public void Configure(EntityTypeBuilder<PushToken> builder)
    {
        builder.ToTable("device_push_token", "notification");
        builder.HasKey(t => t.Id);

        builder.Property(t => t.Id).HasColumnName("id");
        builder.Property(t => t.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(t => t.DeviceId).HasColumnName("device_id").HasMaxLength(256).IsRequired();
        builder.Property(t => t.Token).HasColumnName("push_token").IsRequired();

        // platform VARCHAR(20) + CHECK ('ANDROID','IOS','WEB'). Entity holds "ios"/"android".
        builder.Property(t => t.Platform).HasColumnName("platform")
            .HasConversion(PlatformConverter).HasMaxLength(20).IsRequired();

        builder.Property(t => t.IsActive).HasColumnName("is_active").IsRequired();

        builder.Property(t => t.CreatedAt).HasColumnName("created_at");
        builder.Property(t => t.UpdatedAt).HasColumnName("updated_at");
        builder.Property(t => t.DeletedAt).HasColumnName("deleted_at");
        builder.Property(t => t.CreatedBy).HasColumnName("created_by");
        builder.Property(t => t.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(t => new { t.UserId, t.DeviceId }).IsUnique();

        builder.HasQueryFilter(t => t.DeletedAt == null);
    }

    /// <summary>Entity lowercase platform &lt;-&gt; SQL UPPER CHECK vocabulary.</summary>
    private static readonly ValueConverter<string, string> PlatformConverter =
        new(v => v.ToUpperInvariant(), v => v.ToLowerInvariant());
}
