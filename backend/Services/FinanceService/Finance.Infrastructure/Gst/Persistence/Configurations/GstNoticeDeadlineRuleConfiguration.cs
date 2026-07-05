using GstService.Domain.Entities;
using GstService.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GstService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="GstNoticeDeadlineRule"/>.
/// Maps to <c>gst.notice_deadline_rules</c> (migration 084).
/// GAP-108: config-driven statutory deadline rules, FY-versioned.
/// </summary>
public sealed class GstNoticeDeadlineRuleConfiguration : IEntityTypeConfiguration<GstNoticeDeadlineRule>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<GstNoticeDeadlineRule> builder)
    {
        builder.ToTable("notice_deadline_rules");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.FinancialYear)
            .IsRequired()
            .HasMaxLength(10)
            .HasColumnName("financial_year");

        // Store GstNoticeFormType as varchar(20) string — resilient to enum reordering.
        builder.Property(r => r.FormType)
            .IsRequired()
            .HasMaxLength(20)
            .HasColumnName("form_type")
            .HasConversion(
                v => v.ToString(),
                v => Enum.Parse<GstNoticeFormType>(v));

        builder.Property(r => r.ResponseWindowDays)
            .IsRequired()
            .HasColumnName("response_window_days");

        builder.Property(r => r.AllowsNoticeTextOverride)
            .IsRequired()
            .HasDefaultValue(true)
            .HasColumnName("allows_notice_text_override");

        builder.Property(r => r.LegalBasis)
            .HasMaxLength(500)
            .HasColumnName("legal_basis");

        builder.Property(r => r.IsActive)
            .IsRequired()
            .HasDefaultValue(true)
            .HasColumnName("is_active");

        // Audit columns
        builder.Property(r => r.CreatedAt).HasColumnName("created_at");
        builder.Property(r => r.UpdatedAt).HasColumnName("updated_at");
        builder.Property(r => r.DeletedAt).HasColumnName("deleted_at");
        builder.Property(r => r.CreatedBy).HasColumnName("created_by");
        builder.Property(r => r.UpdatedBy).HasColumnName("updated_by");

        // Unique index: one active rule per FY+FormType
        builder.HasIndex(r => new { r.FinancialYear, r.FormType })
            .IsUnique()
            .HasDatabaseName("uq_notice_deadline_rules_fy_form_type");

        builder.HasIndex(r => r.IsActive)
            .HasDatabaseName("idx_notice_deadline_rules_active");
    }
}
