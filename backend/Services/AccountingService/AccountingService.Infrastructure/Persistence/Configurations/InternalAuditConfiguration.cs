using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="InternalAudit"/> entity,
/// mapping to accounting.internal_audit.
/// </summary>
public class InternalAuditConfiguration : IEntityTypeConfiguration<InternalAudit>
{
    public void Configure(EntityTypeBuilder<InternalAudit> builder)
    {
        builder.ToTable("internal_audit");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.AuditTitle).HasColumnName("audit_title").HasMaxLength(300).IsRequired();
        builder.Property(x => x.AuditType).HasColumnName("audit_type").HasMaxLength(50).IsRequired();
        builder.Property(x => x.FinancialYear).HasColumnName("financial_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.AuditScope).HasColumnName("audit_scope");
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        builder.Property(x => x.StartDate).HasColumnName("start_date");
        builder.Property(x => x.EndDate).HasColumnName("end_date");
        builder.Property(x => x.AuditorName).HasColumnName("auditor_name").HasMaxLength(300);
        builder.Property(x => x.AuditorFirmName).HasColumnName("auditor_firm_name").HasMaxLength(300);
        builder.Property(x => x.FindingsCount).HasColumnName("findings_count").IsRequired();
        builder.Property(x => x.CriticalFindingsCount).HasColumnName("critical_findings_count").IsRequired();
        builder.Property(x => x.ExecutiveSummary).HasColumnName("executive_summary");
        builder.Property(x => x.ReportDocumentId).HasColumnName("report_document_id").HasMaxLength(100);
        builder.Property(x => x.ReportIssuedAt).HasColumnName("report_issued_at");
        builder.Property(x => x.Notes).HasColumnName("notes");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasMany<InternalAuditFinding>()
               .WithOne()
               .HasForeignKey(x => x.InternalAuditId)
               .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_internal_audit_user_id");
    }
}
