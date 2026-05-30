using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity type configuration for <see cref="ReferenceData"/> → <c>auth.reference_data</c>.
///
/// The unique partial index on (category, code) WHERE deleted_at IS NULL is owned by
/// migration 039.  EF declares a supporting composite index for efficient lookups.
/// </summary>
public class ReferenceDataConfiguration : IEntityTypeConfiguration<ReferenceData>
{
    public void Configure(EntityTypeBuilder<ReferenceData> builder)
    {
        builder.ToTable("reference_data");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");
        builder.Property(r => r.Category).HasColumnName("category").HasMaxLength(50).IsRequired();
        builder.Property(r => r.Code).HasColumnName("code").HasMaxLength(100).IsRequired();
        builder.Property(r => r.Name).HasColumnName("name").HasMaxLength(300).IsRequired();
        builder.Property(r => r.ParentCode).HasColumnName("parent_code").HasMaxLength(100);
        builder.Property(r => r.IsActive).HasColumnName("is_active");
        builder.Property(r => r.SortOrder).HasColumnName("sort_order");
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        // Supporting index for category-filtered queries (used by GET /auth/reference-data?category=)
        builder.HasIndex(r => r.Category)
            .HasDatabaseName("ix_reference_data_category");

        // Supporting composite index for uniqueness lookups before insert
        builder.HasIndex(r => new { r.Category, r.Code })
            .HasDatabaseName("ix_reference_data_category_code");

        builder.Ignore(r => r.DomainEvents);
    }
}
