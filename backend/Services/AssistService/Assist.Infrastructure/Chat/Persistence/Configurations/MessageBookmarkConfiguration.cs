using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for chat.message_bookmarks table (migration 080).
/// (user_id, message_id) is UNIQUE — bookmark is a toggle.
/// created_by / updated_by are uuid in DDL — BaseDbContext applies GuidStringConverter globally.
/// </summary>
public sealed class MessageBookmarkConfiguration : IEntityTypeConfiguration<MessageBookmark>
{
    public void Configure(EntityTypeBuilder<MessageBookmark> builder)
    {
        builder.ToTable("message_bookmarks");

        builder.HasKey(b => b.Id);
        builder.Property(b => b.Id).HasColumnName("id");

        builder.Property(b => b.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(b => b.MessageId)
            .HasColumnName("message_id")
            .IsRequired();

        builder.Property(b => b.Note)
            .HasColumnName("note")
            .HasMaxLength(500);

        builder.Property(b => b.CreatedAt).HasColumnName("created_at");
        builder.Property(b => b.UpdatedAt).HasColumnName("updated_at");
        builder.Property(b => b.DeletedAt).HasColumnName("deleted_at");
        builder.Property(b => b.CreatedBy).HasColumnName("created_by");
        builder.Property(b => b.UpdatedBy).HasColumnName("updated_by");

        // UNIQUE constraint for toggle semantics
        builder.HasIndex(b => new { b.UserId, b.MessageId })
            .IsUnique()
            .HasFilter("deleted_at IS NULL")
            .HasDatabaseName("uq_message_bookmarks_user_message");

        builder.HasIndex(b => b.UserId).HasDatabaseName("ix_message_bookmarks_user_id");
        builder.HasIndex(b => b.MessageId).HasDatabaseName("ix_message_bookmarks_message_id");

        builder.HasQueryFilter(b => b.DeletedAt == null);
    }
}
