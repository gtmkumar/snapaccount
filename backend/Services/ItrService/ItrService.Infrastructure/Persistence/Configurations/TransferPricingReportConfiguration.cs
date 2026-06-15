using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="TransferPricingReport"/> entity → itr.transfer_pricing_report.
/// SWEEP-FIX: previous configuration referenced columns that do not exist in DB
/// (report_type, international_transaction_value, domestic_transaction_value, pricing_method,
/// filed_at, acknowledgement_number, notes).
/// DB columns verified via psql \d itr.transfer_pricing_report (2026-06-11).
/// </summary>
public class TransferPricingReportConfiguration : IEntityTypeConfiguration<TransferPricingReport>
{
    public void Configure(EntityTypeBuilder<TransferPricingReport> builder)
    {
        builder.ToTable("transfer_pricing_report");
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

        // status VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
        builder.Property(x => x.Status)
            .HasColumnName("status")
            .HasMaxLength(30)
            .IsRequired()
            .HasDefaultValue("INITIATED");

        // ca_name VARCHAR(300) nullable
        builder.Property(x => x.CaName)
            .HasColumnName("ca_name")
            .HasMaxLength(300);

        // ca_membership_number VARCHAR(50) nullable
        builder.Property(x => x.CaMembershipNumber)
            .HasColumnName("ca_membership_number")
            .HasMaxLength(50);

        // filing_date TIMESTAMPTZ nullable — maps to FiledAt
        builder.Property(x => x.FiledAt)
            .HasColumnName("filing_date");

        // remarks TEXT nullable — maps to Notes
        builder.Property(x => x.Notes)
            .HasColumnName("remarks");

        // Entity properties with no matching DB column — ignore them.
        // ReportType → DB uses form_number VARCHAR(10) (e.g. '3CEB') for this semantic.
        // InternationalTransactionValue → DB uses total_international_transactions NUMERIC(18,2)
        // DomesticTransactionValue → DB uses total_specified_domestic_transactions NUMERIC(18,2)
        // PricingMethod → no DB column
        // AcknowledgementNumber → no DB column (DB doesn't have an ack number column)
        // DDL HANDOFF (db-engineer):
        //   add acknowledgement_number VARCHAR(50) to itr.transfer_pricing_report
        //   add pricing_method VARCHAR(10) to itr.transfer_pricing_report
        builder.Ignore(x => x.ReportType);
        builder.Ignore(x => x.InternationalTransactionValue);
        builder.Ignore(x => x.DomesticTransactionValue);
        builder.Ignore(x => x.PricingMethod);
        builder.Ignore(x => x.AcknowledgementNumber);

        // Shadow properties for DB columns without entity properties
        // entity_name VARCHAR(500) NOT NULL
        builder.Property<string>("EntityName")
            .HasColumnName("entity_name")
            .HasMaxLength(500)
            .IsRequired()
            .HasDefaultValue("");

        // pan VARCHAR(10) NOT NULL — check constraint: PAN format
        builder.Property<string>("Pan")
            .HasColumnName("pan")
            .HasMaxLength(10)
            .IsRequired()
            .HasDefaultValue("AAAAA0000A");

        // total_international_transactions NUMERIC(18,2) nullable
        builder.Property<decimal?>("TotalInternationalTransactions")
            .HasColumnName("total_international_transactions")
            .HasColumnType("numeric(18,2)");

        // total_specified_domestic_transactions NUMERIC(18,2) nullable
        builder.Property<decimal?>("TotalSpecifiedDomesticTransactions")
            .HasColumnName("total_specified_domestic_transactions")
            .HasColumnType("numeric(18,2)");

        // associated_enterprises_count SMALLINT nullable
        builder.Property<short?>("AssociatedEnterprisesCount")
            .HasColumnName("associated_enterprises_count");

        // report_date TIMESTAMPTZ nullable
        builder.Property<DateTime?>("ReportDate")
            .HasColumnName("report_date");

        // udin VARCHAR(50) nullable
        builder.Property<string?>("Udin")
            .HasColumnName("udin")
            .HasMaxLength(50);

        // due_date TIMESTAMPTZ NOT NULL
        builder.Property<DateTime>("DueDate")
            .HasColumnName("due_date")
            .IsRequired()
            .HasDefaultValueSql("now()");

        // form_number VARCHAR(10) DEFAULT '3CEB'
        builder.Property<string>("FormNumber")
            .HasColumnName("form_number")
            .HasMaxLength(10)
            .HasDefaultValue("3CEB");

        // assigned_to UUID nullable
        builder.Property<Guid?>("AssignedTo")
            .HasColumnName("assigned_to");

        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_tp_report_user_id");
        builder.HasIndex(x => x.OrganizationId).HasDatabaseName("idx_tp_report_org_id");
        builder.HasIndex(x => x.AssessmentYear).HasDatabaseName("idx_tp_report_ay");
        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
