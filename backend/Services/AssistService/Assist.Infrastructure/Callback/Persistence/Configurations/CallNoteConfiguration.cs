using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CallbackService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="CallNote"/>.
/// Column names reconciled to the canonical schema in
/// <c>database/migrations/018_callback_schema.sql</c>: the note text lives in
/// <c>body</c> (not <c>content</c>), and the internal/visible flag maps to the
/// <c>visibility</c> VARCHAR + CHECK column ('INTERNAL' / 'USER_VISIBLE').
/// </summary>
public sealed class CallNoteConfiguration : IEntityTypeConfiguration<CallNote>
{
    public void Configure(EntityTypeBuilder<CallNote> builder)
    {
        builder.ToTable("call_notes");

        builder.HasKey(n => n.Id);
        builder.Property(n => n.Id).HasColumnName("id");
        builder.Property(n => n.CallbackId).HasColumnName("callback_id").IsRequired();
        builder.Property(n => n.AuthorId).HasColumnName("author_id").IsRequired();

        // Canonical column is `body` (was incorrectly mapped to `content`).
        builder.Property(n => n.Content).HasColumnName("body").HasMaxLength(5000).IsRequired();

        // The canonical table has no boolean is_internal column — it has a
        // `visibility` VARCHAR with a CHECK constraint. Map the bool to those values
        // so the CHECK is honoured: true => INTERNAL, false => USER_VISIBLE.
        builder.Property(n => n.IsInternal)
            .HasColumnName("visibility")
            .HasConversion(
                isInternal => isInternal ? "INTERNAL" : "USER_VISIBLE",
                value => value == "INTERNAL")
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(n => n.CreatedAt).HasColumnName("created_at");
        builder.Property(n => n.UpdatedAt).HasColumnName("updated_at");
        builder.Property(n => n.DeletedAt).HasColumnName("deleted_at");
        builder.Property(n => n.CreatedBy).HasColumnName("created_by");
        builder.Property(n => n.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(n => n.CallbackId).HasDatabaseName("ix_call_notes_callback_id");
        builder.HasQueryFilter(n => n.DeletedAt == null);
    }
}
