using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="GstAnnualReturn"/> entity, mapping to gst.gst_annual_return.
/// </summary>
public class GstAnnualReturnConfiguration : IEntityTypeConfiguration<GstAnnualReturn>
{
    public void Configure(EntityTypeBuilder<GstAnnualReturn> builder)
    {
        builder.ToTable("gst_annual_return");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id");
        builder.Property(x => x.FinancialYear).HasColumnName("financial_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
        builder.Property(x => x.ArnNumber).HasColumnName("arn_number").HasMaxLength(50);

        // SWEEP-FIX: FiledAt → filing_date (column name differs in DB)
        builder.Property(x => x.FiledAt).HasColumnName("filing_date");

        // SWEEP-FIX: Properties with NO column in gst.gst_annual_return — ignore to prevent SQL errors.
        // DB has granular breakdown columns (turnover_as_per_books, itc_as_per_books, tax_payable, etc.)
        // but entity uses aggregated TotalTurnover/TotalTaxPaid/TotalItcClaimed — no direct mapping.
        // DDL HANDOFF (db-engineer): add to gst.gst_annual_return:
        //   form_type VARCHAR(10) NOT NULL DEFAULT 'GSTR9'
        //   total_turnover NUMERIC(15,2)
        //   total_tax_paid NUMERIC(15,2)
        //   total_itc_claimed NUMERIC(15,2)
        //   notes TEXT
        //   is_reconciled BOOLEAN NOT NULL DEFAULT FALSE
        //   reconciled_at TIMESTAMPTZ
        builder.Ignore(x => x.FormType);
        builder.Ignore(x => x.TotalTurnover);
        builder.Ignore(x => x.TotalTaxPaid);
        builder.Ignore(x => x.TotalItcClaimed);
        builder.Ignore(x => x.Notes);
        builder.Ignore(x => x.IsReconciled);
        builder.Ignore(x => x.ReconciledAt);

        // DB also has assigned_to UUID — shadow property
        builder.Property<Guid?>("AssignedTo").HasColumnName("assigned_to");

        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_gst_annual_return_user_id");
        builder.HasIndex(x => x.FinancialYear).HasDatabaseName("idx_gst_annual_return_fy");
    }
}
