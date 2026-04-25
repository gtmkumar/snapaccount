using CallbackService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Commands.AddNote;

/// <summary>Adds a call note to an existing callback.</summary>
public record AddNoteCommand(Guid CallbackId, Guid AuthorId, string Content, bool IsInternal) : ICommand;

/// <summary>Validates the add note command.</summary>
public sealed class AddNoteCommandValidator : AbstractValidator<AddNoteCommand>
{
    public AddNoteCommandValidator()
    {
        RuleFor(x => x.CallbackId).NotEmpty();
        RuleFor(x => x.AuthorId).NotEmpty();
        RuleFor(x => x.Content).NotEmpty().MaximumLength(5000);
    }
}

/// <summary>
/// Handles <see cref="AddNoteCommand"/>.
/// SEC-029: verifies the callback belongs to the caller's organization before mutating.
/// </summary>
public sealed class AddNoteCommandHandler(ICallbackDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<AddNoteCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(AddNoteCommand request, CancellationToken cancellationToken)
    {
        var callback = await dbContext.Callbacks
            .FirstOrDefaultAsync(c => c.Id == request.CallbackId && c.DeletedAt == null, cancellationToken);

        if (callback is null)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        // SEC-029: org ownership check — return NotFound to avoid existence leak
        if (currentUser.OrganizationId.HasValue && callback.OrganizationId != currentUser.OrganizationId)
            return Result.Failure(Error.NotFound("Callback", request.CallbackId));

        callback.AddNote(request.AuthorId, request.Content, request.IsInternal);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
