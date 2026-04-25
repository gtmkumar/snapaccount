namespace SnapAccount.Shared.Domain;

public record Error(string Code, string Message, ErrorType Type = ErrorType.Failure)
{
    public static readonly Error None = new(string.Empty, string.Empty, ErrorType.Failure);
    public static readonly Error NullValue = new("Error.NullValue", "A null value was provided.", ErrorType.Failure);

    public static Error NotFound(string resource, object id) =>
        new($"{resource}.NotFound", $"{resource} with id '{id}' was not found.", ErrorType.NotFound);

    public static Error Validation(string code, string message) =>
        new(code, message, ErrorType.Validation);

    public static Error Conflict(string code, string message) =>
        new(code, message, ErrorType.Conflict);

    public static Error Unauthorized(string code, string message) =>
        new(code, message, ErrorType.Unauthorized);

    /// <summary>The caller is authenticated but lacks the required permission.</summary>
    public static Error Forbidden(string code, string message) =>
        new(code, message, ErrorType.Forbidden);
}

public enum ErrorType
{
    Failure,
    Validation,
    NotFound,
    Conflict,
    Unauthorized,
    Forbidden
}
