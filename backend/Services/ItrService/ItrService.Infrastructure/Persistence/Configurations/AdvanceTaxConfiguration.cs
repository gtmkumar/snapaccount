using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="AdvanceTax"/> entity → itr.advance_tax.
/// SWEEP-FIX: aligned to actual DB schema (psql \d itr.advance_tax, 2026-06-11).
/// Key differences: DB column "quarter" maps to entity Installment; several DB columns
/// (estimated_tax, tax_already_paid, tax_due, payment_date, pan_number, remarks, assigned_to)
/// have no entity properties — mapped as shadow properties or ignored.
/// </summary>
public class AdvanceTaxConfiguration : IEntityTypeConfiguration<AdvanceTax>
{
    public void Configure(EntityTypeBuilder<AdvanceTax> builder)
    {
        builder.ToTable("advance_tax");
        builder.HasKey(x => x.Id);

        // user_id UUID NOT NULL
        builder.Property(x => x.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        // organization_id UUID NOT NULL
        builder.Property(x => x.OrganizationId)
            .HasColumnName("organization_id")
            .IsRequired();

        // assessment_year VARCHAR(10) NOT NULL
        builder.Property(x => x.AssessmentYear)
            .HasColumnName("assessment_year")
            .HasMaxLength(10)
            .IsRequired();

        // quarter VARCHAR(10) NOT NULL — maps to entity Installment
        builder.Property(x => x.Installment)
            .HasColumnName("quarter")
            .HasMaxLength(10)
            .IsRequired();

        // due_date TIMESTAMPTZ NOT NULL
        builder.Property(x => x.DueDate)
            .HasColumnName("due_date")
            .IsRequired();

        // estimated_income NUMERIC(18,2) nullable
        builder.Property(x => x.EstimatedIncome)
            .HasColumnName("estimated_income")
            .HasColumnType("numeric(18,2)");

        // tax_already_paid NUMERIC(18,2) DEFAULT 0 — maps to PaidAmount
        builder.Property(x => x.PaidAmount)
            .HasColumnName("tax_already_paid")
            .HasColumnType("numeric(18,2)")
            .HasDefaultValue(0m);

        // challan_number VARCHAR(100) nullable
        builder.Property(x => x.ChallanNumber)
            .HasColumnName("challan_number")
            .HasMaxLength(100);

        // bsr_code VARCHAR(20) nullable
        builder.Property(x => x.BsrCode)
            .HasColumnName("bsr_code")
            .HasMaxLength(20);

        // payment_date TIMESTAMPTZ nullable — maps to PaidAt
        builder.Property(x => x.PaidAt)
            .HasColumnName("payment_date");

        // status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        builder.Property(x => x.Status)
            .HasColumnName("status")
            .HasMaxLength(30)
            .IsRequired()
            .HasDefaultValue("PENDING");

        // interest_234b NUMERIC(18,2) DEFAULT 0 — maps to InterestU234B
        builder.Property(x => x.InterestU234B)
            .HasColumnName("interest_234b")
            .HasColumnType("numeric(18,2)");

        // interest_234c NUMERIC(18,2) DEFAULT 0 — maps to InterestU234C
        builder.Property(x => x.InterestU234C)
            .HasColumnName("interest_234c")
            .HasColumnType("numeric(18,2)");

        // notes TEXT — maps to entity Notes
        builder.Property(x => x.Notes)
            .HasColumnName("remarks");

        // TaxLiability has no direct DB column.
        // DB has: estimated_tax NUMERIC(18,2) nullable and tax_due NUMERIC(18,2) nullable.
        // Map TaxLiability to estimated_tax (closest semantic match).
        builder.Property(x => x.TaxLiability)
            .HasColumnName("estimated_tax")
            .HasColumnType("numeric(18,2)");

        // ChallanAmount has no direct DB column — ignore.
        // DDL HANDOFF (db-engineer): add challan_amount NUMERIC(18,2) to itr.advance_tax if needed.
        builder.Ignore(x => x.ChallanAmount);

        // Shadow properties for DB columns with no entity mapping
        // pan_number VARCHAR(10) nullable — DB constraint: PAN format check
        builder.Property<string?>("PanNumber")
            .HasColumnName("pan_number")
            .HasMaxLength(10);

        // tax_due NUMERIC(18,2) nullable
        builder.Property<decimal?>("TaxDue")
            .HasColumnName("tax_due")
            .HasColumnType("numeric(18,2)");

        // assigned_to UUID nullable — FK to auth.user
        builder.Property<Guid?>("AssignedTo")
            .HasColumnName("assigned_to");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_adv_tax_user_id");
        builder.HasIndex(x => x.AssessmentYear).HasDatabaseName("idx_adv_tax_ay");
        builder.HasIndex(x => x.OrganizationId).HasDatabaseName("idx_adv_tax_org_id");
        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
