using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.ReopenThread;

/// <summary>Re-opens a resolved or escalated thread.</summary>
public record ReopenThreadCommand(Guid ThreadId) : ICommand<Result>;

/// <summary>Validates ReopenThreadCommand.</summary>
public sealed class ReopenThreadCommandValidator : AbstractValidator<ReopenThreadCommand>
{
    public ReopenThreadCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
    }
}

/// <summary>Handler: re-opens thread with IDOR org-scoping.</summary>
public sealed class ReopenThreadCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<ReopenThreadCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        ReopenThreadCommand request,
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

        var result = thread.Reopen();
        if (result.IsFailure)
            return result.Error;

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
