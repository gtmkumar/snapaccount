using CallbackService.Application.Common.Interfaces;
using CallbackService.Domain.Entities;
using CallbackService.Domain.Enums;
using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace CallbackService.Application.Callbacks.Commands.RequestCallback;

/// <summary>Creates a new callback request in Pending status.</summary>
public record RequestCallbackCommand(
    Guid UserId,
    Guid? OrganizationId,
    string PhoneNumber,
    CallbackCategory Category,
    CallbackPriority Priority,
    string? IssueDescription,
    DateTime? PreferredWindowStart,
    DateTime? PreferredWindowEnd) : ICommand<RequestCallbackResponse>;

/// <summary>Response from requesting a callback.</summary>
public record RequestCallbackResponse(Guid CallbackId, CallbackStatus Status);

/// <summary>Validates the request callback command.</summary>
public sealed class RequestCallbackCommandValidator : AbstractValidator<RequestCallbackCommand>
{
    public RequestCallbackCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.PhoneNumber).NotEmpty().Matches(@"^\+91\d{10}$")
            .WithMessage("Phone must be in +91XXXXXXXXXX format.");
        RuleFor(x => x.IssueDescription).MaximumLength(1000).When(x => x.IssueDescription is not null);
        RuleFor(x => x.PreferredWindowEnd)
            .GreaterThan(x => x.PreferredWindowStart)
            .When(x => x.PreferredWindowStart.HasValue && x.PreferredWindowEnd.HasValue)
            .WithMessage("Preferred window end must be after start.");
    }
}

/// <summary>Handles <see cref="RequestCallbackCommand"/>.</summary>
public sealed class RequestCallbackCommandHandler(ICallbackDbContext dbContext)
    : ICommandHandler<RequestCallbackCommand, RequestCallbackResponse>
{
    /// <inheritdoc />
    public async Task<Result<RequestCallbackResponse>> Handle(
        RequestCallbackCommand request,
        CancellationToken cancellationToken)
    {
        var callback = Callback.Create(
            request.UserId,
            request.OrganizationId,
            request.PhoneNumber,
            request.Category,
            request.Priority,
            request.IssueDescription,
            request.PreferredWindowStart,
            request.PreferredWindowEnd);

        dbContext.Callbacks.Add(callback);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new RequestCallbackResponse(callback.Id, callback.Status);
    }
}
