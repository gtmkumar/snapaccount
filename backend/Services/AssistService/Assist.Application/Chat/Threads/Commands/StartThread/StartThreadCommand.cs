using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.StartThread;

/// <summary>Opens a new support thread for the authenticated user's organisation.</summary>
public record StartThreadCommand(
    ThreadCategory Category,
    string? Subject,
    string InitialMessage,
    string? ClientMessageId = null) : ICommand<StartThreadResponse>;

/// <summary>Response after opening a thread.</summary>
public record StartThreadResponse(
    Guid ThreadId,
    string Status,
    string Category,
    Guid MessageId);

/// <summary>Validates StartThreadCommand.</summary>
public sealed class StartThreadCommandValidator : AbstractValidator<StartThreadCommand>
{
    public StartThreadCommandValidator()
    {
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Subject).MaximumLength(200).When(x => x.Subject != null);
        RuleFor(x => x.InitialMessage)
            .NotEmpty().WithMessage("Initial message is required.")
            .MaximumLength(4000);
        RuleFor(x => x.ClientMessageId)
            .MaximumLength(128).When(x => x.ClientMessageId != null);
    }
}

/// <summary>Handler: creates thread + first message; applies routing rules.</summary>
public sealed class StartThreadCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser,
    IRoutingRuleEngine routingRuleEngine) : ICommandHandler<StartThreadCommand, StartThreadResponse>
{
    /// <inheritdoc />
    public async Task<Result<StartThreadResponse>> Handle(
        StartThreadCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        // Auto-route category from first message keywords
        var category = routingRuleEngine.Match(request.InitialMessage) ?? request.Category;

        var thread = ChatThread.Open(orgId.Value, currentUser.UserId, category, request.Subject);

        var message = ChatMessage.Create(
            thread.Id,
            currentUser.UserId,
            request.InitialMessage,
            clientMessageId: request.ClientMessageId);

        db.Threads.Add(thread);
        db.Messages.Add(message);
        await db.SaveChangesAsync(cancellationToken);

        return new StartThreadResponse(
            thread.Id,
            thread.Status.ToString(),
            thread.Category.ToString(),
            message.Id);
    }
}
