using SnapAccount.Shared.Domain;

namespace GstService.Domain.Entities;

public class HsnSacCode : BaseAuditableEntity
{
    public string Code { get; private set; } = string.Empty;
    public string CodeType { get; private set; } = string.Empty; // HSN or SAC
    public string Description { get; private set; } = string.Empty;
    public decimal? GstRatePct { get; private set; }
    public bool IsActive { get; private set; } = true;

    private HsnSacCode() { }

    public static HsnSacCode Create(string code, string codeType, string description, decimal? gstRatePct = null)
        => new() { Code = code, CodeType = codeType, Description = description, GstRatePct = gstRatePct };
}
