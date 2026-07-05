using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for chat.read_receipts table.</summary>
public class ReadReceiptConfiguration : IEntityTypeConfiguration<ReadReceipt>
{
    public void Configure(EntityTypeBuilder<ReadReceipt> builder)
    {
        builder.ToTable("read_receipts");

        // Canonical chat.read_receipts (migration 029) is a per-(thread,user)
        // "last-read pointer": composite PK (thread_id, user_id), columns
        // last_read_message_id / last_read_at / updated_at. It has NO surrogate id,
        // created_at, created_by, updated_by or deleted_at columns.
        // Mirror the real shape so reads stop 500-ing.
        builder.HasKey(r => new { r.ThreadId, r.UserId });

        // ReadReceipt derives from BaseEntity, so it carries only Id (no audit
        // columns). The canonical table has no id column — exclude it.
        builder.Ignore(r => r.Id);

        builder.Property(r => r.ThreadId)
            .HasColumnName("thread_id")
            .IsRequired();

        builder.Property(r => r.MessageId)
            .HasColumnName("last_read_message_id");

        builder.Property(r => r.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(r => r.ReadAt)
            .HasColumnName("last_read_at")
            .IsRequired();

        builder.HasIndex(r => r.UserId)
            .HasDatabaseName("ix_read_receipts_user_id");
    }
}
