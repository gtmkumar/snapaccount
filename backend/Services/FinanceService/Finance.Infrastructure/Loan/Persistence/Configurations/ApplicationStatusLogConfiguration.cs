using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for ApplicationStatusLog → loan.application_status_log table.
/// Append-only. DB BEFORE DELETE trigger blocks hard-deletes.
/// </summary>
public sealed class ApplicationStatusLogConfiguration : IEntityTypeConfiguration<ApplicationStatusLog>
{
    public void Configure(EntityTypeBuilder<ApplicationStatusLog> builder)
    {
        builder.ToTable("application_status_log");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.ApplicationId).IsRequired();

        // BUG-LOAN-STATUSLOG-COLS: from_status/to_status are native PG enums
        // (loan.application_status_v2, UPPER_SNAKE labels), NOT varchar. The domain entity
        // carries PascalCase status strings (from LoanApplicationStatus.ToString()), so convert
        // string ↔ LoanApplicationStatus — Npgsql's registered MapEnum<LoanApplicationStatus>
        // (UpperSnakeCaseNameTranslator) then writes the correct enum labels. from_status is
        // nullable in the DB (NULL on the initial DRAFT insert); the entity uses "" for that.
        builder.Property(x => x.FromStatus)
            .HasColumnName("from_status")
            .HasConversion(
                s => string.IsNullOrEmpty(s) ? (Domain.Entities.LoanApplicationStatus?)null
                                             : Enum.Parse<Domain.Entities.LoanApplicationStatus>(s),
                e => e.HasValue ? e.Value.ToString() : string.Empty);
        builder.Property(x => x.ToStatus)
            .HasColumnName("to_status")
            .HasConversion(
                s => Enum.Parse<Domain.Entities.LoanApplicationStatus>(s),
                e => e.ToString())
            .IsRequired();

        // BUG-LOAN-STATUSLOG-COLS: real column names are occurred_at/changed_by/reason/actor_type,
        // not the snake_case convention names (transitioned_at/transitioned_by/notes/transition_source).
        builder.Property(x => x.TransitionedAt).HasColumnName("occurred_at").IsRequired();
        builder.Property(x => x.TransitionedBy).HasColumnName("changed_by");
        builder.Property(x => x.Notes).HasColumnName("reason");
        builder.Property(x => x.TransitionSource).HasColumnName("actor_type").HasMaxLength(40).IsRequired();

        builder.HasIndex(x => x.ApplicationId);
        builder.HasIndex(x => x.TransitionedAt);
    }
}
