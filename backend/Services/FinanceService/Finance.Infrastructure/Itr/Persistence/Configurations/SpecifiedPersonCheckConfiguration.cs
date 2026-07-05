using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="SpecifiedPersonCheck"/> entity → itr.specified_person_check.
/// SWEEP-FIX: previous configuration referenced columns that do not exist in DB
/// (pan, assessment_year, reason, checked_at, check_source, api_response_ref, valid_until).
/// DB columns verified via psql \d itr.specified_person_check (2026-06-11).
/// </summary>
public class SpecifiedPersonCheckConfiguration : IEntityTypeConfiguration<SpecifiedPersonCheck>
{
    public void Configure(EntityTypeBuilder<SpecifiedPersonCheck> builder)
    {
        builder.ToTable("specified_person_check");
        builder.HasKey(x => x.Id);

        // user_id UUID NOT NULL
        builder.Property(x => x.UserId)
            .HasColumnName("user_id")
            .IsRequired();

        // pan_number VARCHAR(10) NOT NULL — maps to entity Pan
        builder.Property(x => x.Pan)
            .HasColumnName("pan_number")
            .HasMaxLength(10)
            .IsRequired();

        // assessment_year VARCHAR(10) NOT NULL — DB uses financial_year for this entity context
        builder.Property(x => x.AssessmentYear)
            .HasColumnName("financial_year")
            .HasMaxLength(10);

        // is_specified_person BOOLEAN NOT NULL
        builder.Property(x => x.IsSpecifiedPerson)
            .HasColumnName("is_specified_person")
            .IsRequired();

        // remarks TEXT nullable — maps to entity Reason
        builder.Property(x => x.Reason)
            .HasColumnName("remarks");

        // check_date TIMESTAMPTZ NOT NULL — maps to entity CheckedAt
        builder.Property(x => x.CheckedAt)
            .HasColumnName("check_date")
            .IsRequired();

        // section_applicable VARCHAR(20) NOT NULL — maps to entity CheckSource
        // (repurposing to section_applicable; CheckSource tracks which section applies)
        // Note: DB column check_source doesn't exist; closest is section_applicable.
        builder.Property(x => x.CheckSource)
            .HasColumnName("section_applicable")
            .HasMaxLength(20)
            .IsRequired()
            .HasDefaultValue("206AB");

        // Entity properties with no matching DB column — ignore them.
        // ApiResponseRef → portal_response (jsonb, not varchar)
        // ValidUntil → no matching column
        // DDL HANDOFF (db-engineer):
        //   add api_response_ref VARCHAR(200) to itr.specified_person_check if needed
        //   add valid_until TIMESTAMPTZ to itr.specified_person_check
        builder.Ignore(x => x.ApiResponseRef);
        builder.Ignore(x => x.ValidUntil);

        // Shadow properties for DB columns without entity properties
        // organization_id UUID NOT NULL
        builder.Property<Guid>("OrganizationId")
            .HasColumnName("organization_id")
            .IsRequired()
            .HasDefaultValueSql("gen_random_uuid()");

        // applicable_tds_rate NUMERIC(5,2) nullable
        builder.Property<decimal?>("ApplicableTdsRate")
            .HasColumnName("applicable_tds_rate")
            .HasColumnType("numeric(5,2)");

        // non_filer_years JSONB nullable
        builder.Property<string?>("NonFilerYears")
            .HasColumnName("non_filer_years")
            .HasColumnType("jsonb");

        // portal_response JSONB nullable
        builder.Property<string?>("PortalResponse")
            .HasColumnName("portal_response")
            .HasColumnType("jsonb");

        // checked_by UUID nullable
        builder.Property<Guid?>("CheckedBy")
            .HasColumnName("checked_by");

        builder.HasIndex(x => x.Pan).HasDatabaseName("idx_spec_person_pan");
        builder.HasIndex(x => x.UserId).HasDatabaseName("idx_spec_person_user_id");
        builder.HasQueryFilter(x => x.DeletedAt == null);
    }
}
