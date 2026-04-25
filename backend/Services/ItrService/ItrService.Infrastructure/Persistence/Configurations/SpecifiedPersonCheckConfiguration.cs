using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the <see cref="SpecifiedPersonCheck"/> entity,
/// mapping to itr.specified_person_check.
/// </summary>
public class SpecifiedPersonCheckConfiguration : IEntityTypeConfiguration<SpecifiedPersonCheck>
{
    public void Configure(EntityTypeBuilder<SpecifiedPersonCheck> builder)
    {
        builder.ToTable("specified_person_check");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.Pan).HasColumnName("pan").HasMaxLength(10).IsRequired();
        builder.Property(x => x.AssessmentYear).HasColumnName("assessment_year").HasMaxLength(10).IsRequired();
        builder.Property(x => x.IsSpecifiedPerson).HasColumnName("is_specified_person").IsRequired();
        builder.Property(x => x.Reason).HasColumnName("reason");
        builder.Property(x => x.CheckedAt).HasColumnName("checked_at").IsRequired();
        builder.Property(x => x.CheckSource).HasColumnName("check_source").HasMaxLength(30).IsRequired();
        builder.Property(x => x.ApiResponseRef).HasColumnName("api_response_ref").HasMaxLength(200);
        builder.Property(x => x.ValidUntil).HasColumnName("valid_until");
        builder.Property(x => x.CreatedAt).HasColumnName("created_at");
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        builder.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        builder.Property(x => x.CreatedBy).HasColumnName("created_by");
        builder.Property(x => x.UpdatedBy).HasColumnName("updated_by");

        builder.HasIndex(x => x.Pan).HasDatabaseName("idx_specified_person_pan");
    }
}
