using Microsoft.AspNetCore.Http;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Api;

/// <summary>
/// Maps a domain <see cref="Error"/> to the correct HTTP result by its <see cref="ErrorType"/>.
///
/// Centralises the Result-failure → HTTP-status mapping so an authorization failure
/// (Forbidden / Unauthorized) raised by <c>PermissionBehavior</c> never leaks out as a
/// generic <c>500</c> — which is exactly what <c>Results.Problem(error.Message)</c> produced
/// for every failure type before. Use this from minimal-API endpoints:
/// <code>return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToHttpResult();</code>
/// </summary>
public static class ErrorResults
{
    /// <summary>Convert a domain <see cref="Error"/> into the HTTP <see cref="IResult"/> that matches its type.</summary>
    public static IResult ToHttpResult(this Error error) => error.Type switch
    {
        ErrorType.NotFound     => Results.NotFound(new { error = error.Message, code = error.Code }),
        ErrorType.Validation   => Results.BadRequest(new { error = error.Message, code = error.Code }),
        ErrorType.Conflict     => Results.Conflict(new { error = error.Message, code = error.Code }),
        ErrorType.Unauthorized => Results.Json(new { error = error.Message, code = error.Code }, statusCode: StatusCodes.Status401Unauthorized),
        ErrorType.Forbidden    => Results.Json(new { error = error.Message, code = error.Code }, statusCode: StatusCodes.Status403Forbidden),
        // Genuine server-side failures stay 500.
        _                      => Results.Problem(error.Message),
    };
}
