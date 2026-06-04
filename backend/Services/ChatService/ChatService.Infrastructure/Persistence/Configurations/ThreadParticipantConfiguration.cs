using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for chat.thread_participants table.</summary>
public class ThreadParticipantConfiguration : IEntityTypeConfiguration<ThreadParticipant>
{
    public void Configure(EntityTypeBuilder<ThreadParticipant> builder)
    {
        builder.ToTable("thread_participants");

        // Canonical chat.thread_participants (migration 029) has a composite PK
        // (thread_id, user_id) and NO surrogate id / created_at / updated_at /
        // created_by / updated_by columns. ThreadParticipant derives from BaseEntity
        // (only Id + DeletedAt) — exclude the Id since the table has no id column.
        builder.HasKey(p => new { p.ThreadId, p.UserId });

        builder.Ignore(p => p.Id);

        builder.Property(p => p.ThreadId)
            .HasColumnName("thread_id")
            .IsRequired();

        builder.Property(p => p.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        builder.Property(p => p.Role)
            .HasColumnName("role")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(p => p.DeletedAt)
            .HasColumnName("deleted_at");

        builder.HasIndex(p => p.UserId)
            .HasDatabaseName("ix_thread_participants_user_id");

        builder.HasQueryFilter(p => p.DeletedAt == null);

        // Single relationship for both navigations (ChatThread.Participants <-> Thread),
        // keyed on ThreadId. Without specifying both ends EF would synthesise a second
        // shadow FK (thread_id1) for the ThreadParticipant.Thread navigation.
        builder.HasOne(p => p.Thread)
            .WithMany(t => t.Participants)
            .HasForeignKey(p => p.ThreadId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
