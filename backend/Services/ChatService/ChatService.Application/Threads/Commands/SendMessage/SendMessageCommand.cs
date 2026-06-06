using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.SendMessage;

/// <summary>
/// Sends a message in an existing thread.
/// Idempotency: if (thread_id, client_message_id) already exists, returns the existing message.
/// </summary>
public record SendMessageCommand(
    Guid ThreadId,
    string Body,
    string? AttachmentsJson = null,
    string? ClientMessageId = null) : ICommand<SendMessageResponse>;

/// <summary>Response after sending a message.</summary>
public record SendMessageResponse(
    Guid MessageId,
    Guid ThreadId,
    Guid SenderUserId,
    string Body,
    string? AttachmentsJson,
    string? ClientMessageId,
    DateTime CreatedAt);

/// <summary>Validates SendMessageCommand.</summary>
public sealed class SendMessageCommandValidator : AbstractValidator<SendMessageCommand>
{
    public SendMessageCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
        RuleFor(x => x.Body)
            .NotEmpty().WithMessage("Message body is required.")
            .MaximumLength(4000);
        RuleFor(x => x.ClientMessageId)
            .MaximumLength(128).When(x => x.ClientMessageId != null);
    }
}

/// <summary>Handler: sends message with idempotency and org-scoping.</summary>
public sealed class SendMessageCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser,
    IChatHubNotifier hubNotifier) : ICommandHandler<SendMessageCommand, SendMessageResponse>
{
    /// <inheritdoc />
    public async Task<Result<SendMessageResponse>> Handle(
        SendMessageCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        // IDOR: verify thread belongs to org
        var thread = await db.Threads
            .Include(t => t.Participants.Where(p => p.DeletedAt == null))
            .Where(t => t.Id == request.ThreadId && t.OrganizationId == orgId && t.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (thread == null)
            return Error.NotFound("ChatThread", request.ThreadId);

        // Verify caller is a participant
        if (!thread.Participants.Any(p => p.UserId == currentUser.UserId))
            return Error.Forbidden("Chat.NotParticipant", "You are not a participant in this thread.");

        // Idempotency: check (thread_id, client_message_id) for duplicates
        if (!string.IsNullOrEmpty(request.ClientMessageId))
        {
            var existing = await db.Messages
                .Where(m => m.ThreadId == request.ThreadId
                            && m.ClientMessageId == request.ClientMessageId
                            && m.DeletedAt == null)
                .FirstOrDefaultAsync(cancellationToken);

            if (existing != null)
                return ToResponse(existing);
        }

        // Determine if sender is an agent (affects thread status transition)
        var participant = thread.Participants.First(p => p.UserId == currentUser.UserId);
        var isAgent = participant.Role != ParticipantRole.User;

        // Map the participant role to the sender_role CHECK vocabulary
        // ('USER','CA','ADMIN','SYSTEM','AI'). Staff roles (Agent, LoanOfficer) → ADMIN.
        var senderRole = participant.Role switch
        {
            ParticipantRole.User => MessageSenderRole.User,
            ParticipantRole.CA => MessageSenderRole.CA,
            ParticipantRole.Bot => MessageSenderRole.AI,
            _ => MessageSenderRole.Admin,
        };

        var message = ChatMessage.Create(
            request.ThreadId,
            currentUser.UserId,
            request.Body,
            senderRole,
            request.AttachmentsJson,
            request.ClientMessageId);

        if (isAgent)
            thread.OnAgentMessageSent();
        else
            thread.OnUserMessageSent();

        db.Messages.Add(message);
        await db.SaveChangesAsync(cancellationToken);

        // Notify SignalR group
        await hubNotifier.NotifyMessageAsync(request.ThreadId, ToResponse(message), cancellationToken);

        return ToResponse(message);
    }

    private static SendMessageResponse ToResponse(ChatMessage m) =>
        new(m.Id, m.ThreadId, m.SenderUserId ?? Guid.Empty, m.Body,
            m.AttachmentsJson, m.ClientMessageId, m.CreatedAt);
}
