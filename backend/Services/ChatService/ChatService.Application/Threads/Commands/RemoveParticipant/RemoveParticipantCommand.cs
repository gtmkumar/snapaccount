using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.RemoveParticipant;

/// <summary>Removes (soft-deletes) a participant from a thread.</summary>
[RequiresPermission("chat.thread.assign")]
public record RemoveParticipantCommand(Guid ThreadId, Guid UserId) : ICommand<Result>;

/// <summary>Validates RemoveParticipantCommand.</summary>
public sealed class RemoveParticipantCommandValidator : AbstractValidator<RemoveParticipantCommand>
{
    public RemoveParticipantCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
        RuleFor(x => x.UserId).NotEmpty();
    }
}

/// <summary>Handler: soft-deletes participant with IDOR org-scoping.</summary>
public sealed class RemoveParticipantCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<RemoveParticipantCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        RemoveParticipantCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        var participant = await db.ThreadParticipants
            .Include(p => p.Thread)
            .Where(p => p.ThreadId == request.ThreadId
                        && p.UserId == request.UserId
                        && p.DeletedAt == null
                        && p.Thread.OrganizationId == orgId)
            .FirstOrDefaultAsync(cancellationToken);

        if (participant == null)
            return Error.NotFound("ThreadParticipant", request.UserId);

        participant.SoftDelete();
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
