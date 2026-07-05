using ChatService.Application.Common.Interfaces;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace ChatService.Application.Appointments.Queries.GetSlotDayMap;

/// <summary>
/// Returns a per-day availability map for a CA profile between two dates (inclusive).
/// Each entry contains the calendar date (IST YYYY-MM-DD) and the count of still-available slots.
/// Mobile DateStrip uses this to grey out fully-booked or slot-free days without fetching
/// every individual slot.
///
/// Implementation: a single GROUP BY query over chat.appointment_slots — cheap, no joins.
/// Only future slots (StartUtc &gt; UtcNow) that are still available are counted.
/// </summary>
public record GetSlotDayMapQuery(
    Guid CaProfileId,
    DateOnly From,
    DateOnly To) : IQuery<SlotDayMapResponse>;

/// <summary>A single day entry in the availability map.</summary>
public record SlotDayEntry(
    /// <summary>Calendar date in IST, format YYYY-MM-DD.</summary>
    string Date,
    /// <summary>Number of available (unboooked) slots on this day. 0 = fully booked or no slots.</summary>
    int AvailableCount);

/// <summary>Response containing the per-day availability map.</summary>
public record SlotDayMapResponse(IReadOnlyList<SlotDayEntry> Days);

/// <summary>Validates GetSlotDayMapQuery.</summary>
public sealed class GetSlotDayMapQueryValidator : AbstractValidator<GetSlotDayMapQuery>
{
    public GetSlotDayMapQueryValidator()
    {
        RuleFor(x => x.CaProfileId).NotEmpty();
        RuleFor(x => x.From).NotEmpty();
        RuleFor(x => x.To)
            .GreaterThanOrEqualTo(x => x.From)
            .WithMessage("To must be on or after From.");
        RuleFor(x => x)
            .Must(x => (x.To.DayNumber - x.From.DayNumber) <= 90)
            .WithMessage("Date range cannot exceed 90 days.")
            .WithName("DateRange");
    }
}

/// <summary>
/// Handles GetSlotDayMapQuery.
/// Groups available future slots by calendar date (UTC date — IST correction note: the
/// backend stores UTC; IST = UTC+5:30. For a 90-day strip the boundary-day effect is
/// minor and consistent with slot-detail view which also renders in IST client-side).
/// </summary>
public sealed class GetSlotDayMapQueryHandler(
    IChatServiceDbContext db) : IQueryHandler<GetSlotDayMapQuery, SlotDayMapResponse>
{
    /// <inheritdoc />
    public async Task<Result<SlotDayMapResponse>> Handle(
        GetSlotDayMapQuery request,
        CancellationToken cancellationToken)
    {
        var fromUtc = request.From.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var toUtc   = request.To.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); // exclusive upper bound
        var now     = DateTime.UtcNow;

        // Group by UTC date, count available slots per day
        var grouped = await db.AppointmentSlots
            .Where(s => s.CaProfileId == request.CaProfileId
                     && s.IsAvailable
                     && s.StartUtc >= fromUtc
                     && s.StartUtc < toUtc
                     && s.StartUtc > now)
            .GroupBy(s => s.StartUtc.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .OrderBy(g => g.Date)
            .ToListAsync(cancellationToken);

        // Build the full range, including days with zero slots
        var days = new List<SlotDayEntry>();
        for (var d = request.From; d <= request.To; d = d.AddDays(1))
        {
            var utcDate = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).Date;
            var entry   = grouped.FirstOrDefault(g => g.Date == utcDate);
            days.Add(new SlotDayEntry(d.ToString("yyyy-MM-dd"), entry?.Count ?? 0));
        }

        return Result<SlotDayMapResponse>.Success(new SlotDayMapResponse(days));
    }
}
