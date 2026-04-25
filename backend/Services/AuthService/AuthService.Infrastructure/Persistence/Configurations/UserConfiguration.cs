using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("user");

        builder.HasKey(u => u.Id);
        builder.Property(u => u.Id).HasColumnName("id");
        builder.Property(u => u.FirebaseUid).HasColumnName("firebase_uid").HasMaxLength(128);
        builder.Property(u => u.PhoneNumber).HasColumnName("phone_number").HasMaxLength(15);
        builder.Property(u => u.Email).HasColumnName("email").HasMaxLength(320);
        builder.Property(u => u.FullName).HasColumnName("full_name").HasMaxLength(300);
        builder.Property(u => u.IsPhoneVerified).HasColumnName("is_phone_verified");
        builder.Property(u => u.IsEmailVerified).HasColumnName("is_email_verified");
        builder.Property(u => u.IsActive).HasColumnName("is_active");
        builder.Property(u => u.IsDeleted).HasColumnName("is_deleted");
        builder.Property(u => u.PreferredLanguage).HasColumnName("preferred_language").HasMaxLength(20);
        builder.Property(u => u.LastLoginAt).HasColumnName("last_login_at");
        builder.Property(u => u.CreatedAt).HasColumnName("created_at");
        builder.Property(u => u.UpdatedAt).HasColumnName("updated_at");
        builder.Property(u => u.DeletedAt).HasColumnName("deleted_at");
        builder.Property(u => u.CreatedBy).HasColumnName("created_by");
        builder.Property(u => u.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(u => u.FirebaseUid).IsUnique().HasFilter("firebase_uid IS NOT NULL");
        builder.HasIndex(u => u.PhoneNumber).IsUnique().HasFilter("phone_number IS NOT NULL");

        builder.HasOne(u => u.Profile)
            .WithOne()
            .HasForeignKey<UserProfile>(p => p.UserId);

        builder.HasOne(u => u.Preference)
            .WithOne()
            .HasForeignKey<UserPreference>(p => p.UserId);

        builder.HasMany(u => u.Devices)
            .WithOne()
            .HasForeignKey(d => d.UserId);

        builder.HasMany(u => u.Roles)
            .WithOne()
            .HasForeignKey(r => r.UserId);

        // Ignore domain events collection from EF
        builder.Ignore(u => u.DomainEvents);
    }
}
