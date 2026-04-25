using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Threads.Commands.AddParticipant;

/// <summary>Adds a participant to an existing thread.</summary>
[RequiresPermission("chat.thread.assign")]
public record AddParticipantCommand(
    Guid ThreadId,
    Guid UserId,
    ParticipantRole Role) : ICommand<Result>;

/// <summary>Validates AddParticipantCommand.</summary>
public sealed class AddParticipantCommandValidator : AbstractValidator<AddParticipantCommand>
{
    public AddParticipantCommandValidator()
    {
        RuleFor(x => x.ThreadId).NotEmpty();
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Role).IsInEnum();
    }
}

/// <summary>Handler: adds participant with IDOR org-scoping.</summary>
public sealed class AddParticipantCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<AddParticipantCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result<Result>> Handle(
        AddParticipantCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;
        if (!orgId.HasValue)
            return Error.Validation("Chat.NoOrg", "User is not associated with an organisation.");

        var threadExists = await db.Threads
            .AnyAsync(t => t.Id == request.ThreadId && t.OrganizationId == orgId && t.DeletedAt == null,
                cancellationToken);

        if (!threadExists)
            return Error.NotFound("ChatThread", request.ThreadId);

        var alreadyExists = await db.ThreadParticipants
            .AnyAsync(p => p.ThreadId == request.ThreadId
                           && p.UserId == request.UserId
                           && p.DeletedAt == null, cancellationToken);

        if (alreadyExists)
            return Result.Success();

        db.ThreadParticipants.Add(ThreadParticipant.Create(request.ThreadId, request.UserId, request.Role));
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
