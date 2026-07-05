using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class UserProfileConfiguration : IEntityTypeConfiguration<UserProfile>
{
    public void Configure(EntityTypeBuilder<UserProfile> builder)
    {
        builder.ToTable("user_profile");

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");
        builder.Property(p => p.UserId).HasColumnName("user_id");
        builder.Property(p => p.UserType).HasColumnName("user_type").HasMaxLength(50);
        // SEC-013: PAN is stored AES-256 encrypted (Base64, IV+ciphertext). Migration 040
        // widened this column to varchar(512); keep the EF model in sync with the live schema.
        builder.Property(p => p.PanNumber).HasColumnName("pan_number").HasMaxLength(512);
        builder.Property(p => p.AadhaarLast4).HasColumnName("aadhaar_last4").HasMaxLength(4);
        builder.Property(p => p.DateOfBirth).HasColumnName("date_of_birth");
        builder.Property(p => p.Gender).HasColumnName("gender").HasMaxLength(20);
        builder.Property(p => p.AddressLine1).HasColumnName("address_line1").HasMaxLength(500);
        builder.Property(p => p.AddressLine2).HasColumnName("address_line2").HasMaxLength(500);
        builder.Property(p => p.City).HasColumnName("city").HasMaxLength(100);
        builder.Property(p => p.State).HasColumnName("state").HasMaxLength(100);
        builder.Property(p => p.Pincode).HasColumnName("pincode").HasMaxLength(10);
        builder.Property(p => p.Country).HasColumnName("country").HasMaxLength(100);
        builder.Property(p => p.ProfilePhotoUrl).HasColumnName("profile_photo_url");
        builder.Property(p => p.KycStatus).HasColumnName("kyc_status").HasMaxLength(50);
        builder.Property(p => p.KycVerifiedAt).HasColumnName("kyc_verified_at");
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.DeletedAt).HasColumnName("deleted_at");
        builder.Property(p => p.CreatedBy).HasColumnName("created_by");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");

        builder.Ignore(p => p.DomainEvents);
    }
}
