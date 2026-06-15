using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class DocumentCategory : BaseAuditableEntity
{
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsActive { get; private set; } = true;
    public int SortOrder { get; private set; }

    /// <summary>
    /// GAP-013: Per-category SLA in hours.
    /// A document uploaded in this category is considered overdue if it
    /// has not been approved / rejected within this many hours of upload.
    /// Default: 24 hours (plan J2). NULL = no SLA enforced for this category.
    /// </summary>
    public int? SlaHours { get; private set; } = 24;

    private DocumentCategory() { }

    public static DocumentCategory Create(string code, string name, string? description = null)
        => new() { Code = code, Name = name, Description = description };

    /// <summary>Updates the SLA threshold. Pass null to disable SLA for this category.</summary>
    public void UpdateSla(int? slaHours) => SlaHours = slaHours;
}
