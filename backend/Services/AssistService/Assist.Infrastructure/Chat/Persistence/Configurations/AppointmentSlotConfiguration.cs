using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for chat.appointment_slots table (migration 080).
/// created_by / updated_by are uuid in DDL — BaseDbContext applies GuidStringConverter globally.
/// </summary>
public sealed class AppointmentSlotConfiguration : IEntityTypeConfiguration<AppointmentSlot>
{
    public void Configure(EntityTypeBuilder<AppointmentSlot> builder)
    {
        builder.ToTable("appointment_slots");

        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).HasColumnName("id");

        builder.Property(s => s.CaProfileId)
            .HasColumnName("ca_profile_id")
            .IsRequired();

        builder.Property(s => s.StartUtc)
            .HasColumnName("start_utc")
            .IsRequired();

        builder.Property(s => s.EndUtc)
            .HasColumnName("end_utc")
            .IsRequired();

        builder.Property(s => s.IsAvailable)
            .HasColumnName("is_available")
            .IsRequired();

        builder.Property(s => s.CreatedAt).HasColumnName("created_at");
        builder.Property(s => s.UpdatedAt).HasColumnName("updated_at");
        builder.Property(s => s.DeletedAt).HasColumnName("deleted_at");
        builder.Property(s => s.CreatedBy).HasColumnName("created_by");
        builder.Property(s => s.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(s => s.CaProfileId).HasDatabaseName("ix_appointment_slots_ca_profile_id");
        builder.HasIndex(s => new { s.CaProfileId, s.StartUtc, s.IsAvailable })
            .HasDatabaseName("ix_appointment_slots_ca_start_available");

        builder.HasQueryFilter(s => s.DeletedAt == null);
    }
}
