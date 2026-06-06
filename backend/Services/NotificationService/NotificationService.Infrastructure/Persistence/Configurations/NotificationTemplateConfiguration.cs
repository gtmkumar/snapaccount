using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace NotificationService.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="NotificationTemplate"/> to <c>notification.notification_template</c>
/// (created by SQL migrations 008 + 017 — SQL is canonical, no EF migrations).
///
/// The entity property names differ from the snake_case columns, so every column is
/// mapped explicitly:
///   EventCode → event_type, Locale → language, Body → body_template,
///   SenderName → sender_id, IsCurrent → is_current.
/// The NOT NULL <c>code</c> (UNIQUE) and <c>name</c> columns are supplied by the
/// entity factory (derived from event_code/channel/locale).
/// </summary>
public sealed class NotificationTemplateConfiguration : IEntityTypeConfiguration<NotificationTemplate>
{
    public void Configure(EntityTypeBuilder<NotificationTemplate> builder)
    {
        builder.ToTable("notification_template", "notification");
        builder.HasKey(t => t.Id);

        builder.Property(t => t.Id).HasColumnName("id");

        // NOT NULL UNIQUE in SQL — supplied by NotificationTemplate.Create.
        builder.Property(t => t.Code).HasColumnName("code").HasMaxLength(200).IsRequired();
        builder.HasIndex(t => t.Code).IsUnique();

        // NOT NULL in SQL.
        builder.Property(t => t.Name).HasColumnName("name").HasMaxLength(300).IsRequired();

        // Entity's EventCode is the SQL event_type column.
        builder.Property(t => t.EventCode).HasColumnName("event_type").HasMaxLength(200).IsRequired();

        // channel VARCHAR(30) + CHECK ('PUSH','SMS','EMAIL','IN_APP','WHATSAPP').
        // UpperSnakeEnumConverter emits PUSH / SMS / EMAIL / IN_APP — matches the CHECK.
        builder.Property(t => t.Channel).HasColumnName("channel")
            .HasConversion(new UpperSnakeEnumConverter<NotificationChannel>())
            .HasMaxLength(30).IsRequired();

        // Entity's Locale is the SQL language column.
        builder.Property(t => t.Locale).HasColumnName("language").HasMaxLength(20).IsRequired();

        builder.Property(t => t.Subject).HasColumnName("subject").HasMaxLength(500);

        // body_template TEXT NOT NULL.
        builder.Property(t => t.Body).HasColumnName("body_template").IsRequired();

        builder.Property(t => t.DltTemplateId).HasColumnName("dlt_template_id").HasMaxLength(100);
        builder.Property(t => t.SenderName).HasColumnName("sender_id").HasMaxLength(50);

        builder.Property(t => t.IsCurrent).HasColumnName("is_current").IsRequired();

        // effective_from / effective_to are TIMESTAMPTZ in SQL; the entity models them as
        // DateOnly. Convert DateOnly <-> DateTime (UTC midnight) so Npgsql binds timestamptz.
        builder.Property(t => t.EffectiveFrom).HasColumnName("effective_from")
            .HasConversion(DateOnlyToUtcConverter);
        builder.Property(t => t.EffectiveTo).HasColumnName("effective_to")
            .HasConversion(NullableDateOnlyToUtcConverter);

        builder.Property(t => t.CreatedAt).HasColumnName("created_at");
        builder.Property(t => t.UpdatedAt).HasColumnName("updated_at");
        builder.Property(t => t.DeletedAt).HasColumnName("deleted_at");
        builder.Property(t => t.CreatedBy).HasColumnName("created_by");
        builder.Property(t => t.UpdatedBy).HasColumnName("updated_by");

        builder.HasQueryFilter(t => t.DeletedAt == null);
    }

    private static readonly ValueConverter<DateOnly, DateTime> DateOnlyToUtcConverter =
        new(d => DateTime.SpecifyKind(d.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc),
            dt => DateOnly.FromDateTime(dt));

    private static readonly ValueConverter<DateOnly?, DateTime?> NullableDateOnlyToUtcConverter =
        new(d => d.HasValue
                ? DateTime.SpecifyKind(d.Value.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc)
                : (DateTime?)null,
            dt => dt.HasValue ? DateOnly.FromDateTime(dt.Value) : (DateOnly?)null);
}
