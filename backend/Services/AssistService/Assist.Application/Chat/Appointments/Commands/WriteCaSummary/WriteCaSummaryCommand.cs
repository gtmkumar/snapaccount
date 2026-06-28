using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Commands.WriteCaSummary;

/// <summary>
/// CA writes (or overwrites) a post-call summary note on a COMPLETED appointment.
/// The note is visible to the user on the appointment detail screen (Screen 45 / Screen 82).
///
/// DG-CHAT-05: persist CaSummaryNote on chat.appointments and expose it via GET /appointments/{id}.
///
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// IDOR: scoped to the calling CA's own appointments only.
/// Business rule: only allowed when Status == COMPLETED.
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record WriteCaSummaryCommand(
    Guid AppointmentId,
    string SummaryNote) : ICommand<WriteCaSummaryResponse>;

/// <summary>Response returned after the CA summary note is persisted.</summary>
public record WriteCaSummaryResponse(
    Guid AppointmentId,
    string? CaSummaryNote);

/// <summary>Validates WriteCaSummaryCommand.</summary>
public sealed class WriteCaSummaryCommandValidator : AbstractValidator<WriteCaSummaryCommand>
{
    public WriteCaSummaryCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();

        RuleFor(x => x.SummaryNote)
            .NotEmpty().WithMessage("Summary note must not be empty.")
            .MaximumLength(4000).WithMessage("Summary note must not exceed 4000 characters.");
    }
}

/// <summary>
/// Handles WriteCaSummaryCommand.
/// Resolves the CA profile from the calling user, then enforces IDOR by loading only
/// that CA's own appointment before delegating to the domain method.
/// </summary>
public sealed class WriteCaSummaryCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<WriteCaSummaryCommand, WriteCaSummaryResponse>
{
    /// <inheritdoc />
    public async Task<Result<WriteCaSummaryResponse>> Handle(
        WriteCaSummaryCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<WriteCaSummaryResponse>.Failure(
                Error.Unauthorized("WriteCaSummary.Unauthenticated", "User is not authenticated."));

        // Resolve calling user's CA profile — enforces that only CAs can use this command.
        var caProfile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

        if (caProfile is null)
            return Result<WriteCaSummaryResponse>.Failure(
                Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

        // IDOR guard: load only this CA's own appointment.
        var appointment = await db.Appointments
            .FirstOrDefaultAsync(
                a => a.Id == request.AppointmentId && a.CaProfileId == caProfile.Id,
                cancellationToken);

        if (appointment is null)
            return Result<WriteCaSummaryResponse>.Failure(
                Error.NotFound("Appointment.NotFound", "Appointment not found."));

        var setResult = appointment.SetCaSummary(request.SummaryNote);
        if (!setResult.IsSuccess)
            return Result<WriteCaSummaryResponse>.Failure(setResult.Error!);

        await db.SaveChangesAsync(cancellationToken);

        return Result<WriteCaSummaryResponse>.Success(
            new WriteCaSummaryResponse(appointment.Id, appointment.CaSummaryNote));
    }
}
