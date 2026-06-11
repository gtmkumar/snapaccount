using ChatService.Application.Appointments.Queries.ListAppointments;
using ChatService.Application.Common;
using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Queries.GetAppointment;

/// <summary>
/// Returns a single appointment by id, IDOR-guarded by the caller's organisation.
/// Equivalent shape to <see cref="AppointmentSummaryDto"/> (same list-item DTO),
/// plus any detail-only fields (Notes, Topic, RatingComment, CaCancellationReason).
///
/// Mobile residual fix: replaces the client-side list-scan workaround.
/// </summary>
public record GetAppointmentQuery(Guid AppointmentId) : IQuery<AppointmentDetailDto>;

/// <summary>
/// Full appointment detail DTO — superset of <see cref="AppointmentSummaryDto"/>.
/// </summary>
public record AppointmentDetailDto(
    Guid AppointmentId,
    Guid CaProfileId,
    string CaDisplayName,
    DateTime SlotStartUtc,
    DateTime SlotEndUtc,
    string Status,
    string? MeetLink,
    int? RatingStars,
    DateTime CreatedAt,
    string? Topic,
    string? Notes,
    string? RatingComment,
    DateTime? RatedAt,
    bool CancelledByCa,
    string? CaCancellationReason);

/// <summary>Validates GetAppointmentQuery.</summary>
public sealed class GetAppointmentQueryValidator : AbstractValidator<GetAppointmentQuery>
{
    public GetAppointmentQueryValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
    }
}

/// <summary>
/// Handles GetAppointmentQuery.
/// IDOR guard: the appointment must belong to the caller's organisation.
/// </summary>
public sealed class GetAppointmentQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<GetAppointmentQuery, AppointmentDetailDto>
{
    /// <inheritdoc />
    public async Task<Result<AppointmentDetailDto>> Handle(
        GetAppointmentQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result<AppointmentDetailDto>.Failure(
                Error.Unauthorized("Appointment.Unauthenticated", "User is not authenticated."));

        // BUG-W7-001 fix: same two-step pattern as ListAppointmentsQuery — materialise
        // the anonymous type first so EnumUpperSnake.Serialize runs in memory, not
        // inside the EF SQL translation that would emit the PascalCase name.
        var raw = await db.Appointments
            .Where(a => a.Id == request.AppointmentId
                     && a.OrganizationId == currentUser.OrganizationId.Value)
            .Join(db.AppointmentSlots,
                a => a.SlotId,
                s => s.Id,
                (a, s) => new { a, s })
            .Join(db.CaProfiles,
                x => x.a.CaProfileId,
                p => p.Id,
                (x, p) => new
                {
                    x.a.Id,
                    CaProfileId = p.Id,
                    CaDisplayName = p.DisplayName,
                    SlotStartUtc = x.s.StartUtc,
                    SlotEndUtc = x.s.EndUtc,
                    x.a.Status,
                    x.a.MeetLink,
                    x.a.RatingStars,
                    x.a.CreatedAt,
                    x.a.Topic,
                    x.a.Notes,
                    x.a.RatingComment,
                    x.a.RatedAt,
                    x.a.CancelledByCa,
                    x.a.CaCancellationReason
                })
            .FirstOrDefaultAsync(cancellationToken);

        if (raw is null)
            return Result<AppointmentDetailDto>.Failure(
                Error.NotFound("Appointment.NotFound", "Appointment not found."));

        var row = new AppointmentDetailDto(
            raw.Id,
            raw.CaProfileId,
            raw.CaDisplayName,
            raw.SlotStartUtc,
            raw.SlotEndUtc,
            EnumUpperSnake.Serialize(raw.Status),
            raw.MeetLink,
            raw.RatingStars,
            raw.CreatedAt,
            raw.Topic,
            raw.Notes,
            raw.RatingComment,
            raw.RatedAt,
            raw.CancelledByCa,
            raw.CaCancellationReason);

        return Result<AppointmentDetailDto>.Success(row);
    }
}
