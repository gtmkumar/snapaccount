using GstService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="ImsActionLog"/>.
/// Maps to <c>gst.ims_action_logs</c>.
///
/// Append-only: no updates, no deletes. 7-year document retention applies.
/// No soft-delete filter (intentionally omitted — rows are permanent audit records).
/// No FK to <c>ims_invoices</c> enforced in EF (to avoid cascade-delete risk on the append log).
/// </summary>
public sealed class ImsActionLogConfiguration : IEntityTypeConfiguration<ImsActionLog>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<ImsActionLog> builder)
    {
        builder.ToTable("ims_action_logs");

        builder.HasKey(l => l.Id);
        builder.Property(l => l.Id).HasColumnName("id");

        builder.Property(l => l.ImsInvoiceId).HasColumnName("ims_invoice_id").IsRequired();
        builder.Property(l => l.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(l => l.Action).HasColumnName("action").HasMaxLength(30).IsRequired();
        builder.Property(l => l.PreviousStatus).HasColumnName("previous_status").HasMaxLength(20).IsRequired();
        builder.Property(l => l.NewStatus).HasColumnName("new_status").HasMaxLength(20).IsRequired();
        builder.Property(l => l.ActedAt).HasColumnName("acted_at").IsRequired();
        builder.Property(l => l.ActedBy).HasColumnName("acted_by");
        builder.Property(l => l.Reason).HasColumnName("reason").HasMaxLength(500);
        builder.Property(l => l.IsBulk).HasColumnName("is_bulk").HasDefaultValue(false).IsRequired();

        // Indexes
        builder.HasIndex(l => l.ImsInvoiceId)
            .HasDatabaseName("ix_ims_action_logs_invoice_id");
        builder.HasIndex(l => new { l.OrganizationId, l.ActedAt })
            .HasDatabaseName("ix_ims_action_logs_org_acted_at");
    }
}
