using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class OcrField : BaseAuditableEntity
{
    public Guid OcrResultId { get; private set; }
    public string FieldName { get; private set; } = string.Empty;
    public string? FieldValue { get; private set; }
    public decimal? ConfidenceScore { get; private set; }
    public bool IsOverridden { get; private set; }
    public string? OverriddenValue { get; private set; }
    public Guid? OverriddenBy { get; private set; }
    public DateTime? OverriddenAt { get; private set; }
    public string? BoundingBox { get; private set; } // JSON
    public int? PageNumber { get; private set; }

    private OcrField() { }

    internal static OcrField Create(Guid ocrResultId, string fieldName, string? fieldValue,
        decimal? confidence, int? pageNumber)
        => new()
        {
            OcrResultId = ocrResultId,
            FieldName = fieldName,
            FieldValue = fieldValue,
            ConfidenceScore = confidence,
            PageNumber = pageNumber
        };

    public void Override(string newValue, Guid overriddenByUserId)
    {
        IsOverridden = true;
        OverriddenValue = newValue;
        OverriddenBy = overriddenByUserId;
        OverriddenAt = DateTime.UtcNow;
    }
}
