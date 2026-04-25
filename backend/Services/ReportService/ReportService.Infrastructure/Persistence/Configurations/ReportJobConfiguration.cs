using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for the ReportJob entity → report.report_jobs table.</summary>
public sealed class ReportJobConfiguration : IEntityTypeConfiguration<ReportJob>
{
    public void Configure(EntityTypeBuilder<ReportJob> builder)
    {
        builder.ToTable("report_jobs", "report");

        builder.HasKey(j => j.Id);
        builder.Property(j => j.Id).HasColumnName("id");

        builder.Property(j => j.OrgId).HasColumnName("org_id").IsRequired();
        builder.Property(j => j.RequestedBy).HasColumnName("requested_by").HasMaxLength(128);
        builder.Property(j => j.ReportType).HasColumnName("report_type").HasConversion<string>().HasMaxLength(50);
        builder.Property(j => j.Format).HasColumnName("format").HasConversion<string>().HasMaxLength(20);
        builder.Property(j => j.FinancialYear).HasColumnName("financial_year").HasMaxLength(10);
        builder.Property(j => j.PeriodStart).HasColumnName("period_start");
        builder.Property(j => j.PeriodEnd).HasColumnName("period_end");
        builder.Property(j => j.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(30);
        builder.Property(j => j.GcsUri).HasColumnName("gcs_uri").HasMaxLength(500);
        builder.Property(j => j.Sha256HashHex).HasColumnName("sha256_hash_hex").HasMaxLength(64);
        builder.Property(j => j.PageCount).HasColumnName("page_count");
        builder.Property(j => j.ErrorMessage).HasColumnName("error_message").HasMaxLength(2000);
        builder.Property(j => j.StartedAt).HasColumnName("started_at");
        builder.Property(j => j.CompletedAt).HasColumnName("completed_at");
        builder.Property(j => j.LoanApplicationId).HasColumnName("loan_application_id");
        builder.Property(j => j.DeletedAt).HasColumnName("deleted_at");

        // Audit columns
        builder.Property(j => j.CreatedAt).HasColumnName("created_at");
        builder.Property(j => j.UpdatedAt).HasColumnName("updated_at");

        // Indexes
        builder.HasIndex(j => j.OrgId).HasDatabaseName("ix_report_jobs_org_id");
        builder.HasIndex(j => j.Status).HasDatabaseName("ix_report_jobs_status");
        builder.HasIndex(j => new { j.OrgId, j.ReportType, j.CreatedAt })
            .HasDatabaseName("ix_report_jobs_org_type_created");

        // Soft-delete global filter
        builder.HasQueryFilter(j => j.DeletedAt == null);
    }
}
