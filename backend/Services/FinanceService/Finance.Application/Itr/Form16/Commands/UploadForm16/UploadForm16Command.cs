using FluentValidation;
using ItrService.Application.Common.Interfaces;
using ItrService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ItrService.Application.Form16.Commands.UploadForm16;

/// <summary>
/// Records a Form 16 upload. The GCS URI must already exist (file uploaded via Storage API).
/// SEC-041: employee PAN is supplied as PLAINTEXT and encrypted server-side via
/// <see cref="IPanEncryptionService"/>. PAN last-4 is derived server-side as well.
/// </summary>
[RequiresPermission("itr.form16.upload")]
public record UploadForm16Command(
    Guid FilingId,
    Guid AssesseeId,
    string GcsUri,
    string EmployeePan) : ICommand<UploadForm16Response>;

public record UploadForm16Response(Guid Form16ExtractId, string OcrStatus);

public sealed class UploadForm16CommandValidator : AbstractValidator<UploadForm16Command>
{
    public UploadForm16CommandValidator()
    {
        RuleFor(x => x.FilingId).NotEmpty();
        RuleFor(x => x.AssesseeId).NotEmpty();
        RuleFor(x => x.GcsUri).NotEmpty().Matches(@"^gs://").WithMessage("GcsUri must be a valid GCS URI starting with gs://");
        // SEC-041: validate plaintext PAN against canonical XXXXX9999X format before encrypting.
        RuleFor(x => x.EmployeePan)
            .NotEmpty()
            .Matches(@"^[A-Z]{5}[0-9]{4}[A-Z]$")
            .WithMessage("EmployeePan must match PAN format XXXXX9999X.");
    }
}

public sealed class UploadForm16CommandHandler(
    IItrDbContext dbContext,
    ICurrentUser currentUser,
    IPanEncryptionService panEncryption)
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

        // SEC-041: encrypt server-side; never trust client-supplied ciphertext.
        var pan = request.EmployeePan.Trim().ToUpperInvariant();
        var cipher = panEncryption.Encrypt(pan);
        var last4 = pan[^4..];

        var extract = Form16Extract.Create(
            request.FilingId, request.AssesseeId,
            request.GcsUri, cipher, last4);

        dbContext.Form16Extracts.Add(extract);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new UploadForm16Response(extract.Id, extract.OcrStatus);
    }
}
