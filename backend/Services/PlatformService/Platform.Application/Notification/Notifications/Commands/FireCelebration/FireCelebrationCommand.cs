using FluentValidation;
using Microsoft.EntityFrameworkCore;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace NotificationService.Application.Notifications.Commands.FireCelebration;

/// <summary>
/// Records that a celebration animation has been fired for the authenticated user.
/// Decision (Phase 6F): reuses notification.notification_log with event_type='celebration.{kind}'.
/// One record per (user_id × kind) — duplicate calls return 200 OK without writing a new row.
/// Supported kinds: first_gst_filed, first_refund_credited, first_loan_disbursed.
/// </summary>
public record FireCelebrationCommand(string Kind) : ICommand<FireCelebrationResponse>;

/// <summary>Response after firing a celebration.</summary>
public record FireCelebrationResponse(
    bool AlreadyFired,
    string Kind,
    DateTime FiredAt);

/// <summary>Validates FireCelebrationCommand — enforces allowed kinds.</summary>
public sealed class FireCelebrationCommandValidator : AbstractValidator<FireCelebrationCommand>
{
    private static readonly string[] AllowedKinds =
    [
        "first_gst_filed",
        "first_refund_credited",
        "first_loan_disbursed",
        "first_itr_filed",
        "first_document_uploaded"
    ];

    public FireCelebrationCommandValidator()
    {
        RuleFor(x => x.Kind)
            .NotEmpty()
            .Must(k => AllowedKinds.Contains(k, StringComparer.OrdinalIgnoreCase))
            .WithMessage($"Kind must be one of: {string.Join(", ", AllowedKinds)}");
    }
}

/// <summary>Handler: idempotent — records celebration only if not already fired for this user+kind.</summary>
public sealed class FireCelebrationCommandHandler(
    INotificationDbContext db,
    ICurrentUser currentUser) : ICommandHandler<FireCelebrationCommand, FireCelebrationResponse>
{
    private const string EventCodePrefix = "celebration.";

    /// <inheritdoc />
    public async Task<Result<FireCelebrationResponse>> Handle(
        FireCelebrationCommand request,
        CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var eventCode = $"{EventCodePrefix}{request.Kind.ToLowerInvariant()}";

        // Idempotency: check if already fired for this user+kind
        var existing = await db.NotificationLog
            .Where(l => l.UserId == userId
                        && l.EventCode == eventCode
                        && l.DeletedAt == null)
            .OrderByDescending(l => l.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing != null)
            return new FireCelebrationResponse(true, request.Kind, existing.CreatedAt);

        // Record the celebration firing
        var entry = NotificationLogEntry.CreateCelebration(userId, eventCode);
        db.NotificationLog.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        return new FireCelebrationResponse(false, request.Kind, entry.CreatedAt);
    }
}
