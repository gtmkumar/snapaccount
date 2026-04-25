using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for <see cref="ItrNotice"/>.</summary>
public sealed class ItrNoticeConfiguration : IEntityTypeConfiguration<ItrNotice>
{
    public void Configure(EntityTypeBuilder<ItrNotice> builder)
    {
        builder.ToTable("notices");
        builder.HasKey(n => n.Id);
        builder.Property(n => n.FilingId).IsRequired();
        builder.Property(n => n.AssesseeId).IsRequired();
        builder.Property(n => n.NoticeNumber).IsRequired().HasMaxLength(100);
        builder.Property(n => n.NoticeType).IsRequired().HasMaxLength(50);
        builder.Property(n => n.Subject).HasMaxLength(500);
        builder.Property(n => n.Status).IsRequired().HasMaxLength(30).HasDefaultValue("RECEIVED");
        builder.Property(n => n.AttachmentsJson).HasColumnType("jsonb").HasColumnName("attachments_jsonb");
        builder.Property(n => n.ResponseAttachmentsJson).HasColumnType("jsonb").HasColumnName("response_attachments_jsonb");
        builder.Property(n => n.ResponseText).HasMaxLength(5000);
        builder.HasIndex(n => n.FilingId);
        builder.HasIndex(n => n.AssesseeId);
    }
}
