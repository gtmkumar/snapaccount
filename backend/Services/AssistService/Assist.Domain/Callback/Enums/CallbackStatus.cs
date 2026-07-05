namespace CallbackService.Domain.Enums;

/// <summary>
/// State machine for a callback request.
/// Transitions: Pending → Assigned → Confirmed → Completed
///              Pending/Assigned/Confirmed → Escalated
///              Any → Cancelled
/// </summary>
public enum CallbackStatus
{
    /// <summary>Customer requested a callback; not yet assigned to an agent.</summary>
    Pending = 0,

    /// <summary>An agent has been assigned to the callback.</summary>
    Assigned = 1,

    /// <summary>Agent has confirmed the scheduled time with the customer.</summary>
    Confirmed = 2,

    /// <summary>Call completed successfully.</summary>
    Completed = 3,

    /// <summary>Escalated to a senior agent or manager.</summary>
    Escalated = 4,

    /// <summary>Cancelled by customer or agent.</summary>
    Cancelled = 5
}
