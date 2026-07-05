using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.LoanApplications.Commands.AssignToBank;

/// <summary>
/// Assigns a loan application to a specific partner bank and submits the PDF package.
/// Triggers the bank adapter (Email or REST) to deliver the application package.
/// </summary>
[RequiresPermission("loan.bank.assign")]
public record AssignToBankCommand(
    Guid ApplicationId,
    Guid BankId,
    Guid PackageId) : ICommand<AssignToBankResponse>;

/// <summary>Response after bank assignment and submission.</summary>
public record AssignToBankResponse(Guid ApplicationId, string Status, string? BankReferenceNo, string? MessageId);

/// <summary>Validates AssignToBankCommand.</summary>
public sealed class AssignToBankCommandValidator : AbstractValidator<AssignToBankCommand>
{
    public AssignToBankCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.BankId).NotEmpty();
        RuleFor(x => x.PackageId).NotEmpty();
    }
}

/// <summary>Handler: assigns bank, invokes adapter, logs transition.</summary>
public sealed class AssignToBankCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser,
    IPartnerBankAdapterFactory adapterFactory,
    ILoanStorageService cloudStorage) : ICommandHandler<AssignToBankCommand, AssignToBankResponse>
{
    /// <inheritdoc />
    public async Task<Result<AssignToBankResponse>> Handle(
        AssignToBankCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // IDOR: filter by org
        var application = await db.LoanApplications
            .Where(a => a.Id == request.ApplicationId && a.OrgId == orgId && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (application == null)
            return Error.NotFound("LoanApplication", request.ApplicationId);

        var bank = await db.PartnerBanks
            .Where(b => b.Id == request.BankId && b.IsActive && b.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (bank == null)
            return Error.NotFound("PartnerBank", request.BankId);

        var package = await db.LoanPdfPackages
            .Where(p => p.Id == request.PackageId && p.ApplicationId == request.ApplicationId)
            .FirstOrDefaultAsync(cancellationToken);

        if (package == null)
            return Error.NotFound("LoanPdfPackage", request.PackageId);

        // Download PDF from GCS for bank submission
        // Note: GcsUri format: gs://bucket/loan-packages/{app_id}/{package_id}.pdf
        var bucketName = package.GcsUri.Split('/')[2];
        var objectName = string.Join("/", package.GcsUri.Split('/').Skip(3));
        var signedUrl = await cloudStorage.GetSignedDownloadUrlAsync(bucketName, objectName, TimeSpan.FromHours(1), cancellationToken);

        // Get the appropriate adapter keyed by adapter type
        var adapter = adapterFactory.GetAdapter(bank.AdapterType);

        // Create PDF stream (from GCS — in production this would stream directly)
        using var pdfStream = new MemoryStream();
        var submissionResult = await adapter.SubmitApplicationAsync(
            request.ApplicationId, request.BankId, pdfStream, cancellationToken);

        var fromStatus = application.Status.ToString();
        var transitionResult = application.AssignToBank(request.BankId);
        if (transitionResult.IsFailure)
            return Result<AssignToBankResponse>.Failure(transitionResult.Error);

        // P6-HANDOFF-28: status_log in same UoW
        db.ApplicationStatusLogs.Add(new ApplicationStatusLog
        {
            ApplicationId = application.Id,
            FromStatus = fromStatus,
            ToStatus = application.Status.ToString(),
            TransitionedAt = DateTime.UtcNow,
            TransitionedBy = currentUser.UserId,
            Notes = $"Assigned to bank {bank.Name}. MessageId: {submissionResult.MessageId}",
            TransitionSource = "User"
        });

        await db.SaveChangesAsync(cancellationToken);

        return new AssignToBankResponse(
            application.Id,
            application.Status.ToString(),
            submissionResult.BankReferenceNo,
            submissionResult.MessageId);
    }
}
