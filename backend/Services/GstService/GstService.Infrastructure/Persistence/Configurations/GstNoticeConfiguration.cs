using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstNotice"/>.
/// P6-HANDOFF-14: attachments_json / response_attachments_json are jsonb columns storing
/// GCS URI metadata arrays — never raw bytes.
/// </summary>
public sealed class GstNoticeConfiguration : IEntityTypeConfiguration<GstNotice>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstNotice> builder)
    {
        builder.ToTable("notices");

        builder.HasKey(n => n.Id);

        builder.Property(n => n.OrganizationId).IsRequired();
        builder.Property(n => n.NoticeNumber).IsRequired().HasMaxLength(100);
        builder.Property(n => n.NoticeType).IsRequired().HasMaxLength(100);
        builder.Property(n => n.IssuedBy).HasMaxLength(200);
        builder.Property(n => n.IssuedDate).IsRequired();
        builder.Property(n => n.Status).IsRequired().HasMaxLength(50).HasDefaultValue("RECEIVED");
        builder.Property(n => n.Description).HasMaxLength(2000);

        // P6-HANDOFF-14: jsonb columns for GCS URI metadata
        builder.Property(n => n.AttachmentsJson).HasColumnType("jsonb").HasColumnName("attachments_jsonb");
        builder.Property(n => n.ResponseAttachmentsJson).HasColumnType("jsonb").HasColumnName("response_attachments_jsonb");

        builder.HasIndex(n => n.OrganizationId);
        builder.HasIndex(n => n.Status);
        builder.HasIndex(n => n.DueDate);
    }
}
