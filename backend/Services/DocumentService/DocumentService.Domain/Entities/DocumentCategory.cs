using SnapAccount.Shared.Domain;

namespace DocumentService.Domain.Entities;

public class DocumentCategory : BaseAuditableEntity
{
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsActive { get; private set; } = true;
    public int SortOrder { get; private set; }

    private DocumentCategory() { }

    public static DocumentCategory Create(string code, string name, string? description = null)
        => new() { Code = code, Name = name, Description = description };
}
