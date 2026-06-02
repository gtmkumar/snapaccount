using System.Text.Json;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace AuthService.Infrastructure.Persistence.Configurations;

public class AiConfigurationConfiguration : IEntityTypeConfiguration<AiConfiguration>
{
    private static readonly JsonSerializerOptions Json = new();

    public void Configure(EntityTypeBuilder<AiConfiguration> builder)
    {
        builder.ToTable("ai_configuration");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnName("id");
        builder.Property(c => c.OcrProvider).HasColumnName("ocr_provider").HasMaxLength(50);
        builder.Property(c => c.OcrModel).HasColumnName("ocr_model").HasMaxLength(100);
        builder.Property(c => c.OcrTier).HasColumnName("ocr_tier").HasMaxLength(20);
        builder.Property(c => c.ConfidenceThreshold).HasColumnName("confidence_threshold").HasColumnType("numeric(3,2)");
        builder.Property(c => c.OcrEnabled).HasColumnName("ocr_enabled");
        builder.Property(c => c.AutoClassifyEnabled).HasColumnName("auto_classify_enabled");

        // Sarvam languages: stored as a jsonb string array.
        var langsConverter = new ValueConverter<IReadOnlyList<string>, string>(
            v => JsonSerializer.Serialize(v, Json),
            v => JsonSerializer.Deserialize<List<string>>(v, Json) ?? new List<string>());
        var langsComparer = new ValueComparer<IReadOnlyList<string>>(
            (a, b) => a!.SequenceEqual(b!),
            v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
            v => v.ToList());
        builder.Property(c => c.SarvamLanguages)
            .HasColumnName("sarvam_languages")
            .HasColumnType("jsonb")
            .HasConversion(langsConverter, langsComparer);

        // Per-feature model overrides: stored as a jsonb object keyed by feature name.
        var featuresConverter = new ValueConverter<IReadOnlyDictionary<string, AiFeatureModel>, string>(
            v => JsonSerializer.Serialize(v, Json),
            v => JsonSerializer.Deserialize<Dictionary<string, AiFeatureModel>>(v, Json) ?? new Dictionary<string, AiFeatureModel>());
        var featuresComparer = new ValueComparer<IReadOnlyDictionary<string, AiFeatureModel>>(
            (a, b) => JsonSerializer.Serialize(a, Json) == JsonSerializer.Serialize(b, Json),
            v => JsonSerializer.Serialize(v, Json).GetHashCode(),
            v => JsonSerializer.Deserialize<Dictionary<string, AiFeatureModel>>(JsonSerializer.Serialize(v, Json), Json)!);
        builder.Property(c => c.FeatureModels)
            .HasColumnName("feature_models")
            .HasColumnType("jsonb")
            .HasConversion(featuresConverter, featuresComparer);

        builder.Property(c => c.CreatedAt).HasColumnName("created_at");
        builder.Property(c => c.UpdatedAt).HasColumnName("updated_at");
        builder.Property(c => c.DeletedAt).HasColumnName("deleted_at");
        builder.Ignore(c => c.DomainEvents);
    }
}
