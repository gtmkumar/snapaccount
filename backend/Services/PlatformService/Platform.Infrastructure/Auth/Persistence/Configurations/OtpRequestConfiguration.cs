using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class OtpRequestConfiguration : IEntityTypeConfiguration<OtpRequest>
{
    public void Configure(EntityTypeBuilder<OtpRequest> builder)
    {
        builder.ToTable("otp_request");

        builder.HasKey(o => o.Id);
        builder.Property(o => o.Id).HasColumnName("id");
        builder.Property(o => o.PhoneNumber).HasColumnName("phone_number").HasMaxLength(15);
        builder.Property(o => o.OtpType).HasColumnName("otp_type").HasMaxLength(50);
        builder.Property(o => o.OtpHash).HasColumnName("otp_hash").HasMaxLength(256);
        builder.Property(o => o.Attempts).HasColumnName("attempts");
        builder.Property(o => o.MaxAttempts).HasColumnName("max_attempts");
        // DG-AUTH-07: config-driven cooldown duration (minutes) stored per row.
        builder.Property(o => o.CooldownMinutes).HasColumnName("cooldown_minutes");
        builder.Property(o => o.IsUsed).HasColumnName("is_used");
        builder.Property(o => o.ExpiresAt).HasColumnName("expires_at");
        builder.Property(o => o.CooldownUntil).HasColumnName("cooldown_until");
        // ip_address is a Postgres `inet` column. Npgsql cannot bind a CLR string to inet,
        // so convert through System.Net.IPAddress (which Npgsql maps to inet). Null passes through.
        builder.Property(o => o.IpAddress)
            .HasColumnName("ip_address")
            .HasConversion(
                s => System.Net.IPAddress.Parse(s!),
                ip => ip.ToString());
        builder.Property(o => o.UserAgent).HasColumnName("user_agent");
        builder.Property(o => o.CreatedAt).HasColumnName("created_at");
        builder.Property(o => o.UpdatedAt).HasColumnName("updated_at");
        builder.Property(o => o.DeletedAt).HasColumnName("deleted_at");
        builder.Property(o => o.CreatedBy).HasColumnName("created_by");
        builder.Property(o => o.UpdatedBy).HasColumnName("updated_by");

        builder.Ignore(o => o.DomainEvents);
    }
}
