using SnapAccount.Shared.Domain;

namespace AccountingService.Domain.Entities;

/// <summary>
/// Maps to the EXISTING <c>accounting.financial_year_close</c> table from migration 003.
/// P6-HANDOFF-01: do NOT create a parallel table — this entity maps to the existing one.
/// Domain event <see cref="Events.FiscalYearClosedEvent"/> is raised when a FY is closed.
/// </summary>
public class FiscalYearClose : BaseAuditableEntity
{
    /// <summary>Organisation that is closing its financial year.</summary>
    public Guid OrgId { get; private set; }

    /// <summary>Financial year being closed (e.g., 2026 for FY2025-26).</summary>
    public int FyYear { get; private set; }

    /// <summary>OPEN, CLOSING_IN_PROGRESS, CLOSED.</summary>
    public string Status { get; private set; } = "OPEN";

    /// <summary>User who initiated the close.</summary>
    public Guid? ClosedBy { get; private set; }

    /// <summary>Timestamp when the close was completed.</summary>
    public DateTimeOffset? ClosedAt { get; private set; }

    /// <summary>Notes added by the CA during close.</summary>
    public string? Notes { get; private set; }

    private FiscalYearClose() { }

    /// <summary>Opens a new FY close record for an organisation.</summary>
    public static FiscalYearClose Open(Guid orgId, int fyYear)
        => new() { OrgId = orgId, FyYear = fyYear, Status = "OPEN" };

    /// <summary>Completes the fiscal year close. Returns failure if already closed.</summary>
    public Result Close(Guid closedBy, string? notes = null)
    {
        if (Status == "CLOSED")
            return Result.Failure(Error.Conflict("FiscalYear.AlreadyClosed",
                $"FY{FyYear} for organisation {OrgId} is already closed."));

        Status = "CLOSED";
        ClosedBy = closedBy;
        ClosedAt = DateTimeOffset.UtcNow;
        Notes = notes;

        AddDomainEvent(new Events.FiscalYearClosedEvent(Id, OrgId, FyYear));
        return Result.Success();
    }
}
