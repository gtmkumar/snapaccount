using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core entity configuration for <see cref="FraudCheck"/> → <c>loan.fraud_checks</c>.
/// GAP-110 (migration 082): rows are append-only (decision-log style); no soft-delete filter.
/// </summary>
public sealed class FraudCheckConfiguration : IEntityTypeConfiguration<FraudCheck>
{
    public void Configure(EntityTypeBuilder<FraudCheck> builder)
    {
        builder.ToTable("fraud_checks");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.ApplicationId).HasColumnName("application_id").IsRequired();
        builder.Property(x => x.CheckType)
            .HasColumnName("check_type")
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();
        builder.Property(x => x.Verdict)
            .HasColumnName("verdict")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        builder.Property(x => x.Details)
            .HasColumnName("details")
            .HasColumnType("jsonb");
        builder.Property(x => x.DecisionNote)
            .HasColumnName("decision_note")
            .HasMaxLength(2000)
            .IsRequired();
        builder.Property(x => x.CheckedAt).HasColumnName("checked_at").IsRequired();

        // Audit columns from BaseAuditableEntity
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        // Indexes for fraud query patterns
        builder.HasIndex(x => x.ApplicationId);
        builder.HasIndex(x => new { x.CheckType, x.Verdict });

        // FK → loan.applications
        builder.HasOne<LoanApplication>()
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Ignore(x => x.DomainEvents);
    }
}
