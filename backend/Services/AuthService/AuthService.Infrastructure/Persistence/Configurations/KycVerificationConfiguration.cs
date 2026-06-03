using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class KycVerificationConfiguration : IEntityTypeConfiguration<KycVerification>
{
    public void Configure(EntityTypeBuilder<KycVerification> builder)
    {
        builder.ToTable("kyc_verification");

        builder.HasKey(k => k.Id);
        builder.Property(k => k.Id).HasColumnName("id");
        builder.Property(k => k.UserId).HasColumnName("user_id");
        builder.Property(k => k.Kind).HasColumnName("kind").HasMaxLength(20).IsRequired();
        builder.Property(k => k.ReferenceNumber).HasColumnName("reference_number").HasMaxLength(100).IsRequired();
        builder.Property(k => k.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        builder.Property(k => k.Provider).HasColumnName("provider").HasMaxLength(50);
        builder.Property(k => k.ProviderRef).HasColumnName("provider_ref").HasMaxLength(100);
        builder.Property(k => k.VerifiedAt).HasColumnName("verified_at");
        builder.Property(k => k.CreatedAt).HasColumnName("created_at");
        builder.Property(k => k.UpdatedAt).HasColumnName("updated_at");
        builder.Property(k => k.DeletedAt).HasColumnName("deleted_at");
        builder.Property(k => k.CreatedBy).HasColumnName("created_by");
        builder.Property(k => k.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(k => k.UserId);
        builder.HasIndex(k => new { k.UserId, k.Kind });

        builder.Ignore(k => k.DomainEvents);
    }
}
