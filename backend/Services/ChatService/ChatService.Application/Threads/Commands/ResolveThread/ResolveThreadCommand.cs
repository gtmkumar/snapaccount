using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.ResolveThread;

/// <summary>Marks a thread as resolved.</summary>
[RequiresPermission("chat.thread.resolve")]
public record ResolveThreadCommand(Guid ThreadId) : ICommand<Result>;

/// <summary>Validates ResolveThreadCommand.</summary>
public sealed class ResolveThreadCommandValidator : AbstractValidator<ResolveThreadCommand>
{
    public ResolveThreadCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
    }
}

/// <summary>Handler: resolves thread with IDOR org-scoping.</summary>
public sealed class ResolveThreadCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<ResolveThreadCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        ResolveThreadCommand request,
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

        var result = thread.Resolve(currentUser.UserId);
        if (result.IsFailure)
            return result.Error;

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
