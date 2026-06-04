using ChatService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatService.Infrastructure.Persistence.Configurations;

/// <summary>EF Core configuration for chat.routing_rules table.</summary>
public class RoutingRuleConfiguration : IEntityTypeConfiguration<RoutingRule>
{
    public void Configure(EntityTypeBuilder<RoutingRule> builder)
    {
        builder.ToTable("routing_rules");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Keyword)
            .HasColumnName("keyword_pattern")
            .IsRequired();

        builder.Property(r => r.Category)
            .HasColumnName("category")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(r => r.Priority)
            .HasColumnName("priority")
            .IsRequired();

        builder.Property(r => r.IsActive)
            .HasColumnName("is_active")
            .IsRequired();

        builder.HasIndex(r => r.Keyword).HasDatabaseName("ix_routing_rules_keyword");
        builder.HasIndex(r => r.Priority).HasDatabaseName("ix_routing_rules_priority");
    }
}
