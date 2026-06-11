using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Queries.ListAvailableSlots;

/// <summary>
/// Returns available appointment slots for a specific CA, optionally filtered by date.
/// </summary>
public record ListAvailableSlotsQuery(
    Guid CaProfileId,
    DateOnly? Date = null) : IQuery<ListAvailableSlotsResponse>;

/// <summary>A single available slot DTO.</summary>
public record AvailableSlotDto(
    Guid SlotId,
    Guid CaProfileId,
    string CaDisplayName,
    DateTime StartUtc,
    DateTime EndUtc);

/// <summary>Response for available slots query.</summary>
public record ListAvailableSlotsResponse(IReadOnlyList<AvailableSlotDto> Slots);

/// <summary>Validates ListAvailableSlotsQuery.</summary>
public sealed class ListAvailableSlotsQueryValidator : AbstractValidator<ListAvailableSlotsQuery>
{
    public ListAvailableSlotsQueryValidator()
    {
        RuleFor(x => x.CaProfileId).NotEmpty();
    }
}

/// <summary>Handles ListAvailableSlotsQuery — returns future available slots for the CA.</summary>
public sealed class ListAvailableSlotsQueryHandler(
    IChatServiceDbContext db) : IQueryHandler<ListAvailableSlotsQuery, ListAvailableSlotsResponse>
{
    /// <inheritdoc />
    public async Task<Result<ListAvailableSlotsResponse>> Handle(
        ListAvailableSlotsQuery request,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var query = db.AppointmentSlots
            .Where(s => s.CaProfileId == request.CaProfileId
                     && s.IsAvailable
                     && s.StartUtc > now);

        if (request.Date.HasValue)
        {
            var dayStart = request.Date.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var dayEnd = request.Date.Value.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);
            query = query.Where(s => s.StartUtc >= dayStart && s.StartUtc <= dayEnd);
        }

        var slots = await query
            .OrderBy(s => s.StartUtc)
            .Join(db.CaProfiles,
                s => s.CaProfileId,
                p => p.Id,
                (s, p) => new AvailableSlotDto(s.Id, p.Id, p.DisplayName, s.StartUtc, s.EndUtc))
            .ToListAsync(cancellationToken);

        return Result<ListAvailableSlotsResponse>.Success(new ListAvailableSlotsResponse(slots));
    }
}
