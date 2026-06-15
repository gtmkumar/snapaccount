using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="ItrNotice"/> → itr.notices table.
/// SWEEP-FIX: ItrNoticeConfiguration previously used wrong column names (attachments_jsonb,
/// response_attachments_jsonb, AssesseeId) that do not exist in itr.notices.
/// DB columns verified via psql \d itr.notices (2026-06-11).
/// </summary>
public sealed class ItrNoticeConfiguration : IEntityTypeConfiguration<ItrNotice>
{
    public void Configure(EntityTypeBuilder<ItrNotice> builder)
    {
        builder.ToTable("notices");
        builder.HasKey(n => n.Id);

        // filing_id UUID nullable FK
        builder.Property(n => n.FilingId)
            .HasColumnName("filing_id");

        // AssesseeId has no direct column in notices table — uses user_id.
        // DB: user_id UUID NOT NULL
        builder.Property(n => n.AssesseeId)
            .HasColumnName("user_id")
            .IsRequired();

        // notice_number VARCHAR(120) nullable
        builder.Property(n => n.NoticeNumber)
            .HasColumnName("notice_number")
            .HasMaxLength(120);

        // notice_type VARCHAR(80) nullable
        builder.Property(n => n.NoticeType)
            .HasColumnName("notice_type")
            .HasMaxLength(80)
            .IsRequired();

        // Subject maps to description TEXT
        builder.Property(n => n.Subject)
            .HasColumnName("description");

        // issued_date DATE NOT NULL
        builder.Property(n => n.IssuedDate)
            .HasColumnName("issued_date")
            .IsRequired();

        // due_date DATE nullable
        builder.Property(n => n.DueDate)
            .HasColumnName("due_date");

        // status VARCHAR(40) NOT NULL
        builder.Property(n => n.Status)
            .HasColumnName("status")
            .HasMaxLength(40)
            .IsRequired()
            .HasDefaultValue("RECEIVED");

        // AttachmentsJson maps to notice_document_id (document UUID, not JSON).
        // MISMATCH: Entity stores a JSON URI blob; DB stores a document UUID reference.
        // Ignore the JSON property; use shadow property for the UUID.
        // DDL HANDOFF (db-engineer): either add attachments_jsonb JSONB to itr.notices,
        // or the entity should be refactored to hold notice_document_id UUID.
        builder.Ignore(n => n.AttachmentsJson);

        // response_document_id UUID nullable — shadow property
        builder.Property<Guid?>("ResponseDocumentId")
            .HasColumnName("response_document_id");

        // ResponseAttachmentsJson — no JSON column in DB; ignore
        builder.Ignore(n => n.ResponseAttachmentsJson);

        // AssignedCaId → assigned_to
        builder.Property(n => n.AssignedCaId)
            .HasColumnName("assigned_to");

        // ResponseText maps to resolution_notes TEXT
        builder.Property(n => n.ResponseText)
            .HasColumnName("resolution_notes");

        // responded_at TIMESTAMPTZ nullable
        builder.Property(n => n.RespondedAt)
            .HasColumnName("responded_at");

        // responded_by UUID nullable
        builder.Property(n => n.RespondedBy)
            .HasColumnName("responded_by");

        // DPDP columns — present in DB
        builder.Property(n => n.AnonymizedAt)
            .HasColumnName("anonymized_at");
        builder.Property(n => n.AnonymizationReason)
            .HasColumnName("anonymization_reason");

        // Shadow property for ay (assessment year — NOT NULL in DB, no entity prop)
        builder.Property<string>("Ay")
            .HasColumnName("ay")
            .IsRequired()
            .HasDefaultValue("");

        // Shadow property for notice_section VARCHAR(40) NOT NULL
        builder.Property<string>("NoticeSection")
            .HasColumnName("notice_section")
            .HasMaxLength(40)
            .IsRequired()
            .HasDefaultValue("OTHER");

        builder.HasIndex(n => n.FilingId).HasDatabaseName("idx_itr_notices_filing_id");
        builder.HasIndex(n => n.AssesseeId).HasDatabaseName("idx_itr_notices_user_id");
        builder.HasIndex(n => n.Status).HasDatabaseName("idx_itr_notices_status");
        builder.HasQueryFilter(n => n.DeletedAt == null);
    }
}
