using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace DocumentService.Application.Documents.Commands.RequestOcr;

public record RequestOcrCommand(Guid DocumentId) : ICommand;

public sealed class RequestOcrCommandHandler : ICommandHandler<RequestOcrCommand>
{
    public Task<Result> Handle(RequestOcrCommand request, CancellationToken cancellationToken)
    {
        // TODO: Enqueue OCR job via Hangfire, call Google Document AI
        throw new NotImplementedException("TODO: Enqueue OCR via Hangfire -> Google Document AI.");
    }
}
