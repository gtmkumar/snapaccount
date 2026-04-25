using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ReportService.Application.Common.Interfaces;
using ReportService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ReportService.Application.Reports.Commands.GenerateReport;

/// <summary>
/// Queues and immediately processes a report generation job.
/// Supports 7 report types: TrialBalance, ProfitAndLoss, BalanceSheet, CashFlow,
/// TaxLiability, LedgerByAccount, LoanPackage.
/// </summary>
public record GenerateReportCommand(
    ReportType ReportType,
    ReportFormat Format,
    string? FinancialYear,
    DateTime? PeriodStart,
    DateTime? PeriodEnd,
    Guid? LoanApplicationId = null) : ICommand<GenerateReportResponse>;

/// <summary>Response after report generation.</summary>
public record GenerateReportResponse(
    Guid JobId,
    string Status,
    string? GcsUri,
    string? Sha256HashHex,
    int? PageCount);

/// <summary>Validates GenerateReportCommand inputs.</summary>
public sealed class GenerateReportCommandValidator : AbstractValidator<GenerateReportCommand>
{
    public GenerateReportCommandValidator()
    {
        RuleFor(x => x.ReportType).IsInEnum();
        RuleFor(x => x.Format).IsInEnum();
        RuleFor(x => x.FinancialYear)
            .MaximumLength(10)
            .Matches(@"^\d{4}-\d{2}$").When(x => x.FinancialYear != null)
            .WithMessage("FinancialYear must be in format YYYY-YY (e.g., 2024-25).");
        RuleFor(x => x.PeriodStart)
            .LessThan(x => x.PeriodEnd).When(x => x.PeriodStart.HasValue && x.PeriodEnd.HasValue)
            .WithMessage("PeriodStart must be before PeriodEnd.");
        RuleFor(x => x.LoanApplicationId)
            .NotEmpty().When(x => x.ReportType == ReportType.LoanPackage)
            .WithMessage("LoanApplicationId is required for LoanPackage reports.");
    }
}

/// <summary>Handler: creates a ReportJob and invokes the generator immediately (sync for now; Hangfire in Phase 7).</summary>
public sealed class GenerateReportCommandHandler(
    IReportServiceDbContext db,
    ICurrentUser currentUser,
    IEnumerable<IReportGenerator> generators) : ICommandHandler<GenerateReportCommand, GenerateReportResponse>
{
    /// <inheritdoc />
    public async Task<Result<GenerateReportResponse>> Handle(
        GenerateReportCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Result<GenerateReportResponse>.Failure(
                Error.Validation("Report.NoOrg", "User is not associated with an organisation."));

        // Check for a generator that supports this type/format
        var generator = generators.FirstOrDefault(g => g.Supports(request.ReportType, request.Format));
        if (generator == null)
            return Result<GenerateReportResponse>.Failure(
                Error.Validation("Report.UnsupportedType",
                    $"No generator available for {request.ReportType}/{request.Format}."));

        // Create and persist the job
        var job = new ReportJob
        {
            OrgId = orgId.Value,
            RequestedBy = currentUser.UserId.ToString(),
            ReportType = request.ReportType,
            Format = request.Format,
            FinancialYear = request.FinancialYear,
            PeriodStart = request.PeriodStart,
            PeriodEnd = request.PeriodEnd,
            LoanApplicationId = request.LoanApplicationId,
            Status = ReportJobStatus.Processing,
            StartedAt = DateTime.UtcNow
        };

        db.ReportJobs.Add(job);
        await db.SaveChangesAsync(cancellationToken);

        // Generate synchronously (Hangfire deferred execution in Phase 7)
        try
        {
            var result = await generator.GenerateAsync(job, cancellationToken);

            job.Status = ReportJobStatus.Completed;
            job.GcsUri = result.GcsUri;
            job.Sha256HashHex = result.Sha256HashHex;
            job.PageCount = result.PageCount;
            job.CompletedAt = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            job.Status = ReportJobStatus.Failed;
            job.ErrorMessage = ex.Message;
            job.CompletedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);

        return new GenerateReportResponse(
            job.Id,
            job.Status.ToString(),
            job.GcsUri,
            job.Sha256HashHex,
            job.PageCount);
    }
}
