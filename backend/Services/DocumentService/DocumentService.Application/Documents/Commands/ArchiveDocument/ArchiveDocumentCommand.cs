using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.ArchiveDocument;

public record ArchiveDocumentCommand(Guid DocumentId) : ICommand;

public sealed class ArchiveDocumentCommandHandler : ICommandHandler<ArchiveDocumentCommand>
{
    public Task<Result> Handle(ArchiveDocumentCommand request, CancellationToken cancellationToken)
        => throw new NotImplementedException("TODO: Move document to GCS coldline storage, update status.");
}
