using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace ReportService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the ReportJob entity mapped to report.report.
/// SWEEP-FIX WEB-06: report.report_jobs does not exist — mapped to report.report.
///
/// Write-path audit (2026-06-12) — every NOT NULL column verified against pg_attrdef:
///   report_type      — NOT NULL, NO default → written by handler (always set on new ReportJob)
///   title            — NOT NULL, NO default → written via Title shadow property set in handler
///   status           — NOT NULL, DB default 'QUEUED' → safe; EF writes via UpperSnakeEnumConverter
///   created_at       — NOT NULL, DB default now() → safe (AuditableEntityInterceptor also writes)
///   updated_at       — NOT NULL, DB default now() → safe
///
/// Type audit — uuid columns verified against pg_attrdef (42804 risk if mapped as string/varchar):
///   user_id          uuid nullable → RequestedBy (Guid?) — FIXED from string HasMaxLength(128)
///   organization_id  uuid nullable → OrgId (Guid) — OK
///   created_by       uuid nullable → CreatedBy (string?) via BaseDbContext.GuidStringConverter
///   updated_by       uuid nullable → UpdatedBy (string?) via BaseDbContext.GuidStringConverter
///
/// Column reconciliation (report.report → ReportJob property):
///   organization_id → OrgId, user_id → RequestedBy, report_type → ReportType,
///   financial_year → FinancialYear (varchar(40) post-migration-088),
///   period_start/end → PeriodStart/PeriodEnd (date columns, HasColumnType("date")),
///   status → Status, storage_path → GcsUri, page_count → PageCount,
///   error_message → ErrorMessage, generated_at → CompletedAt.
///
/// Ignored (no column in report.report): Format, Sha256HashHex, StartedAt, LoanApplicationId.
/// </summary>
public sealed class ReportJobConfiguration : IEntityTypeConfiguration<ReportJob>
{
    public void Configure(EntityTypeBuilder<ReportJob> builder)
    {
        builder.ToTable("report", "report");

        builder.HasKey(j => j.Id);
        builder.Property(j => j.Id).HasColumnName("id");

        // organization_id: uuid nullable → Guid — no conversion needed.
        builder.Property(j => j.OrgId).HasColumnName("organization_id").IsRequired();

        // user_id: uuid nullable. Previously mapped as string HasMaxLength(128) → 42804.
        // Fixed: RequestedBy is now Guid? — Npgsql sends a uuid parameter, no type mismatch.
        // Handler sets RequestedBy = currentUser.UserId (Guid), not .ToString().
        builder.Property(j => j.RequestedBy).HasColumnName("user_id");

        // report_type: varchar(100), NOT NULL, NO default. UpperSnakeEnumConverter produces
        // TRIAL_BALANCE, PROFIT_AND_LOSS, etc. HasConversion<string>() wrote PascalCase → wrong.
        builder.Property(j => j.ReportType)
            .HasColumnName("report_type")
            .HasConversion(new UpperSnakeEnumConverter<ReportType>())
            .HasMaxLength(100)
            .IsRequired();

        // financial_year: varchar(40) after migration 088 (was 10). Widened to allow the
        // 36-char UUID that ChatThreadPdf encodes as the thread ID (GAP-043).
        builder.Property(j => j.FinancialYear).HasColumnName("financial_year").HasMaxLength(40);

        // period_start/end: DB type is date (not timestamptz). HasColumnType("date") forces
        // Npgsql to bind a date-typed parameter, avoiding implicit cast errors on write.
        builder.Property(j => j.PeriodStart).HasColumnName("period_start").HasColumnType("date");
        builder.Property(j => j.PeriodEnd).HasColumnName("period_end").HasColumnType("date");

        // status: NOT NULL, DB default 'QUEUED'. UpperSnakeEnumConverter serialises
        // ReportJobStatus.Queued → "QUEUED", matching the CHECK constraint after migration 088.
        // HasConversion<string>() produced "Queued" (PascalCase) → CHECK violation → 500.
        builder.Property(j => j.Status)
            .HasColumnName("status")
            .HasConversion(new UpperSnakeEnumConverter<ReportJobStatus>())
            .HasMaxLength(30)
            .IsRequired();

        builder.Property(j => j.GcsUri).HasColumnName("storage_path");
        builder.Property(j => j.PageCount).HasColumnName("page_count");
        builder.Property(j => j.ErrorMessage).HasColumnName("error_message");
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

        // title: NOT NULL, NO DB default. Mapped as a real entity property (not shadow) so the
        // Application layer handler can set it directly without EF-specific APIs.
        // DO NOT use HasDefaultValue — that causes EF to OMIT the column on INSERT when the CLR
        // value equals the default, and Postgres then raises 23502 (no server-side DEFAULT exists).
        // Handler derives the value from ReportType + FinancialYear before SaveChanges.
        builder.Property(j => j.Title)
            .HasColumnName("title")
            .HasMaxLength(500)
            .IsRequired();

        // Indexes.
        builder.HasIndex(j => j.OrgId).HasDatabaseName("idx_report_org_id");
        builder.HasIndex(j => j.Status).HasDatabaseName("idx_report_status");

        // Soft-delete global filter.
        builder.HasQueryFilter(j => j.DeletedAt == null);
    }
}
