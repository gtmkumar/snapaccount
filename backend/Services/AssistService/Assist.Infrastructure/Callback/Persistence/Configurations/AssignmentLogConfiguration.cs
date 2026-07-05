using CallbackService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CallbackService.Infrastructure.Persistence.Configurations;

public sealed class AssignmentLogConfiguration : IEntityTypeConfiguration<AssignmentLog>
{
    public void Configure(EntityTypeBuilder<AssignmentLog> builder)
    {
        builder.ToTable("assignments_log");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.CallbackId).IsRequired();
        builder.Property(a => a.ToUserId).IsRequired();
        builder.Property(a => a.AssignedBy).IsRequired();
        builder.Property(a => a.Reason).HasColumnType("text");
        builder.Property(a => a.AssignedAt).IsRequired();
        builder.HasIndex(a => new { a.CallbackId, a.AssignedAt });
        builder.HasIndex(a => a.ToUserId);
        builder.HasIndex(a => a.AssignedBy);
    }
}
