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

        builder.HasKey(p => p.Id);

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

        builder.HasIndex(p => new { p.ThreadId, p.UserId })
            .HasDatabaseName("ix_thread_participants_thread_user");

        builder.HasIndex(p => p.UserId)
            .HasDatabaseName("ix_thread_participants_user_id");

        builder.HasQueryFilter(p => p.DeletedAt == null);

        // Navigation back to thread (for IDOR checks in RemoveParticipant)
        builder.Navigation("Thread");
    }
}
