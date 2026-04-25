using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for <see cref="RefundStatusEntry"/>.</summary>
public sealed class RefundStatusEntryConfiguration : IEntityTypeConfiguration<RefundStatusEntry>
{
    public void Configure(EntityTypeBuilder<RefundStatusEntry> builder)
    {
        builder.ToTable("refund_status_log");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.FilingId).IsRequired();
        builder.Property(r => r.AssesseeId).IsRequired();
        builder.Property(r => r.RefundStatus).IsRequired().HasMaxLength(30).HasDefaultValue("PENDING");
        builder.Property(r => r.RefundAmount).HasColumnType("numeric(18,2)");
        builder.Property(r => r.BankAccount).HasMaxLength(100);
        builder.Property(r => r.TransactionReference).HasMaxLength(100);
        builder.Property(r => r.StatusMessage).HasMaxLength(1000);
        builder.HasIndex(r => r.FilingId);
    }
}
