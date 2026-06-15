using ChatService.Application.Common;
using ChatService.Application.Common.Interfaces;
using ChatService.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Queries.ListAppointments;

/// <summary>
/// Lists appointments for the current organisation (paginated).
/// Optional filter by status.
/// </summary>
public record ListAppointmentsQuery(
    AppointmentStatus? Status = null,
    int Page = 1,
    int PageSize = 20) : IQuery<ListAppointmentsResponse>;

/// <summary>
/// A single appointment summary DTO.
/// Migration 086: Topic is now a first-class field (max 50 chars).
/// </summary>
public record AppointmentSummaryDto(
    Guid AppointmentId,
    Guid CaProfileId,
    string CaDisplayName,
    DateTime SlotStartUtc,
    DateTime SlotEndUtc,
    string Status,
    string? MeetLink,
    int? RatingStars,
    DateTime CreatedAt,
    string? Topic = null,
    string? Notes = null);

/// <summary>Paginated appointments response.</summary>
public record ListAppointmentsResponse(
    IReadOnlyList<AppointmentSummaryDto> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>Validates ListAppointmentsQuery.</summary>
public sealed class ListAppointmentsQueryValidator : AbstractValidator<ListAppointmentsQuery>
{
    public ListAppointmentsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

/// <summary>Handles ListAppointmentsQuery — org-scoped, paginated.</summary>
public sealed class ListAppointmentsQueryHandler(
    IChatServiceDbContext db,
    ICurrentUser currentUser) : IQueryHandler<ListAppointmentsQuery, ListAppointmentsResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListAppointmentsResponse>> Handle(
        ListAppointmentsQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.OrganizationId.HasValue)
            return Result<ListAppointmentsResponse>.Failure(Error.Unauthorized("Appointment.Unauthenticated", "User is not authenticated."));

        var query = db.Appointments
            .Where(a => a.OrganizationId == currentUser.OrganizationId.Value);

        if (request.Status.HasValue)
            query = query.Where(a => a.Status == request.Status.Value);

        var total = await query.CountAsync(cancellationToken);

        // BUG-W7-001 fix: materialise the anonymous projection first, then map enums
        // client-side via EnumUpperSnake.Serialize so the mobile contract (UPPER_SNAKE)
        // is honoured.  Calling .ToString() inside an EF LINQ Select() emits the
        // PascalCase member name ("Confirmed") rather than the DB string ("CONFIRMED").
        var rows = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
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
                    x.a.Notes
                })
            .ToListAsync(cancellationToken);

        var items = rows.Select(r => new AppointmentSummaryDto(
            r.Id,
            r.CaProfileId,
            r.CaDisplayName,
            r.SlotStartUtc,
            r.SlotEndUtc,
            EnumUpperSnake.Serialize(r.Status),
            r.MeetLink,
            r.RatingStars,
            r.CreatedAt,
            r.Topic,
            r.Notes)).ToList();

        return Result<ListAppointmentsResponse>.Success(
            new ListAppointmentsResponse(items, total, request.Page, request.PageSize));
    }
}
