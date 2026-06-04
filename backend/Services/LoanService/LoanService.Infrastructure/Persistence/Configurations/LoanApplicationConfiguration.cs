using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LoanService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for LoanApplication → loan.applications table.</summary>
public sealed class LoanApplicationConfiguration : IEntityTypeConfiguration<LoanApplication>
{
    public void Configure(EntityTypeBuilder<LoanApplication> builder)
    {
        builder.ToTable("applications");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.OrgId).IsRequired();
        builder.Property(x => x.LoanProductId).IsRequired();
        builder.Property(x => x.RequestedAmount).HasColumnType("numeric(18,2)").IsRequired();
        builder.Property(x => x.TenureMonths).IsRequired();
        builder.Property(x => x.Purpose).HasMaxLength(1000);
        // Native PG enum loan.application_status_v2 — mapped via MapEnum in DependencyInjection.
        // No string conversion: Npgsql handles the enum natively (UPPER_SNAKE labels).
        builder.Property(x => x.Status).IsRequired();
        builder.Property(x => x.BankReferenceNo).HasMaxLength(100);
        builder.Property(x => x.DisbursedAmount).HasColumnType("numeric(18,2)");
        builder.Property(x => x.AnonymizationReason).HasMaxLength(100);

        // Indexes
        builder.HasIndex(x => x.OrgId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.AssignedBankId);
        builder.HasIndex(x => x.SubmittedAt);

        // Global query filter for soft deletes
        builder.HasQueryFilter(x => x.DeletedAt == null);

        // Navigations
        builder.HasOne(x => x.LoanProduct)
            .WithMany()
            .HasForeignKey(x => x.LoanProductId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.AssignedBank)
            .WithMany()
            .HasForeignKey(x => x.AssignedBankId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
