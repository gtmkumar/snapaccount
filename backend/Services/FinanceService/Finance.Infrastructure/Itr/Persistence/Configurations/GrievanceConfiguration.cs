using ItrService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ItrService.Infrastructure.Persistence.Configurations;

public sealed class GrievanceConfiguration : IEntityTypeConfiguration<Grievance>
{
    public void Configure(EntityTypeBuilder<Grievance> builder)
    {
        builder.ToTable("grievances");
        builder.HasKey(g => g.Id);
        builder.Property(g => g.FilingId).IsRequired();
        builder.Property(g => g.AssesseeId).IsRequired();
        builder.Property(g => g.RaisedByUserId).IsRequired();
        builder.Property(g => g.Subject).IsRequired().HasMaxLength(200);
        builder.Property(g => g.Body).IsRequired().HasMaxLength(5000);
        builder.Property(g => g.Category).IsRequired().HasMaxLength(60);
        builder.Property(g => g.Status).IsRequired().HasMaxLength(30).HasDefaultValue("OPEN");
        builder.Property(g => g.Response).HasMaxLength(5000);
        builder.HasIndex(g => g.FilingId);
        builder.HasIndex(g => g.AssesseeId);
        builder.HasIndex(g => g.Status);
    }
}
