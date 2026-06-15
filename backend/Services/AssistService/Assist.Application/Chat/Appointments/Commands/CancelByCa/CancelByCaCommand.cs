using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.CancelByCa;

/// <summary>
/// CA-initiated cancellation of an appointment.
///
/// Distinct from the user-facing <see cref="CancelAppointment.CancelAppointmentCommand"/>:
/// <list type="bullet">
///   <item>Bypasses the ≥ 2-hour-before rule — a CA can cancel any time.</item>
///   <item>Requires a mandatory cancellation reason.</item>
///   <item>Marks the appointment with CancelledByCa = true for audit/reporting.</item>
///   <item>Raises <see cref="Domain.Events.AppointmentCancelledByCaEvent"/> so
///         NotificationService pushes an alert to the booking user.</item>
/// </list>
///
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record CancelByCaCommand(Guid AppointmentId, string Reason) : ICommand<CancelByCaResponse>;

/// <summary>Response after CA-initiated cancellation.</summary>
public record CancelByCaResponse(Guid AppointmentId, string Status, bool CancelledByCa);

/// <summary>Validates CancelByCaCommand.</summary>
public sealed class CancelByCaCommandValidator : AbstractValidator<CancelByCaCommand>
{
    public CancelByCaCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("A cancellation reason is required.")
            .MaximumLength(1000).WithMessage("Reason must not exceed 1000 characters.");
    }
}

/// <summary>
/// Handles CancelByCaCommand.
/// Scoped to the calling CA user's profile — the CA may only cancel their own appointments.
/// </summary>
public sealed class CancelByCaCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<CancelByCaCommand, CancelByCaResponse>
{
    /// <inheritdoc />
    public async Task<Result<CancelByCaResponse>> Handle(
        CancelByCaCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default)
            return Result<CancelByCaResponse>.Failure(Error.Unauthorized("CancelByCa.Unauthenticated", "User is not authenticated."));

        // Resolve the CA profile for the calling user (IDOR guard: CA can only cancel their own appointments)
        var caProfile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

        if (caProfile == null)
            return Result<CancelByCaResponse>.Failure(
                Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

        // Load appointment scoped to this CA's profile
        var appointment = await db.Appointments
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId
                                   && a.CaProfileId == caProfile.Id,
                cancellationToken);

        if (appointment == null)
            return Result<CancelByCaResponse>.Failure(
                Error.NotFound("Appointment.NotFound", "Appointment not found."));

        var cancelResult = appointment.CancelByCa(request.Reason);
        if (!cancelResult.IsSuccess)
            return Result<CancelByCaResponse>.Failure(cancelResult.Error!);

        // Release the slot back to available so it can be re-booked
        var slot = await db.AppointmentSlots
            .FirstOrDefaultAsync(s => s.Id == appointment.SlotId, cancellationToken);
        slot?.Release();

        await db.SaveChangesAsync(cancellationToken);

        return Result<CancelByCaResponse>.Success(
            new CancelByCaResponse(appointment.Id, appointment.Status.ToString(), appointment.CancelledByCa));
    }
}
