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

        // SWEEP-FIX: AuditType → audit_type (VARCHAR 40 in DB, entity had VARCHAR 50)
        builder.Property(x => x.AuditType).HasColumnName("audit_type").HasMaxLength(40).IsRequired();

        // SWEEP-FIX: Status → status (same name, correct)
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();

        // SWEEP-FIX: AuditorName → auditor_name (only auditor column in DB; no firm_name)
        builder.Property(x => x.AuditorName).HasColumnName("auditor_name").HasMaxLength(300);

        // SWEEP-FIX: FindingsCount → findings_count (smallint in DB)
        builder.Property(x => x.FindingsCount).HasColumnName("findings_count").IsRequired();

        // SWEEP-FIX: CriticalFindingsCount → critical_findings_count (smallint in DB)
        builder.Property(x => x.CriticalFindingsCount).HasColumnName("critical_findings_count").IsRequired();

        // SWEEP-FIX: Notes → remarks (column name differs in DB)
        builder.Property(x => x.Notes).HasColumnName("remarks");

        // SWEEP-FIX: StartDate → audit_period_from; EndDate → audit_period_to (DB uses timestamp)
        builder.Property(x => x.StartDate).HasColumnName("audit_period_from");
        builder.Property(x => x.EndDate).HasColumnName("audit_period_to");

        // SWEEP-FIX: AuditScope → scope (column name differs in DB)
        builder.Property(x => x.AuditScope).HasColumnName("scope");

        // SWEEP-FIX: Properties with NO DB column — must be ignored to prevent SQL errors.
        // DDL HANDOFF (db-engineer): add the following columns to accounting.internal_audit if needed:
        //   audit_title VARCHAR(300) NOT NULL DEFAULT ''
        //   financial_year VARCHAR(10) NOT NULL DEFAULT ''
        //   auditor_firm_name VARCHAR(300)
        //   executive_summary TEXT
        //   report_document_id VARCHAR(100)
        //   report_issued_at TIMESTAMPTZ
        builder.Ignore(x => x.AuditTitle);
        builder.Ignore(x => x.FinancialYear);
        builder.Ignore(x => x.AuditorFirmName);
        builder.Ignore(x => x.ExecutiveSummary);
        builder.Ignore(x => x.ReportDocumentId);
        builder.Ignore(x => x.ReportIssuedAt);

        // DB also has assigned_to UUID — shadow property (entity doesn't expose it)
        builder.Property<Guid?>("AssignedTo").HasColumnName("assigned_to");

        // DB also has report_date TIMESTAMPTZ — shadow property
        builder.Property<DateTime?>("ReportDate").HasColumnName("report_date");

        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasMany<InternalAuditFinding>()
               .WithOne()
               .HasForeignKey(x => x.InternalAuditId)
               .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_int_audit_user_id");
    }
}
