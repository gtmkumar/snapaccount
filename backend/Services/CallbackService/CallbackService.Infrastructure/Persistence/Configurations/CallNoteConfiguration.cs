using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CallbackService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for <see cref="CallNote"/>.</summary>
public sealed class CallNoteConfiguration : IEntityTypeConfiguration<CallNote>
{
    public void Configure(EntityTypeBuilder<CallNote> builder)
    {
        builder.ToTable("call_notes");

        builder.HasKey(n => n.Id);
        builder.Property(n => n.Id).HasColumnName("id");
        builder.Property(n => n.CallbackId).HasColumnName("callback_id").IsRequired();
        builder.Property(n => n.AuthorId).HasColumnName("author_id").IsRequired();
        builder.Property(n => n.Content).HasColumnName("content").HasMaxLength(5000).IsRequired();
        builder.Property(n => n.IsInternal).HasColumnName("is_internal").IsRequired();
        builder.Property(n => n.CreatedAt).HasColumnName("created_at");
        builder.Property(n => n.UpdatedAt).HasColumnName("updated_at");
        builder.Property(n => n.DeletedAt).HasColumnName("deleted_at");
        builder.Property(n => n.CreatedBy).HasColumnName("created_by");
        builder.Property(n => n.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(n => n.CallbackId).HasDatabaseName("ix_call_notes_callback_id");
        builder.HasQueryFilter(n => n.DeletedAt == null);
    }
}
