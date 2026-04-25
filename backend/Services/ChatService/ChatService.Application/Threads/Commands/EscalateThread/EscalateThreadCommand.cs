using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.EscalateThread;

/// <summary>Escalates a support thread (e.g. to a CA).</summary>
[RequiresPermission("chat.thread.escalate")]
public record EscalateThreadCommand(Guid ThreadId) : ICommand<Result>;

/// <summary>Validates EscalateThreadCommand.</summary>
public sealed class EscalateThreadCommandValidator : AbstractValidator<EscalateThreadCommand>
{
    public EscalateThreadCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
    }
}

/// <summary>Handler: escalates thread with IDOR org-scoping.</summary>
public sealed class EscalateThreadCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<EscalateThreadCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        EscalateThreadCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        var thread = await db.Threads
            .Where(t => t.Id == request.ThreadId && t.OrganizationId == orgId && t.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (thread == null)
            return Error.NotFound("ChatThread", request.ThreadId);

        var result = thread.Escalate(currentUser.UserId);
        if (result.IsFailure)
            return result.Error;

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
