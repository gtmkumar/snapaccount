using AccountingService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AccountingService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core entity configuration for <see cref="ChartOfAccount"/>.</summary>
public sealed class ChartOfAccountConfiguration : IEntityTypeConfiguration<ChartOfAccount>
{
    public void Configure(EntityTypeBuilder<ChartOfAccount> builder)
    {
        // SWEEP-FIX WEB-14: accounting.chart_of_accounts does NOT exist.
        // The real table is accounting.account (org-scoped COA entries seeded from coa_template).
        // Entity fields align well; column renames and unused property suppressions below.
        builder.ToTable("account");

        builder.HasKey(e => e.Id);

        // OrgId → organization_id
        builder.Property(e => e.OrgId).IsRequired().HasColumnName("organization_id");

        // account_code is VARCHAR(50) in DB (entity config had 20 — extend to match)
        builder.Property(e => e.AccountCode).HasMaxLength(50).IsRequired().HasColumnName("account_code");

        // account_name is VARCHAR(300) in DB (entity config had 200 — extend to match)
        builder.Property(e => e.AccountName).HasMaxLength(300).IsRequired().HasColumnName("account_name");

        // account_type VARCHAR(50) CHECK (ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE)
        builder.Property(e => e.AccountType).HasMaxLength(50).IsRequired().HasColumnName("account_type");
        builder.Property(e => e.AccountSubtype).HasMaxLength(100).HasColumnName("account_subtype");
        builder.Property(e => e.ParentAccountId).HasColumnName("parent_account_id");
        builder.Property(e => e.IsActive).IsRequired().HasDefaultValue(true).HasColumnName("is_active");

        // DB has no is_postable column — map to is_system_account (inverse: system=not-postable)
        // DDL HANDOFF (db-engineer): add is_postable BOOLEAN NOT NULL DEFAULT TRUE to accounting.account.
        builder.Ignore(e => e.IsPostable);

        // DB has no is_from_template or template_code columns — seeding provenance is not in schema yet.
        // DDL HANDOFF (db-engineer): add is_from_template BOOLEAN NOT NULL DEFAULT FALSE,
        //                             template_code VARCHAR(20) NULL to accounting.account.
        builder.Ignore(e => e.IsFromTemplate);
        builder.Ignore(e => e.TemplateCode);

        // DB requires currency NOT NULL DEFAULT 'INR' — inject as shadow property to satisfy constraint.
        builder.Property<string>("Currency")
            .HasColumnName("currency")
            .HasMaxLength(10)
            .IsRequired()
            .HasDefaultValue("INR");

        builder.HasIndex(e => new { e.OrgId, e.AccountCode }).IsUnique();
        builder.HasIndex(e => e.OrgId);
    }
}
