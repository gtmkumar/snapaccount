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

        builder.HasKey(r => r.Id);

        builder.Property(r => r.ThreadId)
            .HasColumnName("thread_id")
            .IsRequired();

        builder.Property(r => r.MessageId)
            .HasColumnName("message_id")
            .IsRequired();

        builder.Property(r => r.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(r => r.ReadAt)
            .HasColumnName("read_at")
            .IsRequired();

        // Unique: a user reads a given message only once
        builder.HasIndex(r => new { r.MessageId, r.UserId })
            .IsUnique()
            .HasDatabaseName("uq_read_receipts_message_user");

        builder.HasIndex(r => new { r.ThreadId, r.UserId })
            .HasDatabaseName("ix_read_receipts_thread_user");
    }
}
