using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity type configuration for <see cref="UserPermission"/> → <c>auth.user_permission</c>.
///
/// Migration 038 unique partial index:
///   uq_user_permission_scope = (user_id, permission_id, COALESCE(organization_id, '00000000-...'))
///   WHERE deleted_at IS NULL
///
/// EF cannot express a COALESCE-based functional index; we name the index in the
/// migration SQL and tell EF about the plain composite index here (without the COALESCE)
/// so it does not try to create a conflicting one.
/// </summary>
public class UserPermissionConfiguration : IEntityTypeConfiguration<UserPermission>
{
    public void Configure(EntityTypeBuilder<UserPermission> builder)
    {
        builder.ToTable("user_permission");

        builder.HasKey(up => up.Id);
        builder.Property(up => up.Id).HasColumnName("id");
        builder.Property(up => up.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(up => up.PermissionId).HasColumnName("permission_id").IsRequired();
        builder.Property(up => up.OrganizationId).HasColumnName("organization_id");
        builder.Property(up => up.GrantedByUserId).HasColumnName("granted_by_user_id").IsRequired();
        builder.Property(up => up.IsAllowed).HasColumnName("is_allowed");
        builder.Property(up => up.CreatedAt).HasColumnName("created_at");
        builder.Property(up => up.UpdatedAt).HasColumnName("updated_at");
        builder.Property(up => up.DeletedAt).HasColumnName("deleted_at");
        builder.Property(up => up.CreatedBy).HasColumnName("created_by");
        builder.Property(up => up.UpdatedBy).HasColumnName("updated_by");

        // The functional COALESCE index is owned by migration 038.
        // We only declare a supporting index on user_id for efficient per-user lookups.
        builder.HasIndex(up => up.UserId)
            .HasDatabaseName("ix_user_permission_user_id");

        builder.HasIndex(up => up.PermissionId)
            .HasDatabaseName("ix_user_permission_permission_id");

        // Navigation: permission → needed for effective-perm resolution joins
        builder.HasOne(up => up.Permission)
            .WithMany()
            .HasForeignKey(up => up.PermissionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Ignore(up => up.DomainEvents);
    }
}
