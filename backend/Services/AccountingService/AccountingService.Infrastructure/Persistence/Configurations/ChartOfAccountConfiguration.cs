using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for <see cref="ChartOfAccount"/>.</summary>
public sealed class ChartOfAccountConfiguration : IEntityTypeConfiguration<ChartOfAccount>
{
    public void Configure(EntityTypeBuilder<ChartOfAccount> builder)
    {
        builder.ToTable("chart_of_accounts");

        builder.HasKey(e => e.Id);
        builder.Property(e => e.OrgId).IsRequired();
        builder.Property(e => e.AccountCode).HasMaxLength(20).IsRequired();
        builder.Property(e => e.AccountName).HasMaxLength(200).IsRequired();
        builder.Property(e => e.AccountType).HasMaxLength(20).IsRequired();
        builder.Property(e => e.AccountSubtype).HasMaxLength(50);
        builder.Property(e => e.ParentAccountId);
        builder.Property(e => e.IsPostable).IsRequired().HasDefaultValue(true);
        builder.Property(e => e.IsFromTemplate).IsRequired().HasDefaultValue(false);
        builder.Property(e => e.TemplateCode).HasMaxLength(20);
        builder.Property(e => e.IsActive).IsRequired().HasDefaultValue(true);

        builder.HasIndex(e => new { e.OrgId, e.AccountCode }).IsUnique();
        builder.HasIndex(e => e.OrgId);
    }
}
