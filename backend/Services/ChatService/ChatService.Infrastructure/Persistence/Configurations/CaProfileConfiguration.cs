using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for chat.ca_profiles table (migration 080).
/// created_by / updated_by are uuid in DDL — BaseDbContext applies GuidStringConverter globally.
/// </summary>
public sealed class CaProfileConfiguration : IEntityTypeConfiguration<CaProfile>
{
    public void Configure(EntityTypeBuilder<CaProfile> builder)
    {
        builder.ToTable("ca_profiles");

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");

        builder.Property(p => p.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(p => p.DisplayName)
            .HasColumnName("display_name")
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(p => p.Bio)
            .HasColumnName("bio")
            .HasMaxLength(1000);

        builder.Property(p => p.Specialisations)
            .HasColumnName("specialisations")
            .HasMaxLength(500);

        builder.Property(p => p.AverageRating)
            .HasColumnName("average_rating")
            .HasPrecision(3, 2)
            .IsRequired();

        builder.Property(p => p.RatingCount)
            .HasColumnName("rating_count")
            .IsRequired();

        builder.Property(p => p.IsActive)
            .HasColumnName("is_active")
            .IsRequired();

        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.DeletedAt).HasColumnName("deleted_at");
        builder.Property(p => p.CreatedBy).HasColumnName("created_by");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");

        builder.HasMany(p => p.Slots)
            .WithOne()
            .HasForeignKey(s => s.CaProfileId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(p => p.UserId).IsUnique().HasDatabaseName("uq_ca_profiles_user_id");
        builder.HasIndex(p => p.IsActive).HasDatabaseName("ix_ca_profiles_is_active");

        builder.HasQueryFilter(p => p.DeletedAt == null);
    }
}
