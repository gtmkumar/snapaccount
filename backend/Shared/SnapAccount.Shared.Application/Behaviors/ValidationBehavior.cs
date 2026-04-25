using FluentValidation;
using MediatR;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Application.Behaviors;

public sealed class ValidationBehavior<TRequest, TResponse>(
    IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!validators.Any())
            return await next(cancellationToken);

        var context = new ValidationContext<TRequest>(request);
        var results = await Task.WhenAll(
            validators.Select(v => v.ValidateAsync(context, cancellationToken)));

        var failures = results
            .SelectMany(r => r.Errors)
            .Where(f => f is not null)
            .ToList();

        if (failures.Count == 0)
            return await next(cancellationToken);

        // Return failure result — never throw for business validation
        var errorMessage = string.Join("; ", failures.Select(f => f.ErrorMessage));
        var error = new Error("Validation.Failed", errorMessage, ErrorType.Validation);

        // Attempt to create a Result<T> failure or Result failure based on TResponse
        if (typeof(TResponse).IsGenericType &&
            typeof(TResponse).GetGenericTypeDefinition() == typeof(Result<>))
        {
            var resultType = typeof(TResponse).GetGenericArguments()[0];
            var failureMethod = typeof(Result<>)
                .MakeGenericType(resultType)
                .GetMethod(nameof(Result<object>.Failure))!;
            return (TResponse)failureMethod.Invoke(null, [error])!;
        }

        if (typeof(TResponse) == typeof(Result))
            return (TResponse)(object)Result.Failure(error);

        throw new ValidationException(failures);
    }
}
