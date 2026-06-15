using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.RescheduleAppointment;

/// <summary>
/// Reschedules a confirmed appointment to a new slot.
/// Enforces the ≥ 2-hour-before rule against the ORIGINAL slot.
/// The original slot is released and the new slot is marked booked.
/// RBAC: requires chat.appointments.book (org-member).
/// </summary>
[RequiresPermission("chat.appointments.book")]
public record RescheduleAppointmentCommand(
    Guid AppointmentId,
    Guid NewSlotId) : ICommand<RescheduleAppointmentResponse>;

/// <summary>Response after rescheduling.</summary>
public record RescheduleAppointmentResponse(
    Guid AppointmentId,
    Guid NewSlotId,
    string? MeetLink,
    DateTime NewSlotStartUtc,
    DateTime NewSlotEndUtc,
    string Status);

/// <summary>Validates RescheduleAppointmentCommand.</summary>
public sealed class RescheduleAppointmentCommandValidator : AbstractValidator<RescheduleAppointmentCommand>
{
    public RescheduleAppointmentCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
        RuleFor(x => x.NewSlotId).NotEmpty();
    }
}

/// <summary>Handles RescheduleAppointmentCommand — swaps slots with 2h rule enforcement.</summary>
public sealed class RescheduleAppointmentCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser,
    IMeetingLinkProvider meetingLinkProvider) : ICommandHandler<RescheduleAppointmentCommand, RescheduleAppointmentResponse>
{
    /// <inheritdoc />
    public async Task<Result<RescheduleAppointmentResponse>> Handle(
        RescheduleAppointmentCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result<RescheduleAppointmentResponse>.Failure(Error.Unauthorized("Appointment.Unauthenticated", "User is not authenticated."));

        // IDOR: scoped to calling org
        var appointment = await db.Appointments
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId
                                   && a.OrganizationId == currentUser.OrganizationId.Value,
                cancellationToken);

        if (appointment == null)
            return Result<RescheduleAppointmentResponse>.Failure(Error.NotFound("Appointment.NotFound", "Appointment not found."));

        // Load original and new slots
        var originalSlot = await db.AppointmentSlots
            .FirstOrDefaultAsync(s => s.Id == appointment.SlotId, cancellationToken);

        var newSlot = await db.AppointmentSlots
            .FirstOrDefaultAsync(s => s.Id == request.NewSlotId
                                   && s.CaProfileId == appointment.CaProfileId
                                   && s.IsAvailable,
                cancellationToken);

        if (newSlot == null)
            return Result<RescheduleAppointmentResponse>.Failure(Error.NotFound("Slot.NotFound",
                "New slot not found or not available for this CA."));

        var currentSlotStartUtc = originalSlot?.StartUtc ?? DateTime.UtcNow;

        // Generate new meet link
        var newMeetLink = await meetingLinkProvider.CreateMeetingLinkAsync(
            appointment.Id, newSlot.StartUtc, newSlot.EndUtc, cancellationToken);

        // Domain method enforces 2h rule
        var rescheduleResult = appointment.Reschedule(newSlot.Id, currentSlotStartUtc, newMeetLink);
        if (!rescheduleResult.IsSuccess)
            return Result<RescheduleAppointmentResponse>.Failure(rescheduleResult.Error!);

        // Release old slot, book new slot
        originalSlot?.Release();
        var bookResult = newSlot.MarkBooked();
        if (!bookResult.IsSuccess)
            return Result<RescheduleAppointmentResponse>.Failure(bookResult.Error!);

        await db.SaveChangesAsync(cancellationToken);

        return Result<RescheduleAppointmentResponse>.Success(new RescheduleAppointmentResponse(
            appointment.Id,
            newSlot.Id,
            newMeetLink,
            newSlot.StartUtc,
            newSlot.EndUtc,
            appointment.Status.ToString()));
    }
}
