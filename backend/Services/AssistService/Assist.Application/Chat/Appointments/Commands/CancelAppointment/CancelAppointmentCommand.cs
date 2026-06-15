using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.CancelAppointment;

/// <summary>
/// Cancels a confirmed appointment.
/// Enforces the ≥ 2-hour-before rule via <see cref="Domain.Entities.Appointment.Cancel"/>.
/// The slot is released back to available on success.
/// RBAC: requires chat.appointments.book (org-member, same as booking).
/// </summary>
[RequiresPermission("chat.appointments.book")]
public record CancelAppointmentCommand(Guid AppointmentId) : ICommand<CancelAppointmentResponse>;

/// <summary>Response after cancelling.</summary>
public record CancelAppointmentResponse(Guid AppointmentId, string Status);

/// <summary>Validates CancelAppointmentCommand.</summary>
public sealed class CancelAppointmentCommandValidator : AbstractValidator<CancelAppointmentCommand>
{
    public CancelAppointmentCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
    }
}

/// <summary>Handles CancelAppointmentCommand — enforces 2h rule and releases the slot.</summary>
public sealed class CancelAppointmentCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<CancelAppointmentCommand, CancelAppointmentResponse>
{
    /// <inheritdoc />
    public async Task<Result<CancelAppointmentResponse>> Handle(
        CancelAppointmentCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result<CancelAppointmentResponse>.Failure(Error.Unauthorized("Appointment.Unauthenticated", "User is not authenticated."));

        // IDOR: scoped to calling org
        var appointment = await db.Appointments
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId
                                   && a.OrganizationId == currentUser.OrganizationId.Value,
                cancellationToken);

        if (appointment == null)
            return Result<CancelAppointmentResponse>.Failure(Error.NotFound("Appointment.NotFound", "Appointment not found."));

        // Load the slot to get start time for the 2h rule
        var slot = await db.AppointmentSlots
            .FirstOrDefaultAsync(s => s.Id == appointment.SlotId, cancellationToken);

        var slotStartUtc = slot?.StartUtc ?? DateTime.UtcNow;

        var cancelResult = appointment.Cancel(slotStartUtc);
        if (!cancelResult.IsSuccess)
            return Result<CancelAppointmentResponse>.Failure(cancelResult.Error!);

        // Release slot back to available
        slot?.Release();

        await db.SaveChangesAsync(cancellationToken);

        return Result<CancelAppointmentResponse>.Success(
            new CancelAppointmentResponse(appointment.Id, appointment.Status.ToString()));
    }
}
