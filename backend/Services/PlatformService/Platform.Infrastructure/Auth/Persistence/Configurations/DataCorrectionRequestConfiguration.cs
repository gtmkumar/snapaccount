using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core config for <see cref="DataCorrectionRequest"/> → <c>auth.data_correction_request</c>.
/// </summary>
public class DataCorrectionRequestConfiguration : IEntityTypeConfiguration<DataCorrectionRequest>
{
    public void Configure(EntityTypeBuilder<DataCorrectionRequest> builder)
    {
        builder.ToTable("data_correction_request");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");
        builder.Property(r => r.UserId).HasColumnName("user_id");
        builder.Property(r => r.DataCategory).HasColumnName("data_category").HasMaxLength(100).IsRequired();
        builder.Property(r => r.Description).HasColumnName("description").HasMaxLength(2000).IsRequired();
        builder.Property(r => r.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        builder.Property(r => r.ReviewerNote).HasColumnName("reviewer_note").HasMaxLength(2000);
        builder.Property(r => r.ReviewedByUserId).HasColumnName("reviewed_by_user_id");
        builder.Property(r => r.ResolvedAt).HasColumnName("resolved_at");
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(r => r.UserId).HasDatabaseName("ix_data_correction_request_user_id");
        builder.HasIndex(r => new { r.UserId, r.Status }).HasDatabaseName("ix_data_correction_request_user_status");

        builder.Ignore(r => r.DomainEvents);
    }
}
