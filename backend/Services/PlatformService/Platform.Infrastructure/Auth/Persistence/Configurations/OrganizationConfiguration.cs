using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class OrganizationConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> builder)
    {
        builder.ToTable("organization");

        builder.HasKey(o => o.Id);
        builder.Property(o => o.Id).HasColumnName("id");
        builder.Property(o => o.OwnerUserId).HasColumnName("owner_user_id");
        builder.Property(o => o.BusinessName).HasColumnName("business_name").HasMaxLength(500);
        builder.Property(o => o.Gstin).HasColumnName("gstin").HasMaxLength(15);
        // DG-SEC-02 / SEC-013: org PAN is now AES-256-GCM encrypted at rest.
        // Ciphertext is base64-encoded and longer than plaintext — widened to VARCHAR(512)
        // matching auth.user_profile.pan_number (migration 040_widen_pan_number.sql).
        // The column is sized to accommodate the AES-GCM envelope (nonce + tag + ciphertext).
        builder.Property(o => o.PanNumber).HasColumnName("pan_number").HasMaxLength(512);
        builder.Property(o => o.BusinessType).HasColumnName("business_type").HasMaxLength(100);
        builder.Property(o => o.IndustryType).HasColumnName("industry_type").HasMaxLength(200);
        builder.Property(o => o.AnnualTurnoverInr).HasColumnName("annual_turnover_inr").HasColumnType("numeric(20,2)");
        builder.Property(o => o.RegistrationDate).HasColumnName("registration_date");
        builder.Property(o => o.AddressLine1).HasColumnName("address_line1").HasMaxLength(500);
        builder.Property(o => o.AddressLine2).HasColumnName("address_line2").HasMaxLength(500);
        builder.Property(o => o.City).HasColumnName("city").HasMaxLength(100);
        builder.Property(o => o.State).HasColumnName("state").HasMaxLength(100);
        builder.Property(o => o.Pincode).HasColumnName("pincode").HasMaxLength(10);
        builder.Property(o => o.Country).HasColumnName("country").HasMaxLength(100);
        builder.Property(o => o.IsGstRegistered).HasColumnName("is_gst_registered");
        builder.Property(o => o.IsMsmeRegistered).HasColumnName("is_msme_registered");
        builder.Property(o => o.MsmeUdyamNumber).HasColumnName("msme_udyam_number").HasMaxLength(50);
        builder.Property(o => o.LogoUrl).HasColumnName("logo_url");
        builder.Property(o => o.IsActive).HasColumnName("is_active");
        builder.Property(o => o.GovernmentVerificationEnabled)
            .HasColumnName("government_verification_enabled")
            .HasDefaultValue(false);
        builder.Property(o => o.CreatedAt).HasColumnName("created_at");
        builder.Property(o => o.UpdatedAt).HasColumnName("updated_at");
        builder.Property(o => o.DeletedAt).HasColumnName("deleted_at");
        builder.Property(o => o.CreatedBy).HasColumnName("created_by");
        builder.Property(o => o.UpdatedBy).HasColumnName("updated_by");

        builder.HasMany(o => o.Members)
            .WithOne()
            .HasForeignKey(m => m.OrganizationId);

        builder.Ignore(o => o.DomainEvents);
    }
}
