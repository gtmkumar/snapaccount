using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AuthService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core config for <see cref="DataExportRequest"/> → <c>auth.data_export_request</c>.
/// </summary>
public class DataExportRequestConfiguration : IEntityTypeConfiguration<DataExportRequest>
{
    public void Configure(EntityTypeBuilder<DataExportRequest> builder)
    {
        builder.ToTable("data_export_request");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");
        builder.Property(r => r.UserId).HasColumnName("user_id");
        builder.Property(r => r.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        builder.Property(r => r.GcsObjectPath).HasColumnName("gcs_object_path").HasMaxLength(500);
        builder.Property(r => r.DownloadUrl).HasColumnName("download_url").HasMaxLength(2000);
        builder.Property(r => r.DownloadUrlExpiresAt).HasColumnName("download_url_expires_at");
        builder.Property(r => r.ErrorMessage).HasColumnName("error_message").HasMaxLength(1000);
        builder.Property(r => r.HangfireJobId).HasColumnName("hangfire_job_id").HasMaxLength(100);
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(r => r.UserId).HasDatabaseName("ix_data_export_request_user_id");
        builder.HasIndex(r => new { r.UserId, r.Status }).HasDatabaseName("ix_data_export_request_user_status");

        builder.Ignore(r => r.DomainEvents);
    }
}
