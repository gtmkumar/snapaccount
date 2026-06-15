using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="InternalAuditFinding"/> entity,
/// mapping to accounting.internal_audit_finding.
/// </summary>
public class InternalAuditFindingConfiguration : IEntityTypeConfiguration<InternalAuditFinding>
{
    public void Configure(EntityTypeBuilder<InternalAuditFinding> builder)
    {
        builder.ToTable("internal_audit_finding");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");

        // SWEEP-FIX: InternalAuditId → audit_id (FK column name differs in DB)
        builder.Property(x => x.InternalAuditId).HasColumnName("audit_id").IsRequired();

        // SWEEP-FIX: FindingType → finding_category (column name differs, VARCHAR 60 in DB)
        // DDL HANDOFF (db-engineer): finding_type VARCHAR(50) does not exist; entity maps to finding_category.
        builder.Property(x => x.FindingType).HasColumnName("finding_category").HasMaxLength(60).IsRequired();

        builder.Property(x => x.Severity).HasColumnName("severity").HasMaxLength(20).IsRequired();
        builder.Property(x => x.Description).HasColumnName("description").IsRequired();
        builder.Property(x => x.Recommendation).HasColumnName("recommendation");
        builder.Property(x => x.ManagementResponse).HasColumnName("management_response");
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();

        // SWEEP-FIX: TargetResolutionDate → remediation_date; ResolvedAt has no column in DB.
        // AssignedTo → remediation_owner
        builder.Property(x => x.TargetResolutionDate).HasColumnName("remediation_date");
        builder.Property(x => x.AssignedTo).HasColumnName("remediation_owner");

        // SWEEP-FIX: Title and EvidenceDocumentId have NO column in DB — ignore to prevent SQL errors.
        // ResolvedAt also has no column.
        // DDL HANDOFF (db-engineer): add to accounting.internal_audit_finding:
        //   title VARCHAR(500) NOT NULL DEFAULT ''
        //   evidence_document_id VARCHAR(100)
        //   resolved_at TIMESTAMPTZ
        builder.Ignore(x => x.Title);
        builder.Ignore(x => x.EvidenceDocumentId);
        builder.Ignore(x => x.ResolvedAt);

        // DB has organization_id (NOT NULL, FK) — shadow property
        builder.Property<Guid>("OrganizationId").HasColumnName("organization_id").IsRequired();

        // DB has finding_number SMALLINT (unique per audit) — shadow property
        builder.Property<short>("FindingNumber").HasColumnName("finding_number").IsRequired();

        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.InternalAuditId).HasDatabaseName("idx_int_finding_audit_id");
        builder.HasIndex(x => x.Severity).HasDatabaseName("idx_int_finding_severity");
    }
}
