using ChatService.Application.Common.Interfaces;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.RecordTypingPing;

/// <summary>
/// Records a typing indicator ping. Ephemeral — no DB write.
/// Publishes typing state via Redis presence and SignalR.
/// </summary>
public record RecordTypingPingCommand(Guid ThreadId) : ICommand<Result>;

/// <summary>Validates RecordTypingPingCommand.</summary>
public sealed class RecordTypingPingCommandValidator : AbstractValidator<RecordTypingPingCommand>
{
    public RecordTypingPingCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
    }
}

/// <summary>Handler: broadcasts typing indicator via SignalR — no DB write.</summary>
public sealed class RecordTypingPingCommandHandler(
    ICurrentUser currentUser,
    IChatHubNotifier hubNotifier) : ICommandHandler<RecordTypingPingCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        RecordTypingPingCommand request,
        CancellationToken cancellationToken)
    {
        await hubNotifier.NotifyTypingAsync(request.ThreadId, currentUser.UserId, cancellationToken);
        return Result.Success();
    }
}
