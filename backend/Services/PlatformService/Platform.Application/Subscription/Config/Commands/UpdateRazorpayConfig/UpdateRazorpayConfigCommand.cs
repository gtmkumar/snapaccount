using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;

namespace SubscriptionService.Application.Config.Commands.UpdateRazorpayConfig;

/// <summary>
/// Persists the admin-configured Razorpay credentials to the database.
/// The key_secret is encrypted at rest via the subscription service's
/// credential encryption service before storage.
///
/// Permissions: <c>subscription.config.write</c> (platform admin only).
/// </summary>
[RequiresPermission("subscription.config.write")]
public record UpdateRazorpayConfigCommand(
    string KeyId,
    string KeySecret,
    string? WebhookSecret,
    bool TestMode,
    bool IsEnabled) : ICommand;

/// <summary>FluentValidation for <see cref="UpdateRazorpayConfigCommand"/>.</summary>
public sealed class UpdateRazorpayConfigCommandValidator
    : AbstractValidator<UpdateRazorpayConfigCommand>
{
    public UpdateRazorpayConfigCommandValidator()
    {
        RuleFor(x => x.KeyId)
            .NotEmpty()
            .MaximumLength(100)
            .Must(id => id.StartsWith("rzp_live_", StringComparison.OrdinalIgnoreCase)
                        || id.StartsWith("rzp_test_", StringComparison.OrdinalIgnoreCase))
            .WithMessage("KeyId must start with 'rzp_live_' or 'rzp_test_'.");

        RuleFor(x => x.KeySecret)
            .NotEmpty()
            .MaximumLength(200);
    }
}

/// <summary>
/// Upserts the Razorpay config row (single row per service instance).
/// Encrypts the key secret before persisting.
/// </summary>
public sealed class UpdateRazorpayConfigCommandHandler(
    ISubscriptionServiceDbContext db,
    ICredentialEncryptionService encryption)
    : ICommandHandler<UpdateRazorpayConfigCommand>
{
    /// <inheritdoc />
    public async Task<Result> Handle(
        UpdateRazorpayConfigCommand request,
        CancellationToken cancellationToken)
    {
        var existing = await db.RazorpayConfigs
            .Where(c => c.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        var encryptedSecret  = encryption.Encrypt(request.KeySecret);
        var encryptedWebhook = request.WebhookSecret is not null
            ? encryption.Encrypt(request.WebhookSecret)
            : null;

        if (existing is null)
        {
            db.RazorpayConfigs.Add(new RazorpayConfig
            {
                KeyId                = request.KeyId,
                EncryptedKeySecret   = encryptedSecret,
                EncryptedWebhookSecret = encryptedWebhook,
                TestMode             = request.TestMode,
                IsEnabled            = request.IsEnabled,
            });
        }
        else
        {
            existing.KeyId                  = request.KeyId;
            existing.EncryptedKeySecret     = encryptedSecret;
            existing.EncryptedWebhookSecret = encryptedWebhook;
            existing.TestMode               = request.TestMode;
            existing.IsEnabled              = request.IsEnabled;
        }

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
