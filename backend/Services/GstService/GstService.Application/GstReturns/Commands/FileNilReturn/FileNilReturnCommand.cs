using FluentValidation;
using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.FileNilReturn;

/// <summary>
/// Files a nil GST return (no transactions during the period).
/// Calls the GSTN API to file the nil return and stores the ARN.
/// Nil returns bypass CA approval since there is nothing to verify.
/// Phase 6B: new command — replaces the 501 stub for POST /gst/returns/nil.
/// </summary>
[RequiresPermission("gst.returns.file")]
public record FileNilReturnCommand(
    Guid GstReturnId,
    string Gstin,
    string ReturnType,
    int Year,
    int Month) : ICommand<FileNilReturnResponse>;

/// <summary>Response after nil return filing.</summary>
public record FileNilReturnResponse(Guid GstReturnId, string Arn, string Status);

/// <summary>Validator for nil return command.</summary>
public sealed class FileNilReturnCommandValidator : AbstractValidator<FileNilReturnCommand>
{
    public FileNilReturnCommandValidator()
    {
        RuleFor(x => x.GstReturnId).NotEmpty();
        RuleFor(x => x.Gstin).NotEmpty().Length(15).WithMessage("GSTIN must be exactly 15 characters.");
        RuleFor(x => x.ReturnType)
            .Must(t => t is "GSTR-1" or "GSTR-3B")
            .WithMessage("Nil return is only supported for GSTR-1 and GSTR-3B.");
        RuleFor(x => x.Year).InclusiveBetween(2017, 2100);
        RuleFor(x => x.Month).InclusiveBetween(1, 12);
    }
}

/// <summary>Handler for <see cref="FileNilReturnCommand"/>.</summary>
public sealed class FileNilReturnCommandHandler(
    IGstDbContext dbContext,
    IGstnApiClient gstnClient) : ICommandHandler<FileNilReturnCommand, FileNilReturnResponse>
{
    /// <inheritdoc />
    public async Task<Result<FileNilReturnResponse>> Handle(
        FileNilReturnCommand request,
        CancellationToken cancellationToken)
    {
        var gstReturn = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(
                dbContext.GstReturns.Where(r => r.Id == request.GstReturnId && r.DeletedAt == null),
                cancellationToken);

        if (gstReturn is null)
            return Error.NotFound("GstReturn.NotFound", $"Return {request.GstReturnId} not found.");

        if (gstReturn.Status is "FILED")
            return Error.Conflict("GstReturn.AlreadyFiled", "This return has already been filed.");

        var apiResult = await gstnClient.FileNilReturnAsync(
            request.Gstin, request.ReturnType, request.Year, request.Month, cancellationToken);

        if (!apiResult.IsSuccess || apiResult.Arn is null)
            return new Error("GstReturn.NilFilingFailed", $"GSTN API error: {apiResult.ErrorMessage}");

        // Nil returns: auto-approve then file (no CA approval needed for zero-transaction returns)
        if (gstReturn.Status == "DRAFT")
        {
            gstReturn.SubmitForApproval(Guid.Empty); // system-initiated
            gstReturn.Approve(Guid.Empty);           // auto-approved for nil
        }
        else if (gstReturn.Status == "PENDING_APPROVAL")
        {
            gstReturn.Approve(Guid.Empty);
        }

        var fileResult = gstReturn.File(apiResult.Arn);
        if (fileResult.IsFailure)
            return fileResult.Error;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new FileNilReturnResponse(gstReturn.Id, apiResult.Arn, gstReturn.Status);
    }
}
