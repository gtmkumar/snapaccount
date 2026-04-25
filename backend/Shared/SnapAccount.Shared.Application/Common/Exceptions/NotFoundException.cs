namespace SnapAccount.Shared.Application.Common.Exceptions;

/// <summary>
/// Thrown when a requested resource is not found.
/// Mapped to HTTP 404 by <c>CustomExceptionHandler</c> in each service's Api project.
/// </summary>
public sealed class NotFoundException : Exception
{
    /// <summary>Initialises a <see cref="NotFoundException"/> for the given entity name and key.</summary>
    public NotFoundException(string name, object key)
        : base($"Entity \"{name}\" ({key}) was not found.")
    {
    }

    /// <summary>Initialises a <see cref="NotFoundException"/> with a custom message.</summary>
    public NotFoundException(string message)
        : base(message)
    {
    }
}
