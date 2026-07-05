using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// A recurring weekly availability rule for a CA — defines which weekday and time window
/// (in IST) the CA is available, and at what slot duration.
///
/// Canonical table: chat.ca_availability_rules (migration 085).
///
/// Generation: the <c>GenerateSlotsFromRulesJob</c> Hangfire job materialises
/// <see cref="AppointmentSlot"/> rows from active rules for the next N weeks each Sunday,
/// using idempotency on (rule_id, slot start) to avoid double-generation.
/// </summary>
public sealed class CaAvailabilityRule : BaseAuditableEntity
{
    /// <summary>FK → chat.ca_profiles.id — the CA who owns this rule.</summary>
    public Guid CaProfileId { get; private set; }

    /// <summary>
    /// Day of week the rule applies to (0 = Sunday … 6 = Saturday).
    /// Stored as an integer to avoid EF enum mapping complications.
    /// </summary>
    public int Weekday { get; private set; }

    /// <summary>
    /// Start time in IST (India Standard Time, UTC+05:30).
    /// Stored as a TimeSpan (offset from midnight) — UI shows "HH:mm IST".
    /// </summary>
    public TimeSpan StartTimeIst { get; private set; }

    /// <summary>
    /// End time in IST.
    /// All slots generated from this rule fall within [StartTimeIst, EndTimeIst).
    /// </summary>
    public TimeSpan EndTimeIst { get; private set; }

    /// <summary>Duration of each generated slot in minutes (15–480).</summary>
    public int SlotDurationMinutes { get; private set; }

    /// <summary>First date (inclusive) from which slots should be generated.</summary>
    public DateOnly EffectiveFrom { get; private set; }

    /// <summary>
    /// Last date (inclusive) until which slots are generated.
    /// Null = open-ended.
    /// </summary>
    public DateOnly? EffectiveTo { get; private set; }

    /// <summary>Whether this rule is currently active for generation.</summary>
    public bool IsActive { get; private set; } = true;

    private CaAvailabilityRule() { }

    /// <summary>
    /// Creates a new recurring availability rule.
    /// </summary>
    /// <param name="caProfileId">CA profile this rule belongs to.</param>
    /// <param name="weekday">Day of week (0=Sunday … 6=Saturday).</param>
    /// <param name="startTimeIst">Window start in IST.</param>
    /// <param name="endTimeIst">Window end in IST (must be after start).</param>
    /// <param name="slotDurationMinutes">Each slot duration in minutes (15–480).</param>
    /// <param name="effectiveFrom">First date from which slots are generated.</param>
    /// <param name="effectiveTo">Optional expiry date (null = open-ended).</param>
    public static Result<CaAvailabilityRule> Create(
        Guid caProfileId,
        int weekday,
        TimeSpan startTimeIst,
        TimeSpan endTimeIst,
        int slotDurationMinutes,
        DateOnly effectiveFrom,
        DateOnly? effectiveTo = null)
    {
        if (weekday is < 0 or > 6)
            return Result<CaAvailabilityRule>.Failure(Error.Validation(
                "AvailabilityRule.InvalidWeekday", "Weekday must be 0 (Sunday) through 6 (Saturday)."));

        if (endTimeIst <= startTimeIst)
            return Result<CaAvailabilityRule>.Failure(Error.Validation(
                "AvailabilityRule.InvalidTimeRange", "EndTimeIst must be after StartTimeIst."));

        if (slotDurationMinutes < 15 || slotDurationMinutes > 480)
            return Result<CaAvailabilityRule>.Failure(Error.Validation(
                "AvailabilityRule.InvalidSlotDuration", "Slot duration must be 15–480 minutes."));

        var windowMinutes = (endTimeIst - startTimeIst).TotalMinutes;
        if (slotDurationMinutes > windowMinutes)
            return Result<CaAvailabilityRule>.Failure(Error.Validation(
                "AvailabilityRule.SlotExceedsWindow",
                "Slot duration cannot exceed the availability window."));

        if (effectiveTo.HasValue && effectiveTo.Value < effectiveFrom)
            return Result<CaAvailabilityRule>.Failure(Error.Validation(
                "AvailabilityRule.InvalidEffectiveRange", "EffectiveTo must be on or after EffectiveFrom."));

        return Result<CaAvailabilityRule>.Success(new CaAvailabilityRule
        {
            CaProfileId = caProfileId,
            Weekday = weekday,
            StartTimeIst = startTimeIst,
            EndTimeIst = endTimeIst,
            SlotDurationMinutes = slotDurationMinutes,
            EffectiveFrom = effectiveFrom,
            EffectiveTo = effectiveTo,
            IsActive = true
        });
    }

    /// <summary>Deactivates the rule so the generator skips it on next run.</summary>
    public void Deactivate() => IsActive = false;

    /// <summary>Updates effective date range and slot duration.</summary>
    public Result Update(
        int weekday,
        TimeSpan startTimeIst,
        TimeSpan endTimeIst,
        int slotDurationMinutes,
        DateOnly effectiveFrom,
        DateOnly? effectiveTo)
    {
        if (weekday is < 0 or > 6)
            return Result.Failure(Error.Validation("AvailabilityRule.InvalidWeekday",
                "Weekday must be 0 (Sunday) through 6 (Saturday)."));

        if (endTimeIst <= startTimeIst)
            return Result.Failure(Error.Validation("AvailabilityRule.InvalidTimeRange",
                "EndTimeIst must be after StartTimeIst."));

        if (slotDurationMinutes < 15 || slotDurationMinutes > 480)
            return Result.Failure(Error.Validation("AvailabilityRule.InvalidSlotDuration",
                "Slot duration must be 15–480 minutes."));

        if (effectiveTo.HasValue && effectiveTo.Value < effectiveFrom)
            return Result.Failure(Error.Validation("AvailabilityRule.InvalidEffectiveRange",
                "EffectiveTo must be on or after EffectiveFrom."));

        Weekday = weekday;
        StartTimeIst = startTimeIst;
        EndTimeIst = endTimeIst;
        SlotDurationMinutes = slotDurationMinutes;
        EffectiveFrom = effectiveFrom;
        EffectiveTo = effectiveTo;
        return Result.Success();
    }
}
