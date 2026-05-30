using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.ToTable("role");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");
        builder.Property(r => r.Name).HasColumnName("name").HasMaxLength(100);
        builder.Property(r => r.DisplayName).HasColumnName("display_name").HasMaxLength(200);
        builder.Property(r => r.Description).HasColumnName("description");
        builder.Property(r => r.IsSystemRole).HasColumnName("is_system_role");
        // Org-scoped custom roles: NULL = platform role; non-NULL = org custom role
        builder.Property(r => r.OrganizationId).HasColumnName("organization_id");
        builder.Property(r => r.CreatedByUserId).HasColumnName("created_by_user_id");
        builder.Property(r => r.IsActive).HasColumnName("is_active");
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        // System roles must have globally unique names; custom roles unique per org
        builder.HasIndex(r => r.Name).IsUnique().HasFilter("organization_id IS NULL");
        builder.HasIndex(r => new { r.OrganizationId, r.Name }).IsUnique().HasFilter("organization_id IS NOT NULL");
        builder.HasIndex(r => r.OrganizationId);
        builder.Ignore(r => r.DomainEvents);
    }
}

public class PermissionConfiguration : IEntityTypeConfiguration<Permission>
{
    public void Configure(EntityTypeBuilder<Permission> builder)
    {
        builder.ToTable("permission");

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");
        builder.Property(p => p.Name).HasColumnName("name").HasMaxLength(200);
        builder.Property(p => p.Resource).HasColumnName("resource").HasMaxLength(100);
        builder.Property(p => p.Action).HasColumnName("action").HasMaxLength(100);
        builder.Property(p => p.Description).HasColumnName("description");
        // I1.1 (migration 037): is_active column — RETIRED vs ACTIVE distinction
        builder.Property(p => p.IsActive).HasColumnName("is_active");
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.DeletedAt).HasColumnName("deleted_at");
        builder.Property(p => p.CreatedBy).HasColumnName("created_by");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");

        // I1.1-002: case-insensitive uniqueness — Postgres lower() functional index
        builder.HasIndex(p => p.Name)
            .IsUnique()
            .HasDatabaseName("ix_permission_name_ci");
        builder.Ignore(p => p.DomainEvents);
    }
}

public class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> builder)
    {
        builder.ToTable("role_permission");

        builder.HasKey(rp => rp.Id);
        builder.Property(rp => rp.Id).HasColumnName("id");
        builder.Property(rp => rp.RoleId).HasColumnName("role_id");
        builder.Property(rp => rp.PermissionId).HasColumnName("permission_id");
        builder.Property(rp => rp.CreatedAt).HasColumnName("created_at");
        builder.Property(rp => rp.UpdatedAt).HasColumnName("updated_at");
        builder.Property(rp => rp.DeletedAt).HasColumnName("deleted_at");
        builder.Property(rp => rp.CreatedBy).HasColumnName("created_by");
        builder.Property(rp => rp.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(rp => new { rp.RoleId, rp.PermissionId }).IsUnique();
        builder.Ignore(rp => rp.DomainEvents);
    }
}

public class UserRoleConfiguration : IEntityTypeConfiguration<UserRole>
{
    public void Configure(EntityTypeBuilder<UserRole> builder)
    {
        builder.ToTable("user_role");

        builder.HasKey(ur => ur.Id);
        builder.Property(ur => ur.Id).HasColumnName("id");
        builder.Property(ur => ur.UserId).HasColumnName("user_id");
        builder.Property(ur => ur.RoleId).HasColumnName("role_id");
        builder.Property(ur => ur.IsActive).HasColumnName("is_active");
        builder.Property(ur => ur.CreatedAt).HasColumnName("created_at");
        builder.Property(ur => ur.UpdatedAt).HasColumnName("updated_at");
        builder.Property(ur => ur.DeletedAt).HasColumnName("deleted_at");
        builder.Property(ur => ur.CreatedBy).HasColumnName("created_by");
        builder.Property(ur => ur.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(ur => new { ur.UserId, ur.RoleId }).IsUnique();
        builder.Ignore(ur => ur.DomainEvents);
    }
}

public class OrganizationMemberConfiguration : IEntityTypeConfiguration<OrganizationMember>
{
    public void Configure(EntityTypeBuilder<OrganizationMember> builder)
    {
        builder.ToTable("organization_member");

        builder.HasKey(m => m.Id);
        builder.Property(m => m.Id).HasColumnName("id");
        builder.Property(m => m.OrganizationId).HasColumnName("organization_id");
        builder.Property(m => m.UserId).HasColumnName("user_id");
        builder.Property(m => m.RoleId).HasColumnName("role_id");
        builder.Property(m => m.IsActive).HasColumnName("is_active");
        builder.Property(m => m.JoinedAt).HasColumnName("joined_at");
        builder.Property(m => m.CreatedAt).HasColumnName("created_at");
        builder.Property(m => m.UpdatedAt).HasColumnName("updated_at");
        builder.Property(m => m.DeletedAt).HasColumnName("deleted_at");
        builder.Property(m => m.CreatedBy).HasColumnName("created_by");
        builder.Property(m => m.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(m => new { m.OrganizationId, m.UserId }).IsUnique();
        builder.Ignore(m => m.DomainEvents);
    }
}

public class UserPreferenceConfiguration : IEntityTypeConfiguration<UserPreference>
{
    public void Configure(EntityTypeBuilder<UserPreference> builder)
    {
        builder.ToTable("user_preference");

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");
        builder.Property(p => p.UserId).HasColumnName("user_id");
        builder.Property(p => p.PreferredLanguage).HasColumnName("preferred_language").HasMaxLength(20);
        builder.Property(p => p.Theme).HasColumnName("theme").HasMaxLength(20);
        builder.Property(p => p.PushNotificationsEnabled).HasColumnName("push_notifications_enabled");
        builder.Property(p => p.SmsNotificationsEnabled).HasColumnName("sms_notifications_enabled");
        builder.Property(p => p.EmailNotificationsEnabled).HasColumnName("email_notifications_enabled");
        builder.Property(p => p.WhatsappNotificationsEnabled).HasColumnName("whatsapp_notifications_enabled");
        builder.Property(p => p.CreatedAt).HasColumnName("created_at");
        builder.Property(p => p.UpdatedAt).HasColumnName("updated_at");
        builder.Property(p => p.DeletedAt).HasColumnName("deleted_at");
        builder.Property(p => p.CreatedBy).HasColumnName("created_by");
        builder.Property(p => p.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(p => p.UserId).IsUnique();
        builder.Ignore(p => p.DomainEvents);
    }
}
