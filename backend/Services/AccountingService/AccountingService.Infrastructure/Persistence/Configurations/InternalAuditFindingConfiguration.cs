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
        builder.Property(x => x.InternalAuditId).HasColumnName("internal_audit_id").IsRequired();
        builder.Property(x => x.FindingType).HasColumnName("finding_type").HasMaxLength(50).IsRequired();
        builder.Property(x => x.Severity).HasColumnName("severity").HasMaxLength(20).IsRequired();
        builder.Property(x => x.Title).HasColumnName("title").HasMaxLength(500).IsRequired();
        builder.Property(x => x.Description).HasColumnName("description").IsRequired();
        builder.Property(x => x.Recommendation).HasColumnName("recommendation");
        builder.Property(x => x.ManagementResponse).HasColumnName("management_response");
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
        builder.Property(x => x.TargetResolutionDate).HasColumnName("target_resolution_date");
        builder.Property(x => x.ResolvedAt).HasColumnName("resolved_at");
        builder.Property(x => x.AssignedTo).HasColumnName("assigned_to");
        builder.Property(x => x.EvidenceDocumentId).HasColumnName("evidence_document_id").HasMaxLength(100);
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.InternalAuditId).HasDatabaseName("idx_audit_finding_audit_id");
        builder.HasIndex(x => x.Severity).HasDatabaseName("idx_audit_finding_severity");
    }
}
