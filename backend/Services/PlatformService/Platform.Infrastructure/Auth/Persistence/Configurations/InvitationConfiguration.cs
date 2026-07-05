using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity type configuration for <see cref="Invitation"/> → <c>auth.invitation</c>.</summary>
public class InvitationConfiguration : IEntityTypeConfiguration<Invitation>
{
    public void Configure(EntityTypeBuilder<Invitation> builder)
    {
        builder.ToTable("invitation");

        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasColumnName("id");
        builder.Property(i => i.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(i => i.Email).HasColumnName("email").HasMaxLength(320).IsRequired();
        builder.Property(i => i.PhoneNumber).HasColumnName("phone_number").HasMaxLength(20);
        builder.Property(i => i.RoleId).HasColumnName("role_id").IsRequired();
        builder.Property(i => i.InvitedByUserId).HasColumnName("invited_by_user_id").IsRequired();
        builder.Property(i => i.TokenHash).HasColumnName("token_hash").HasMaxLength(256).IsRequired();
        builder.Property(i => i.AcceptedUserId).HasColumnName("accepted_user_id");
        // BUG-E2E-INVITE-500: DB CHECK constraint requires UPPERCASE tokens
        // ('PENDING','ACCEPTED','REVOKED','EXPIRED'). HasConversion<string>() would
        // produce PascalCase ("Pending") and violate the constraint. Use an explicit
        // value converter that maps to/from the uppercase DB tokens.
        builder.Property(i => i.Status)
            .HasColumnName("status")
            .HasConversion(
                v => v.ToString().ToUpperInvariant(),
                v => Enum.Parse<InvitationStatus>(v, ignoreCase: true))
            .HasMaxLength(20)
            .IsRequired();
        builder.Property(i => i.ExpiresAt).HasColumnName("expires_at").IsRequired();
        builder.Property(i => i.AcceptedAt).HasColumnName("accepted_at");
        builder.Property(i => i.CreatedAt).HasColumnName("created_at");
        builder.Property(i => i.UpdatedAt).HasColumnName("updated_at");
        builder.Property(i => i.DeletedAt).HasColumnName("deleted_at");
        builder.Property(i => i.CreatedBy).HasColumnName("created_by");
        builder.Property(i => i.UpdatedBy).HasColumnName("updated_by");

        // TokenHash is the lookup key for invite acceptance — must be unique
        builder.HasIndex(i => i.TokenHash).IsUnique();
        // Efficient lookup of all invites for an org
        builder.HasIndex(i => i.OrganizationId);
        // Prevent duplicate pending invites to the same email+org
        builder.HasIndex(i => new { i.OrganizationId, i.Email });

        // Navigation: invitation belongs to an organization and a role
        builder.HasOne(i => i.Organization)
            .WithMany()
            .HasForeignKey(i => i.OrganizationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(i => i.Role)
            .WithMany()
            .HasForeignKey(i => i.RoleId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Ignore(i => i.DomainEvents);
    }
}
