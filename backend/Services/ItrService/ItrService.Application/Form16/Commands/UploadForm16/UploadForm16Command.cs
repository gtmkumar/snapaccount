using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Form16.Commands.UploadForm16;

/// <summary>
/// Records a Form 16 upload. The GCS URI must already exist (file uploaded via Storage API).
/// P6-HANDOFF-19: employee PAN stored as ciphertext.
/// Phase 6D.
/// </summary>
[RequiresPermission("itr.form16.upload")]
public record UploadForm16Command(
    Guid FilingId,
    Guid AssesseeId,
    string GcsUri,
    string EmployeePanCipher,
    string EmployeePanLast4) : ICommand<UploadForm16Response>;

public record UploadForm16Response(Guid Form16ExtractId, string OcrStatus);

public sealed class UploadForm16CommandValidator : AbstractValidator<UploadForm16Command>
{
    public UploadForm16CommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.AssesseeId).NotEmpty();
        RuleFor(x => x.GcsUri).NotEmpty().Matches(@"^gs://").WithMessage("GcsUri must be a valid GCS URI starting with gs://");
        RuleFor(x => x.EmployeePanCipher).NotEmpty();
        RuleFor(x => x.EmployeePanLast4).NotEmpty().Length(4);
    }
}

public sealed class UploadForm16CommandHandler(IItrDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<UploadForm16Command, UploadForm16Response>
{
    public async Task<Result<UploadForm16Response>> Handle(UploadForm16Command request, CancellationToken cancellationToken)
    {
        var filing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Filings.Where(f => f.Id == request.FilingId && f.DeletedAt == null), cancellationToken);
        if (filing is null)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // SEC-039: verify assessee belongs to caller's org — NotFound to avoid existence leak
        var assessee = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstOrDefaultAsync(dbContext.Assessees.Where(a => a.Id == filing.AssesseeId && a.DeletedAt == null), cancellationToken);
        if (assessee is null || assessee.OrganizationId != currentUser.OrganizationId)
            return Error.NotFound("Filing.NotFound", $"Filing {request.FilingId} not found.");

        // SEC-041 TODO: EmployeePanCipher should be server-side encrypted via IPanEncryptionService
        // (not client-supplied cipher). Deferred: requires adding IPanEncryptionService to
        // ItrService.Application.Interfaces + Infrastructure implementation + DI wiring.
        var extract = Form16Extract.Create(
            request.FilingId, request.AssesseeId,
            request.GcsUri, request.EmployeePanCipher, request.EmployeePanLast4);

        dbContext.Form16Extracts.Add(extract);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new UploadForm16Response(extract.Id, extract.OcrStatus);
    }
}
