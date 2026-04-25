using FluentValidation.Results;

namespace SnapAccount.Shared.Application.Common.Exceptions;

/// <summary>
/// Thrown when FluentValidation validation fails.
/// Mapped to HTTP 400 by <c>CustomExceptionHandler</c> in each service's Api project.
/// The <see cref="Errors"/> dictionary matches the <c>ValidationProblemDetails.Errors</c> format.
/// </summary>
public sealed class ValidationException : Exception
{
    /// <summary>
    /// Initialises a <see cref="ValidationException"/> with no validation failures.
    /// </summary>
    public ValidationException()
        : base("One or more validation failures have occurred.")
    {
        Errors = new Dictionary<string, string[]>();
    }

    /// <summary>
    /// Initialises a <see cref="ValidationException"/> from a set of FluentValidation failures.
    /// </summary>
    public ValidationException(IEnumerable<ValidationFailure> failures)
        : this()
    {
        Errors = failures
            .GroupBy(e => e.PropertyName, e => e.ErrorMessage)
            .ToDictionary(failureGroup => failureGroup.Key, failureGroup => failureGroup.ToArray());
    }

    /// <summary>Property-keyed dictionary of validation error messages.</summary>
    public IDictionary<string, string[]> Errors { get; }
}
