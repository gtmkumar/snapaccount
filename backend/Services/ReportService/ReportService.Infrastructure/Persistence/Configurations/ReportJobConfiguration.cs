using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ReportService.Domain.Entities;

namespace ReportService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the ReportJob entity.
/// SWEEP-FIX WEB-06: report.report_jobs does not exist. Mapped to report.report (closest match).
///
/// Column reconciliation (report.report → ReportJob property):
///   organization_id → OrgId, user_id → RequestedBy (uuid→string coercion via Npgsql),
///   report_type → ReportType, financial_year → FinancialYear, period_start/end OK,
///   status OK, storage_path → GcsUri, page_count OK, error_message OK,
///   generated_at → CompletedAt.
///
/// Ignored (no column in report.report): Format, Sha256HashHex, StartedAt, LoanApplicationId.
/// DDL HANDOFF: db-engineer should add these columns or create report.report_jobs view.
/// </summary>
public sealed class ReportJobConfiguration : IEntityTypeConfiguration<ReportJob>
{
    public void Configure(EntityTypeBuilder<ReportJob> builder)
    {
        // SWEEP-FIX WEB-06: map to report.report (report.report_jobs does not exist).
        builder.ToTable("report", "report");

        builder.HasKey(j => j.Id);
        builder.Property(j => j.Id).HasColumnName("id");

        builder.Property(j => j.OrgId).HasColumnName("organization_id").IsRequired();
        // user_id is uuid in DB; RequestedBy is string — Npgsql coerces on read.
        builder.Property(j => j.RequestedBy).HasColumnName("user_id").HasMaxLength(128);
        builder.Property(j => j.ReportType).HasColumnName("report_type").HasConversion<string>().HasMaxLength(100);
        builder.Property(j => j.FinancialYear).HasColumnName("financial_year").HasMaxLength(10);
        builder.Property(j => j.PeriodStart).HasColumnName("period_start");
        builder.Property(j => j.PeriodEnd).HasColumnName("period_end");
        builder.Property(j => j.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(30);
        // storage_path is the GCS URI column in report.report.
        builder.Property(j => j.GcsUri).HasColumnName("storage_path");
        builder.Property(j => j.PageCount).HasColumnName("page_count");
        builder.Property(j => j.ErrorMessage).HasColumnName("error_message");
        // generated_at is the closest to CompletedAt.
        builder.Property(j => j.CompletedAt).HasColumnName("generated_at");

        builder.Property(j => j.DeletedAt).HasColumnName("deleted_at");
        builder.Property(j => j.CreatedAt).HasColumnName("created_at");
        builder.Property(j => j.UpdatedAt).HasColumnName("updated_at");
        builder.Property(j => j.CreatedBy).HasColumnName("created_by");
        builder.Property(j => j.UpdatedBy).HasColumnName("updated_by");

        // Ignored: no corresponding column in report.report.
        builder.Ignore(j => j.Format);
        builder.Ignore(j => j.Sha256HashHex);
        builder.Ignore(j => j.StartedAt);
        builder.Ignore(j => j.LoanApplicationId);

        // report.report has title NOT NULL — configure shadow property with a default
        // so INSERT does not violate the constraint. GenerateReportCommand sets this via
        // EF.Property<string>(job, "Title") or the DB default after DDL handoff.
        builder.Property<string>("Title")
            .HasColumnName("title")
            .HasMaxLength(500)
            .IsRequired()
            .HasDefaultValue("Report");

        // Indexes.
        builder.HasIndex(j => j.OrgId).HasDatabaseName("idx_report_org_id");
        builder.HasIndex(j => j.Status).HasDatabaseName("idx_report_status");

        // Soft-delete global filter.
        builder.HasQueryFilter(j => j.DeletedAt == null);
    }
}
