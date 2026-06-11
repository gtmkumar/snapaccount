using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for chat.ca_availability_rules table (migration 085).
/// Stores recurring weekly schedule rules that the slot-generation job materialises into
/// chat.appointment_slots each Sunday.
/// </summary>
public sealed class CaAvailabilityRuleConfiguration : IEntityTypeConfiguration<CaAvailabilityRule>
{
    public void Configure(EntityTypeBuilder<CaAvailabilityRule> builder)
    {
        builder.ToTable("ca_availability_rules");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).HasColumnName("id");

        builder.Property(r => r.CaProfileId)
            .HasColumnName("ca_profile_id")
            .IsRequired();

        // 0 = Sunday … 6 = Saturday
        builder.Property(r => r.Weekday)
            .HasColumnName("weekday")
            .IsRequired();

        // TimeSpan stored as PG interval
        builder.Property(r => r.StartTimeIst)
            .HasColumnName("start_time_ist")
            .IsRequired();

        builder.Property(r => r.EndTimeIst)
            .HasColumnName("end_time_ist")
            .IsRequired();

        builder.Property(r => r.SlotDurationMinutes)
            .HasColumnName("slot_duration_minutes")
            .IsRequired();

        builder.Property(r => r.EffectiveFrom)
            .HasColumnName("effective_from")
            .IsRequired();

        builder.Property(r => r.EffectiveTo)
            .HasColumnName("effective_to");

        builder.Property(r => r.IsActive)
            .HasColumnName("is_active")
            .HasDefaultValue(true)
            .IsRequired();

        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(r => r.CaProfileId).HasDatabaseName("ix_ca_availability_rules_ca_profile_id");
        builder.HasIndex(r => new { r.CaProfileId, r.IsActive })
            .HasDatabaseName("ix_ca_availability_rules_ca_active");

        builder.HasQueryFilter(r => r.DeletedAt == null);
    }
}
