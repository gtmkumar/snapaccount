using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core config for <see cref="UserConsent"/> → <c>auth.user_consent</c>.
///
/// The table is append-only (DPDP Act audit trail). To determine the current
/// consent state for a given (user_id, purpose) pair, query the row with the
/// latest <c>action_at</c> / <c>created_at</c> and check <c>status</c>.
/// </summary>
public class UserConsentConfiguration : IEntityTypeConfiguration<UserConsent>
{
    public void Configure(EntityTypeBuilder<UserConsent> builder)
    {
        builder.ToTable("user_consent");

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");
        builder.Property(c => c.UserId).HasColumnName("user_id");
        builder.Property(c => c.Purpose).HasColumnName("purpose").HasMaxLength(200).IsRequired();
        builder.Property(c => c.PurposeDescription).HasColumnName("purpose_description").HasMaxLength(1000).IsRequired();
        builder.Property(c => c.NoticeVersion).HasColumnName("notice_version").HasMaxLength(50).IsRequired();
        builder.Property(c => c.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        builder.Property(c => c.ActionAt).HasColumnName("action_at");
        builder.Property(c => c.IpAddress).HasColumnName("ip_address").HasMaxLength(45);
        builder.Property(c => c.UserAgent).HasColumnName("user_agent").HasMaxLength(500);
        builder.Property(c => c.Locale).HasColumnName("locale").HasMaxLength(20).IsRequired();
        builder.Property(c => c.WithdrawnAt).HasColumnName("withdrawn_at");
        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");
        builder.Property(c => c.DeletedAt).HasColumnName("deleted_at");
        builder.Property(c => c.CreatedBy).HasColumnName("created_by");
        builder.Property(c => c.UpdatedBy).HasColumnName("updated_by");

        // Index for fast per-user lookups and for the "latest per purpose" query
        builder.HasIndex(c => c.UserId).HasDatabaseName("ix_user_consent_user_id");
        builder.HasIndex(c => new { c.UserId, c.Purpose, c.ActionAt })
            .HasDatabaseName("ix_user_consent_user_purpose_time");

        builder.Ignore(c => c.DomainEvents);
    }
}
