namespace SnapAccount.Shared.Application.Common.Exceptions;

/// <summary>
/// Thrown when the authenticated user lacks permission to perform an operation.
/// Mapped to HTTP 403 by <c>CustomExceptionHandler</c> in each service's Api project.
/// </summary>
public sealed class ForbiddenAccessException : Exception
{
    /// <summary>Initialises a <see cref="ForbiddenAccessException"/>.</summary>
    public ForbiddenAccessException() : base("Access is forbidden.") { }

    /// <summary>Initialises a <see cref="ForbiddenAccessException"/> with a custom message.</summary>
    public ForbiddenAccessException(string message) : base(message) { }
}
