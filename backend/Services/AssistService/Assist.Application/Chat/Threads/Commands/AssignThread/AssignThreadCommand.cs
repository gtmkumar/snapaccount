using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.AssignThread;

/// <summary>Assigns a thread to an agent or CA user.</summary>
[RequiresPermission("chat.thread.assign")]
public record AssignThreadCommand(
    Guid ThreadId,
    Guid AssigneeUserId,
    ParticipantRole AssigneeRole = ParticipantRole.Agent) : ICommand<Result>;

/// <summary>Validates AssignThreadCommand.</summary>
public sealed class AssignThreadCommandValidator : AbstractValidator<AssignThreadCommand>
{
    public AssignThreadCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
        RuleFor(x => x.AssigneeUserId).NotEmpty();
        RuleFor(x => x.AssigneeRole).IsInEnum();
    }
}

/// <summary>Handler: assigns thread with IDOR org-scoping.</summary>
public sealed class AssignThreadCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<AssignThreadCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        AssignThreadCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        var thread = await db.Threads
            .Include(t => t.Participants.Where(p => p.DeletedAt == null))
            .Where(t => t.Id == request.ThreadId && t.OrganizationId == orgId && t.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (thread == null)
            return Error.NotFound("ChatThread", request.ThreadId);

        thread.Assign(request.AssigneeUserId, request.AssigneeRole);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
