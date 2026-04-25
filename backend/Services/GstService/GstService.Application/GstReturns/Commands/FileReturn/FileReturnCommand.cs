using GstService.Application.Interfaces;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace GstService.Application.GstReturns.Commands.FileReturn;

/// <remarks>SEC-012: Requires CA/Admin permission to file a return.</remarks>
[RequiresPermission("gst.returns.file")]
public record FileReturnCommand(Guid GstReturnId, string ArnNumber) : ICommand;

/// <summary>
/// Transitions an APPROVED GST return to FILED status using the ARN received
/// from the GST portal. Publishes <c>GstReturnFiledEvent</c> via domain events.
/// TODO Phase 2: Integrate with actual GST portal API to obtain ARN.
/// </summary>
public sealed class FileReturnCommandHandler(IGstReturnRepository repository)
    : ICommandHandler<FileReturnCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(FileReturnCommand request, CancellationToken cancellationToken)
    {
        var gstReturn = await repository.GetByIdAsync(request.GstReturnId, cancellationToken);
        if (gstReturn is null)
            return Result.Failure(Error.NotFound("GstReturn", request.GstReturnId));

        var result = gstReturn.File(request.ArnNumber);
        if (result.IsFailure)
            return result;

        await repository.UpdateAsync(gstReturn, cancellationToken);
        return Result.Success();
    }
}
