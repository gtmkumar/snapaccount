using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for chat.appointments table (migration 080).
/// Status CHECK: 'DRAFT','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW'.
/// created_by / updated_by are uuid in DDL — BaseDbContext applies GuidStringConverter globally.
/// </summary>
public sealed class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        builder.ToTable("appointments");

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnName("id");

        builder.Property(a => a.OrganizationId)
            .HasColumnName("organization_id")
            .IsRequired();

        builder.Property(a => a.BookedByUserId)
            .HasColumnName("booked_by_user_id")
            .IsRequired();

        builder.Property(a => a.CaProfileId)
            .HasColumnName("ca_profile_id")
            .IsRequired();

        builder.Property(a => a.SlotId)
            .HasColumnName("slot_id")
            .IsRequired();

        // CHECK ('DRAFT','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')
        builder.Property(a => a.Status)
            .HasColumnName("status")
            .HasConversion(new UpperSnakeEnumConverter<AppointmentStatus>())
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(a => a.MeetLink)
            .HasColumnName("meet_link")
            .HasMaxLength(500);

        // Migration 086: additive nullable topic column
        builder.Property(a => a.Topic)
            .HasColumnName("topic")
            .HasMaxLength(50);

        builder.Property(a => a.Notes)
            .HasColumnName("notes")
            .HasMaxLength(2000);

        builder.Property(a => a.RatingStars)
            .HasColumnName("rating_stars");

        builder.Property(a => a.RatingComment)
            .HasColumnName("rating_comment")
            .HasMaxLength(1000);

        builder.Property(a => a.RatedAt)
            .HasColumnName("rated_at");

        // Migration 085: CA-initiated cancellation columns
        builder.Property(a => a.CaCancellationReason)
            .HasColumnName("ca_cancellation_reason")
            .HasMaxLength(1000);

        builder.Property(a => a.CancelledByCa)
            .HasColumnName("cancelled_by_ca")
            .HasDefaultValue(false)
            .IsRequired();

        // Migration 105: CA post-call summary note (DG-CHAT-05)
        builder.Property(a => a.CaSummaryNote)
            .HasColumnName("ca_summary_note")
            .HasMaxLength(4000);

        builder.Property(a => a.CreatedAt).HasColumnName("created_at");
        builder.Property(a => a.UpdatedAt).HasColumnName("updated_at");
        builder.Property(a => a.DeletedAt).HasColumnName("deleted_at");
        builder.Property(a => a.CreatedBy).HasColumnName("created_by");
        builder.Property(a => a.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(a => a.OrganizationId).HasDatabaseName("ix_appointments_org_id");
        builder.HasIndex(a => a.CaProfileId).HasDatabaseName("ix_appointments_ca_profile_id");
        builder.HasIndex(a => a.BookedByUserId).HasDatabaseName("ix_appointments_booked_by");
        builder.HasIndex(a => a.SlotId).HasDatabaseName("ix_appointments_slot_id");
        builder.HasIndex(a => a.Status).HasDatabaseName("ix_appointments_status");

        builder.HasQueryFilter(a => a.DeletedAt == null);
    }
}
