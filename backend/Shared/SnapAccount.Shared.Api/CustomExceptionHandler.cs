using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SnapAccount.Shared.Application.Common.Exceptions;
using ValidationException = SnapAccount.Shared.Application.Common.Exceptions.ValidationException;

namespace SnapAccount.Shared.Api;

/// <summary>
/// Centralized exception handler implementing <see cref="IExceptionHandler"/>.
/// Maps known application exceptions to structured HTTP ProblemDetails responses.
/// Registered in each service's DI with:
/// <code>builder.Services.AddExceptionHandler&lt;CustomExceptionHandler&gt;();</code>
/// and activated with <code>app.UseExceptionHandler();</code>.
///
/// Exception type dispatch (mirrors Jason Taylor CleanArchitecture pattern):
/// <list type="bullet">
///   <item><see cref="ValidationException"/> → 400 ValidationProblemDetails</item>
///   <item><see cref="NotFoundException"/> → 404 ProblemDetails</item>
///   <item><see cref="UnauthorizedAccessException"/> → 401 ProblemDetails</item>
///   <item><see cref="ForbiddenAccessException"/> → 403 ProblemDetails</item>
/// </list>
/// Unrecognised exceptions return <c>false</c> so ASP.NET Core's default handler takes over.
/// </summary>
public sealed class CustomExceptionHandler : IExceptionHandler
{
    private readonly Dictionary<Type, Func<HttpContext, Exception, Task>> _exceptionHandlers;

    /// <summary>Initialises the handler and registers known exception type dispatchers.</summary>
    public CustomExceptionHandler()
    {
        _exceptionHandlers = new Dictionary<Type, Func<HttpContext, Exception, Task>>
        {
            { typeof(ValidationException), HandleValidationException },
            { typeof(NotFoundException), HandleNotFoundException },
            { typeof(UnauthorizedAccessException), HandleUnauthorizedAccessException },
            { typeof(ForbiddenAccessException), HandleForbiddenAccessException },
        };
    }

    /// <inheritdoc />
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var exceptionType = exception.GetType();

        if (_exceptionHandlers.TryGetValue(exceptionType, out var handler))
        {
            await handler.Invoke(httpContext, exception);
            return true;
        }

        return false;
    }

    private static async Task HandleValidationException(HttpContext httpContext, Exception ex)
    {
        var exception = (ValidationException)ex;

        httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;

        await httpContext.Response.WriteAsJsonAsync(new ValidationProblemDetails(exception.Errors)
        {
            Status = StatusCodes.Status400BadRequest,
            Type = "https://tools.ietf.org/html/rfc7231#section-6.5.1"
        });
    }

    private static async Task HandleNotFoundException(HttpContext httpContext, Exception ex)
    {
        var exception = (NotFoundException)ex;

        httpContext.Response.StatusCode = StatusCodes.Status404NotFound;

        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status404NotFound,
            Type = "https://tools.ietf.org/html/rfc7231#section-6.5.4",
            Title = "The specified resource was not found.",
            Detail = exception.Message
        });
    }

    private static async Task HandleUnauthorizedAccessException(HttpContext httpContext, Exception ex)
    {
        httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;

        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status401Unauthorized,
            Title = "Unauthorized",
            Type = "https://tools.ietf.org/html/rfc7235#section-3.1"
        });
    }

    private static async Task HandleForbiddenAccessException(HttpContext httpContext, Exception ex)
    {
        httpContext.Response.StatusCode = StatusCodes.Status403Forbidden;

        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status403Forbidden,
            Title = "Forbidden",
            Type = "https://tools.ietf.org/html/rfc7231#section-6.5.3"
        });
    }
}
