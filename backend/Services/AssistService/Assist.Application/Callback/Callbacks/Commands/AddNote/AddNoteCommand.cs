using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Entities;
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

        // Add the note via the DbSet (Added state) rather than through the loaded
        // aggregate's navigation collection. CallNote : BaseEntity sets Id =
        // Guid.NewGuid() at construction, so adding it to an already-tracked parent's
        // collection makes EF's DetectChanges treat it as Modified (key is set) and
        // emit an UPDATE that affects 0 rows → DbUpdateConcurrencyException. Explicit
        // Add forces an INSERT.
        var note = CallNote.Create(callback.Id, request.AuthorId, request.Content, request.IsInternal);
        dbContext.CallNotes.Add(note);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
