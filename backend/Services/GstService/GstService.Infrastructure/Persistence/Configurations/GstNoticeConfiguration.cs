using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstNotice"/>.
/// P6-HANDOFF-14: attachments_json / response_attachments_json are jsonb columns storing
/// GCS URI metadata arrays — never raw bytes.
///
/// SWEEP-FIX WEB-01: gst.notices uses org_id (not organization_id), notice_date (not issued_date),
/// subject (not description), assigned_to (not assigned_ca_id). All column names reconciled here.
/// </summary>
public sealed class GstNoticeConfiguration : IEntityTypeConfiguration<GstNotice>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstNotice> builder)
    {
        builder.ToTable("notices");

        builder.HasKey(n => n.Id);

        // WEB-01: DB column is org_id, not organization_id.
        builder.Property(n => n.OrganizationId).IsRequired().HasColumnName("org_id");
        builder.Property(n => n.NoticeNumber).IsRequired().HasMaxLength(100).HasColumnName("notice_number");
        builder.Property(n => n.NoticeType).IsRequired().HasMaxLength(100).HasColumnName("notice_type");
        builder.Property(n => n.IssuedBy).HasMaxLength(200).HasColumnName("issued_by");
        // DB column is notice_date.
        builder.Property(n => n.IssuedDate).IsRequired().HasColumnName("notice_date");
        builder.Property(n => n.DueDate).HasColumnName("due_date");
        builder.Property(n => n.Status).IsRequired().HasMaxLength(50).HasDefaultValue("RECEIVED").HasColumnName("status");
        // DB column is subject for the brief description.
        builder.Property(n => n.Description).HasMaxLength(2000).HasColumnName("subject");
        // DB column is assigned_to for the assigned CA user ID.
        builder.Property(n => n.AssignedCaId).HasColumnName("assigned_to");
        builder.Property(n => n.RespondedAt).HasColumnName("responded_at");
        builder.Property(n => n.RespondedBy).HasColumnName("responded_by");

        // P6-HANDOFF-14: jsonb columns for GCS URI metadata.
        builder.Property(n => n.AttachmentsJson).HasColumnType("jsonb").HasColumnName("attachments_jsonb");
        builder.Property(n => n.ResponseAttachmentsJson).HasColumnType("jsonb").HasColumnName("response_attachments_jsonb");

        // Audit columns (snake_case convention handles created_at / updated_at / deleted_at).
        builder.Property(n => n.CreatedAt).HasColumnName("created_at");
        builder.Property(n => n.UpdatedAt).HasColumnName("updated_at");
        builder.Property(n => n.DeletedAt).HasColumnName("deleted_at");
        builder.Property(n => n.CreatedBy).HasColumnName("created_by");
        builder.Property(n => n.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(n => n.OrganizationId);
        builder.HasIndex(n => n.Status);
        builder.HasIndex(n => n.DueDate);
    }
}
