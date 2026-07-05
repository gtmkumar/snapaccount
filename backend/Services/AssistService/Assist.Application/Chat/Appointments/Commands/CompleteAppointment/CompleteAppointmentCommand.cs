using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Commands.CompleteAppointment;

/// <summary>
/// Marks a CONFIRMED appointment as COMPLETED.
/// Can be called by the CA (after the meeting ends) or by the system (auto-complete Hangfire job).
///
/// DG-CHAT-02: Unblocks the rating path (Rate() requires Status == COMPLETED).
/// RBAC: requires chat.slots.manage (CA/staff tier).
/// IDOR: scoped to the CA's own appointments when called via HTTP; no IDOR guard when called
/// by the Hangfire auto-complete job (the job passes skipOwnerCheck = true).
/// </summary>
[RequiresPermission("chat.slots.manage")]
public record CompleteAppointmentCommand(
    Guid AppointmentId,
    bool SkipOwnerCheck = false) : ICommand<CompleteAppointmentResponse>;

/// <summary>Response after marking an appointment completed.</summary>
public record CompleteAppointmentResponse(Guid AppointmentId, string Status);

/// <summary>Validates CompleteAppointmentCommand.</summary>
public sealed class CompleteAppointmentCommandValidator : AbstractValidator<CompleteAppointmentCommand>
{
    public CompleteAppointmentCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
    }
}

/// <summary>Handles CompleteAppointmentCommand — transitions CONFIRMED → COMPLETED.</summary>
public sealed class CompleteAppointmentCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<CompleteAppointmentCommand, CompleteAppointmentResponse>
{
    /// <inheritdoc />
    public async Task<Result<CompleteAppointmentResponse>> Handle(
        CompleteAppointmentCommand request,
        CancellationToken cancellationToken)
    {
        IQueryable<ChatService.Domain.Entities.Appointment> query = db.Appointments;

        if (!request.SkipOwnerCheck)
        {
            // HTTP path: CA may only complete their own appointments.
            if (currentUser.UserId == default)
                return Result<CompleteAppointmentResponse>.Failure(
                    Error.Unauthorized("CompleteAppointment.Unauthenticated", "User is not authenticated."));

            var caProfile = await db.CaProfiles
                .FirstOrDefaultAsync(p => p.UserId == currentUser.UserId, cancellationToken);

            if (caProfile == null)
                return Result<CompleteAppointmentResponse>.Failure(
                    Error.NotFound("CaProfile.NotFound", "No CA profile found for your account."));

            query = query.Where(a => a.CaProfileId == caProfile.Id);
        }

        var appointment = await query
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId, cancellationToken);

        if (appointment == null)
            return Result<CompleteAppointmentResponse>.Failure(
                Error.NotFound("Appointment.NotFound", "Appointment not found."));

        var completeResult = appointment.Complete();
        if (!completeResult.IsSuccess)
            return Result<CompleteAppointmentResponse>.Failure(completeResult.Error!);

        await db.SaveChangesAsync(cancellationToken);

        return Result<CompleteAppointmentResponse>.Success(
            new CompleteAppointmentResponse(appointment.Id, appointment.Status.ToString()));
    }
}
