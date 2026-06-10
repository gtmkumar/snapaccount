using FluentValidation;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Application.Usage.Commands.RecordUsage;

/// <summary>
/// Appends a metered usage record for a specific feature consumed by an organisation.
/// Called by event subscribers (Pub/Sub) when a document is uploaded, an AI call is made, etc.
/// </summary>
/// <param name="OrgId">Organisation that consumed the feature.</param>
/// <param name="FeatureCode">Feature code (e.g. "document.upload", "ai.call", "chat.session").</param>
/// <param name="Units">Number of units consumed. Defaults to 1.</param>
/// <param name="CorrelationId">Optional correlation ID for traceability.</param>
public record RecordUsageCommand(
    Guid OrgId,
    string FeatureCode,
    int Units = 1,
    string? CorrelationId = null) : ICommand;

/// <summary>Validates <see cref="RecordUsageCommand"/>.</summary>
public sealed class RecordUsageCommandValidator : AbstractValidator<RecordUsageCommand>
{
    private static readonly HashSet<string> ValidFeatureCodes =
    [
        "document.upload", "ai.call", "chat.session",
        "gst.filing", "itr.filing", "loan.application"
    ];

    public RecordUsageCommandValidator()
    {
        RuleFor(x => x.OrgId).NotEmpty();
        RuleFor(x => x.FeatureCode)
            .NotEmpty()
            .MaximumLength(100)
            .Must(c => ValidFeatureCodes.Contains(c))
            .WithMessage($"FeatureCode must be one of: {string.Join(", ", ValidFeatureCodes)}.");
        RuleFor(x => x.Units).GreaterThan(0).LessThanOrEqualTo(10_000);
        RuleFor(x => x.CorrelationId).MaximumLength(200).When(x => x.CorrelationId is not null);
    }
}

/// <summary>Persists a metered usage event for the organisation's billing period.</summary>
public sealed class RecordUsageCommandHandler(
    ISubscriptionServiceDbContext db)
    : ICommandHandler<RecordUsageCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        RecordUsageCommand request,
        CancellationToken cancellationToken)
    {
        var record = UsageRecord.Record(
            request.OrgId,
            request.FeatureCode,
            request.Units,
            request.CorrelationId);

        db.UsageRecords.Add(record);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}
