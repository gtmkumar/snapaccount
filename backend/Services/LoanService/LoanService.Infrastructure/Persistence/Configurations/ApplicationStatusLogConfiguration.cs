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
        builder.Property(x => x.FromStatus).HasMaxLength(30);
        builder.Property(x => x.ToStatus).HasMaxLength(30).IsRequired();
        builder.Property(x => x.TransitionedAt).IsRequired();
        builder.Property(x => x.Notes).HasMaxLength(500);
        builder.Property(x => x.TransitionSource).HasMaxLength(20).IsRequired();

        builder.HasIndex(x => x.ApplicationId);
        builder.HasIndex(x => x.TransitionedAt);
    }
}
