using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for chat.messages table.</summary>
public class ChatMessageConfiguration : IEntityTypeConfiguration<ChatMessage>
{
    public void Configure(EntityTypeBuilder<ChatMessage> builder)
    {
        builder.ToTable("messages");

        builder.HasKey(m => m.Id);

        builder.Property(m => m.ThreadId)
            .HasColumnName("thread_id")
            .IsRequired();

        builder.Property(m => m.SenderUserId)
            .HasColumnName("sender_user_id");

        builder.Property(m => m.Body)
            .HasColumnName("body")
            .HasMaxLength(4000)
            .IsRequired();

        builder.Property(m => m.AttachmentsJson)
            .HasColumnName("attachments_jsonb")
            .HasColumnType("jsonb");

        builder.Property(m => m.ClientMessageId)
            .HasColumnName("client_message_id")
            .HasMaxLength(128);

        // body_tsvector is a Postgres `tsvector GENERATED ALWAYS ... STORED` column
        // (migration 029). Npgsql cannot map a CLR `string` to `tsvector`, and the
        // application never reads it (full-text search runs as raw SQL against the
        // GIN index). Exclude it from the EF model entirely so reads/writes of
        // ChatMessage never reference the column.
        builder.Ignore(m => m.BodyTsvector);

        builder.Property(m => m.AnonymizedAt)
            .HasColumnName("anonymized_at");

        builder.Property(m => m.AnonymizationReason)
            .HasColumnName("anonymization_reason")
            .HasMaxLength(100);

        builder.HasMany(m => m.ReadReceipts)
            .WithOne()
            .HasForeignKey(r => r.MessageId)
            .OnDelete(DeleteBehavior.Restrict);

        // Unique constraint for offline idempotency (migration 029)
        builder.HasIndex(m => new { m.ThreadId, m.ClientMessageId })
            .IsUnique()
            .HasFilter("client_message_id IS NOT NULL")
            .HasDatabaseName("uq_messages_thread_client_message_id");

        builder.HasIndex(m => m.ThreadId).HasDatabaseName("ix_messages_thread_id");
        builder.HasIndex(m => new { m.ThreadId, m.CreatedAt }).HasDatabaseName("ix_messages_thread_created");
        builder.HasIndex(m => m.SenderUserId).HasDatabaseName("ix_messages_sender_id");

        builder.HasQueryFilter(m => m.DeletedAt == null);
    }
}
