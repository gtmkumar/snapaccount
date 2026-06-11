using SnapAccount.Shared.Domain;

namespace ChatService.Domain.Entities;

/// <summary>
/// A single availability slot offered by a CA.
/// Canonical table: chat.appointment_slots (migration 080).
/// A slot moves from Available → Booked when an Appointment is created against it.
/// </summary>
public sealed class AppointmentSlot : BaseAuditableEntity
{
    /// <summary>The CA who owns this slot (FK → chat.ca_profiles.id).</summary>
    public Guid CaProfileId { get; private set; }

    /// <summary>UTC start of the slot.</summary>
    public DateTime StartUtc { get; private set; }

    /// <summary>UTC end of the slot.</summary>
    public DateTime EndUtc { get; private set; }

    /// <summary>Whether the slot is still available for booking.</summary>
    public bool IsAvailable { get; private set; } = true;

    private AppointmentSlot() { }

    /// <summary>Creates a new availability slot for the given CA profile.</summary>
    public static Result<AppointmentSlot> Create(Guid caProfileId, DateTime startUtc, DateTime endUtc)
    {
        if (startUtc >= endUtc)
            return Result<AppointmentSlot>.Failure(Error.Validation(
                "AppointmentSlot.InvalidRange", "Slot start must be before end."));
        if (startUtc < DateTime.UtcNow)
            return Result<AppointmentSlot>.Failure(Error.Validation(
                "AppointmentSlot.InPast", "Slot start must be in the future."));

        return Result<AppointmentSlot>.Success(new AppointmentSlot
        {
            CaProfileId = caProfileId,
            StartUtc = startUtc,
            EndUtc = endUtc,
            IsAvailable = true
        });
    }

    /// <summary>Marks the slot as booked (called when an Appointment is confirmed against it).</summary>
    public Result MarkBooked()
    {
        if (!IsAvailable)
            return Result.Failure(Error.Conflict("AppointmentSlot.AlreadyBooked", "This slot has already been booked."));
        IsAvailable = false;
        return Result.Success();
    }

    /// <summary>Releases the slot back to available (called when an appointment is cancelled / rescheduled).</summary>
    public void Release() => IsAvailable = true;

    /// <summary>
    /// Creates a slot from a recurring availability rule without the "start must be future" guard.
    /// This factory is called by the generator service, which has already validated that
    /// <paramref name="startUtc"/> &gt; <see cref="DateTime.UtcNow"/>.
    /// </summary>
    public static AppointmentSlot CreateFromRule(Guid caProfileId, DateTime startUtc, DateTime endUtc)
        => new()
        {
            CaProfileId = caProfileId,
            StartUtc = startUtc,
            EndUtc = endUtc,
            IsAvailable = true
        };
}
