using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Commands.MarkNoShow;

/// <summary>
/// Marks a CONFIRMED appointment as NO_SHOW (user did not attend).
/// Called by the CA after waiting past the slot start time with no user attendance.
///
/// DG-CHAT-02: Provides a proper state transition for missed appointments.
/// The slot is released so it can be re-used (consistent with CancelByCa pattern).
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// IDOR: scoped to the CA's own appointments.
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record MarkNoShowCommand(Guid AppointmentId) : ICommand<MarkNoShowResponse>;

/// <summary>Response after marking an appointment no-show.</summary>
public record MarkNoShowResponse(Guid AppointmentId, string Status);

/// <summary>Validates MarkNoShowCommand.</summary>
public sealed class MarkNoShowCommandValidator : AbstractValidator<MarkNoShowCommand>
{
    public MarkNoShowCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
    }
}

/// <summary>Handles MarkNoShowCommand — transitions CONFIRMED → NO_SHOW.</summary>
public sealed class MarkNoShowCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<MarkNoShowCommand, MarkNoShowResponse>
{
    /// <inheritdoc />
    public async Task<Result<MarkNoShowResponse>> Handle(
        MarkNoShowCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<MarkNoShowResponse>.Failure(
                Error.Unauthorized("MarkNoShow.Unauthenticated", "User is not authenticated."));

        // IDOR: CA may only mark no-show on their own appointments.
        var caProfile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

        if (caProfile == null)
            return Result<MarkNoShowResponse>.Failure(
                Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

        var appointment = await db.Appointments
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId
                                   && a.CaProfileId == caProfile.Id,
                cancellationToken);

        if (appointment == null)
            return Result<MarkNoShowResponse>.Failure(
                Error.NotFound("Appointment.NotFound", "Appointment not found."));

        var noShowResult = appointment.MarkNoShow();
        if (!noShowResult.IsSuccess)
            return Result<MarkNoShowResponse>.Failure(noShowResult.Error!);

        // Release the slot back to available so it can potentially be re-booked.
        var slot = await db.AppointmentSlots
            .FirstOrDefaultAsync(s => s.Id == appointment.SlotId, cancellationToken);
        slot?.Release();

        await db.SaveChangesAsync(cancellationToken);

        return Result<MarkNoShowResponse>.Success(
            new MarkNoShowResponse(appointment.Id, appointment.Status.ToString()));
    }
}
