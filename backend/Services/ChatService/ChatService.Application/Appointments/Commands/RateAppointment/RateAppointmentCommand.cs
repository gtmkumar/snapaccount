using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Application.Behaviors;

namespace ChatService.Application.Appointments.Commands.RateAppointment;

/// <summary>
/// Rates a completed appointment (1–5 stars + optional comment).
/// Updates the CA aggregate rating after persisting the rating.
/// One rating per appointment — returns Conflict if already rated.
/// RBAC: requires chat.appointments.book (org-member).
/// </summary>
[RequiresPermission("chat.appointments.book")]
public record RateAppointmentCommand(
    Guid AppointmentId,
    int Stars,
    string? Comment = null) : ICommand<RateAppointmentResponse>;

/// <summary>Response after rating.</summary>
public record RateAppointmentResponse(
    Guid AppointmentId,
    int Stars,
    decimal CaNewAverageRating,
    int CaRatingCount);

/// <summary>Validates RateAppointmentCommand.</summary>
public sealed class RateAppointmentCommandValidator : AbstractValidator<RateAppointmentCommand>
{
    public RateAppointmentCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
        RuleFor(x => x.Stars).InclusiveBetween(1, 5).WithMessage("Rating must be between 1 and 5.");
        RuleFor(x => x.Comment).MaximumLength(1000).When(x => x.Comment != null);
    }
}

/// <summary>Handles RateAppointmentCommand — persists rating and updates CA aggregate.</summary>
public sealed class RateAppointmentCommandHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : ICommandHandler<RateAppointmentCommand, RateAppointmentResponse>
{
    /// <inheritdoc />
    public async Task<Result<RateAppointmentResponse>> Handle(
        RateAppointmentCommand request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result<RateAppointmentResponse>.Failure(Error.Unauthorized("Appointment.Unauthenticated", "User is not authenticated."));

        // IDOR: scoped to calling org
        var appointment = await db.Appointments
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId
                                   && a.OrganizationId == currentUser.OrganizationId.Value,
                cancellationToken);

        if (appointment == null)
            return Result<RateAppointmentResponse>.Failure(Error.NotFound("Appointment.NotFound", "Appointment not found."));

        var rateResult = appointment.Rate(request.Stars, request.Comment);
        if (!rateResult.IsSuccess)
            return Result<RateAppointmentResponse>.Failure(rateResult.Error!);

        // Update CA aggregate
        var caProfile = await db.CaProfiles
            .FirstOrDefaultAsync(p => p.Id == appointment.CaProfileId, cancellationToken);

        if (caProfile != null)
            caProfile.RecordRating(request.Stars);

        await db.SaveChangesAsync(cancellationToken);

        return Result<RateAppointmentResponse>.Success(new RateAppointmentResponse(
            appointment.Id,
            request.Stars,
            caProfile?.AverageRating ?? 0m,
            caProfile?.RatingCount ?? 0));
    }
}
