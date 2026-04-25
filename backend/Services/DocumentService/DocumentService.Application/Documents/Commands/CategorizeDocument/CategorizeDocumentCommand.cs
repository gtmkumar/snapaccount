using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.CategorizeDocument;

public record CategorizeDocumentCommand(Guid DocumentId, Guid CategoryId) : ICommand;

public sealed class CategorizeDocumentCommandHandler : ICommandHandler<CategorizeDocumentCommand>
{
    public Task<Result> Handle(CategorizeDocumentCommand request, CancellationToken cancellationToken)
    {
        // TODO: Implement document categorization
        throw new NotImplementedException("TODO: Fetch document, set category, save.");
    }
}
