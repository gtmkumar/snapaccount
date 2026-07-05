using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class NavigationItemConfiguration : IEntityTypeConfiguration<NavigationItem>
{
    public void Configure(EntityTypeBuilder<NavigationItem> builder)
    {
        builder.ToTable("navigation_item");

        builder.HasKey(n => n.Id);
        builder.Property(n => n.Id).HasColumnName("id");
        builder.Property(n => n.Key).HasColumnName("key").HasMaxLength(100);
        builder.Property(n => n.ParentId).HasColumnName("parent_id");
        builder.Property(n => n.Label).HasColumnName("label").HasMaxLength(200);
        builder.Property(n => n.IconKey).HasColumnName("icon_key").HasMaxLength(100);
        builder.Property(n => n.Url).HasColumnName("url").HasMaxLength(300);
        builder.Property(n => n.DisplayOrder).HasColumnName("display_order");
        builder.Property(n => n.IsActive).HasColumnName("is_active");
        builder.Property(n => n.CreatedAt).HasColumnName("created_at");
        builder.Property(n => n.UpdatedAt).HasColumnName("updated_at");
        builder.Property(n => n.DeletedAt).HasColumnName("deleted_at");
        builder.Property(n => n.CreatedBy).HasColumnName("created_by");
        builder.Property(n => n.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(n => n.Key).IsUnique().HasFilter("deleted_at IS NULL");
        builder.HasIndex(n => n.ParentId);
        builder.Ignore(n => n.DomainEvents);
    }
}

public class MenuPermissionConfiguration : IEntityTypeConfiguration<MenuPermission>
{
    public void Configure(EntityTypeBuilder<MenuPermission> builder)
    {
        builder.ToTable("menu_permission");

        builder.HasKey(mp => mp.Id);
        builder.Property(mp => mp.Id).HasColumnName("id");
        builder.Property(mp => mp.MenuId).HasColumnName("menu_id");
        builder.Property(mp => mp.PermissionId).HasColumnName("permission_id");
        builder.Property(mp => mp.IsRequired).HasColumnName("is_required");
        builder.Property(mp => mp.CreatedAt).HasColumnName("created_at");
        builder.Property(mp => mp.UpdatedAt).HasColumnName("updated_at");
        builder.Property(mp => mp.DeletedAt).HasColumnName("deleted_at");
        builder.Property(mp => mp.CreatedBy).HasColumnName("created_by");
        builder.Property(mp => mp.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(mp => new { mp.MenuId, mp.PermissionId }).IsUnique();
        builder.HasOne(mp => mp.Permission)
            .WithMany()
            .HasForeignKey(mp => mp.PermissionId);
        builder.Ignore(mp => mp.DomainEvents);
    }
}
