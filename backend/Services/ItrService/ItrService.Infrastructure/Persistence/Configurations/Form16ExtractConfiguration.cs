using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Form16Extract"/> → itr.form_16_extracts.
/// SWEEP-FIX: aligned all property/column mappings to actual DB schema.
/// P6-HANDOFF-19: employee_pan_cipher is AES-256-CBC ciphertext, never plaintext PAN.
/// P6-HANDOFF-21: parsed_json is JSONB — DPDP cascade must null on erasure.
/// DB columns verified via psql \d itr.form_16_extracts (2026-06-11).
/// </summary>
public sealed class Form16ExtractConfiguration : IEntityTypeConfiguration<Form16Extract>
{
    public void Configure(EntityTypeBuilder<Form16Extract> builder)
    {
        builder.ToTable("form_16_extracts");
        builder.HasKey(f => f.Id);

        // filing_id UUID nullable FK
        builder.Property(f => f.FilingId)
            .HasColumnName("filing_id");

        // DB uses user_id for AssesseeId
        builder.Property(f => f.AssesseeId)
            .HasColumnName("user_id")
            .IsRequired();

        // employee_pan_cipher TEXT nullable — P6-HANDOFF-19
        builder.Property(f => f.EmployeePanCipher)
            .HasColumnName("employee_pan_cipher")
            .IsRequired();

        // employer_tan VARCHAR(15) nullable
        builder.Property(f => f.EmployerTan)
            .HasColumnName("employer_tan")
            .HasMaxLength(15);

        // employer_name TEXT nullable (no employer_pan column in DB)
        builder.Property(f => f.EmployerName)
            .HasColumnName("employer_name");

        // gross_salary NUMERIC(20,2) nullable
        builder.Property(f => f.GrossSalary)
            .HasColumnName("gross_salary")
            .HasColumnType("numeric(20,2)");

        // tds_deducted NUMERIC(20,2) nullable
        builder.Property(f => f.TdsDeducted)
            .HasColumnName("tds_deducted")
            .HasColumnType("numeric(20,2)");

        // parsed_json JSONB nullable — DPDP cascade nulls on erasure
        builder.Property(f => f.ParsedJson)
            .HasColumnName("parsed_json")
            .HasColumnType("jsonb");

        // parse_confidence NUMERIC(5,2) nullable — maps to OcrConfidenceScore
        builder.Property(f => f.OcrConfidenceScore)
            .HasColumnName("parse_confidence")
            .HasColumnType("numeric(5,2)");

        // DPDP columns — present in DB
        builder.Property(f => f.AnonymizedAt)
            .HasColumnName("anonymized_at");
        builder.Property(f => f.AnonymizationReason)
            .HasColumnName("anonymization_reason");

        // Properties with no matching DB column — ignore them.
        // Entity: GcsUri — DB does not have a gcs_uri column (document uploaded via document_id FK).
        // DDL HANDOFF (db-engineer): add gcs_uri TEXT to itr.form_16_extracts if direct GCS URI storage needed.
        builder.Ignore(f => f.GcsUri);

        // Entity: EmployeePanLast4 — DB has no employee_pan_last4 column.
        // DDL HANDOFF (db-engineer): add employee_pan_last4 VARCHAR(4) to itr.form_16_extracts.
        builder.Ignore(f => f.EmployeePanLast4);

        // Entity: EmployerPan — DB has no employer_pan column.
        // DDL HANDOFF (db-engineer): add employer_pan VARCHAR(10) to itr.form_16_extracts.
        builder.Ignore(f => f.EmployerPan);

        // Entity: AssessmentYear — DB uses 'ay' TEXT NOT NULL.
        builder.Property(f => f.AssessmentYear)
            .HasColumnName("ay");

        // Entity: OcrStatus — DB has no ocr_status column. ignore.
        // DDL HANDOFF (db-engineer): add ocr_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' to itr.form_16_extracts.
        builder.Ignore(f => f.OcrStatus);

        // Shadow properties for DB columns without entity properties
        // document_id UUID NOT NULL
        builder.Property<Guid>("DocumentId")
            .HasColumnName("document_id")
            .IsRequired()
            .HasDefaultValueSql("gen_random_uuid()");

        // standard_deduction NUMERIC(20,2) nullable
        builder.Property<decimal?>("StandardDeduction")
            .HasColumnName("standard_deduction")
            .HasColumnType("numeric(20,2)");

        // professional_tax NUMERIC(20,2) nullable
        builder.Property<decimal?>("ProfessionalTax")
            .HasColumnName("professional_tax")
            .HasColumnType("numeric(20,2)");

        // parser_version VARCHAR(40) nullable
        builder.Property<string?>("ParserVersion")
            .HasColumnName("parser_version")
            .HasMaxLength(40);

        // parsed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        builder.Property<DateTime>("ParsedAt")
            .HasColumnName("parsed_at")
            .IsRequired()
            .HasDefaultValueSql("now()");

        // is_verified BOOLEAN NOT NULL DEFAULT false
        builder.Property<bool>("IsVerified")
            .HasColumnName("is_verified")
            .IsRequired()
            .HasDefaultValue(false);

        // verified_by UUID nullable, verified_at TIMESTAMPTZ nullable
        builder.Property<Guid?>("VerifiedBy").HasColumnName("verified_by");
        builder.Property<DateTime?>("VerifiedAt").HasColumnName("verified_at");

        builder.HasIndex(f => f.FilingId).HasDatabaseName("idx_form_16_extracts_filing_id");
        builder.HasIndex(f => f.AssesseeId).HasDatabaseName("idx_form_16_extracts_user_id");
        builder.HasQueryFilter(f => f.DeletedAt == null);
    }
}
