using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.ShareDocument;

public record ShareDocumentCommand(Guid DocumentId, string ShareType, Guid? SharedWith, string? ExternalEmail) : ICommand;

public sealed class ShareDocumentCommandHandler : ICommandHandler<ShareDocumentCommand>
{
    public Task<Result> Handle(ShareDocumentCommand request, CancellationToken cancellationToken)
        => throw new NotImplementedException("TODO: Create document share record.");
}
