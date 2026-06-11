using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.BookAppointment;

/// <summary>
/// Books an available slot with a CA and confirms the appointment.
/// Generates a meeting link via <see cref="IMeetingLinkProvider"/> and raises
/// <see cref="Domain.Events.AppointmentBookedEvent"/> for reminder scheduling.
/// RBAC: requires chat.appointments.book (org-member tier).
/// Migration 086: Topic is now persisted as a first-class column (not embedded in Notes).
/// </summary>
[RequiresPermission("chat.appointments.book")]
public record BookAppointmentCommand(
    Guid CaProfileId,
    Guid SlotId,
    string? Notes = null,
    string? Topic = null) : ICommand<BookAppointmentResponse>;

/// <summary>Response after booking an appointment.</summary>
public record BookAppointmentResponse(
    Guid AppointmentId,
    Guid SlotId,
    string MeetLink,
    DateTime SlotStartUtc,
    DateTime SlotEndUtc,
    string Status,
    string? Topic = null);

/// <summary>Validates BookAppointmentCommand.</summary>
public sealed class BookAppointmentCommandValidator : AbstractValidator<BookAppointmentCommand>
{
    private static readonly string[] ValidTopics = ["ACCOUNTING", "GST", "ITR", "LOAN", "OTHER"];

    public BookAppointmentCommandValidator()
    {
        RuleFor(x => x.CaProfileId).NotEmpty();
        RuleFor(x => x.SlotId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(2000).When(x => x.Notes != null);
        RuleFor(x => x.Topic)
            .MaximumLength(50)
            .Must(t => ValidTopics.Contains(t!))
            .WithMessage($"Topic must be one of: {string.Join(", ", ValidTopics)}")
            .When(x => x.Topic != null);
    }
}

/// <summary>Handles BookAppointmentCommand — reserves slot, creates appointment, generates meet link.</summary>
public sealed class BookAppointmentCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser,
    IMeetingLinkProvider meetingLinkProvider) : ICommandHandler<BookAppointmentCommand, BookAppointmentResponse>
{
    /// <inheritdoc />
    public async Task<Result<BookAppointmentResponse>> Handle(
        BookAppointmentCommand request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId == default || !currentUser.OrganizationId.HasValue)
            return Result<BookAppointmentResponse>.Failure(Error.Unauthorized("Appointment.Unauthenticated", "User is not authenticated."));

        // Load CA profile — verify it's active
        var caProfile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.Id == request.CaProfileId && p.IsActive, cancellationToken);

        if (caProfile == null)
            return Result<BookAppointmentResponse>.Failure(Error.NotFound("CaProfile.NotFound",
                "CA profile not found or no longer accepting bookings."));

        // Load and reserve the slot
        var slot = await db.AppointmentSlots
            .FirstOrDefaultAsync(s => s.Id == request.SlotId && s.CaProfileId == request.CaProfileId, cancellationToken);

        if (slot == null)
            return Result<BookAppointmentResponse>.Failure(Error.NotFound("Slot.NotFound", "Slot not found."));

        var bookResult = slot.MarkBooked();
        if (!bookResult.IsSuccess)
            return Result<BookAppointmentResponse>.Failure(bookResult.Error!);

        // Create appointment in DRAFT
        var appointment = Appointment.Create(
            currentUser.OrganizationId.Value,
            currentUser.UserId,
            caProfile.Id,
            slot.Id,
            request.Notes,
            request.Topic);

        // Generate meeting link
        var meetLink = await meetingLinkProvider.CreateMeetingLinkAsync(
            appointment.Id, slot.StartUtc, slot.EndUtc, cancellationToken);

        // Transition to CONFIRMED and raise domain event
        var confirmResult = appointment.Confirm(meetLink, slot.StartUtc);
        if (!confirmResult.IsSuccess)
            return Result<BookAppointmentResponse>.Failure(confirmResult.Error!);

        db.Appointments.Add(appointment);
        await db.SaveChangesAsync(cancellationToken);

        return Result<BookAppointmentResponse>.Success(new BookAppointmentResponse(
            appointment.Id,
            slot.Id,
            meetLink,
            slot.StartUtc,
            slot.EndUtc,
            appointment.Status.ToString(),
            appointment.Topic));
    }
}
