using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class OcrResult : BaseAuditableEntity
{
    public Guid DocumentId { get; private set; }
    public DateTime DocumentAt { get; private set; }
    public string OcrProvider { get; private set; } = "GOOGLE_DOCUMENT_AI";
    public string? RawResponse { get; private set; } // JSON
    public decimal? ConfidenceScore { get; private set; } // 0.0000 - 1.0000
    public int? ProcessingTimeMs { get; private set; }
    public DateTime ProcessedAt { get; private set; } = DateTime.UtcNow;

    public string ConfidenceLevel => ConfidenceScore switch
    {
        >= 0.8m => "GREEN",
        >= 0.5m => "YELLOW",
        _ => "RED"
    };

    private readonly List<OcrField> _fields = [];
    public IReadOnlyCollection<OcrField> Fields => _fields.AsReadOnly();

    private OcrResult() { }

    public static OcrResult Create(Guid documentId, DateTime documentAt, decimal? confidenceScore,
        string? rawResponse = null, int? processingTimeMs = null)
        => new()
        {
            DocumentId = documentId,
            DocumentAt = documentAt,
            ConfidenceScore = confidenceScore,
            RawResponse = rawResponse,
            ProcessingTimeMs = processingTimeMs
        };

    public OcrField AddField(string fieldName, string? fieldValue, decimal? confidence, int? pageNumber = null)
    {
        var field = OcrField.Create(Id, fieldName, fieldValue, confidence, pageNumber);
        _fields.Add(field);
        return field;
    }
}
