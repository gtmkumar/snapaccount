using ItrService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.DocChecklist.Queries.GetDocChecklist;

/// <summary>
/// P6-HANDOFF-23: returns the per-filing document checklist mobile uses to drive
/// the "Documents needed" UI. Static catalog by ITR form type with per-filing
/// completion state derived from <c>itr.form_16_extracts</c>.
/// </summary>
[RequiresPermission("itr.filing.read")]
public record GetDocChecklistQuery(Guid AssesseeId, Guid FilingId)
    : IQuery<DocChecklistResponse>;

public record DocChecklistItem(
    string Code,
    string Label,
    bool Required,
    bool Provided,
    string? Notes);

public record DocChecklistResponse(
    Guid FilingId,
    string ItrFormType,
    string AssessmentYear,
    IReadOnlyList<DocChecklistItem> Items);

public sealed class GetDocChecklistQueryHandler(IItrDbContext db, ICurrentUser currentUser)
    : IQueryHandler<GetDocChecklistQuery, DocChecklistResponse>
{
    private static readonly IReadOnlyDictionary<string, (string Code, string Label, bool Required)[]> ChecklistByForm =
        new Dictionary<string, (string, string, bool)[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["ITR-1"] = new[]
            {
                ("FORM_16", "Form 16 from employer", true),
                ("BANK_STATEMENT", "Bank statement (FY)", true),
                ("INVESTMENT_PROOF_80C", "80C investment proofs", false),
                ("HEALTH_INSURANCE_80D", "80D health insurance receipts", false),
                ("HOME_LOAN_INTEREST", "Home loan interest certificate", false),
            },
            ["ITR-2"] = new[]
            {
                ("FORM_16", "Form 16 from employer", true),
                ("CAPITAL_GAINS", "Capital gains statement (broker)", true),
                ("BANK_STATEMENT", "Bank statement (FY)", true),
                ("FOREIGN_ASSETS", "Foreign assets schedule", false),
                ("INVESTMENT_PROOF_80C", "80C investment proofs", false),
            },
            ["ITR-3"] = new[]
            {
                ("BUSINESS_BOOKS", "Books of accounts (P&L, balance sheet)", true),
                ("BANK_STATEMENT", "Business bank statement (FY)", true),
                ("GST_RETURNS", "GST returns summary (if registered)", false),
                ("AUDIT_REPORT", "Tax audit report (if applicable)", false),
            },
            ["ITR-4"] = new[]
            {
                ("BUSINESS_TURNOVER", "Presumptive turnover declaration", true),
                ("BANK_STATEMENT", "Bank statement (FY)", true),
                ("GST_RETURNS", "GST returns summary (if registered)", false),
            },
        };

    public async Task<Result<DocChecklistResponse>> Handle(GetDocChecklistQuery request, CancellationToken ct)
    {
        if (!currentUser.IsAuthenticated || currentUser.OrganizationId is null)
            return Error.Unauthorized("Auth.Required", "Authentication required.");

        var filing = await db.Filings
            .Where(f => f.Id == request.FilingId && f.AssesseeId == request.AssesseeId && f.DeletedAt == null)
            .FirstOrDefaultAsync(ct);
        if (filing is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        var assessee = await db.Assessees
            .Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null)
            .FirstOrDefaultAsync(ct);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        var hasForm16 = await db.Form16Extracts
            .AnyAsync(f => f.FilingId == filing.Id && f.DeletedAt == null, ct);

        if (!ChecklistByForm.TryGetValue(filing.ItrFormType, out var items))
            items = ChecklistByForm["ITR-1"];

        var response = new DocChecklistResponse(
            filing.Id,
            filing.ItrFormType,
            filing.AssessmentYear,
            items.Select(i => new DocChecklistItem(
                i.Code,
                i.Label,
                i.Required,
                Provided: i.Code == "FORM_16" && hasForm16,
                Notes: null))
                .ToList());

        return response;
    }
}
