using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.FeatureFlags.Commands.SetFeatureFlag;

/// <summary>
/// Creates or updates a feature flag (upsert semantics).
/// SEC-056: backs PATCH /auth/feature-flags/{flag}.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformFeatureFlagsWrite)]
public record SetFeatureFlagCommand(string FlagKey, bool Enabled) : ICommand;

public sealed class SetFeatureFlagCommandValidator : AbstractValidator<SetFeatureFlagCommand>
{
    public SetFeatureFlagCommandValidator()
    {
        RuleFor(x => x.FlagKey)
            .NotEmpty()
            .MaximumLength(100)
            .Matches(@"^[a-z0-9][a-z0-9._-]{0,98}[a-z0-9]$|^[a-z0-9]$")
            .WithMessage("FlagKey must be lowercase alphanumeric with dots, underscores, or hyphens.");
    }
}

public sealed class SetFeatureFlagCommandHandler(IAuthDbContext db)
    : ICommandHandler<SetFeatureFlagCommand>
{
    public async Task<Result> Handle(
        SetFeatureFlagCommand request,
        CancellationToken cancellationToken)
    {
        var existing = await db.FeatureFlags
            .FirstOrDefaultAsync(
                f => f.FlagKey == request.FlagKey && f.DeletedAt == null,
                cancellationToken);

        if (existing is null)
        {
            var flag = FeatureFlag.Create(request.FlagKey, request.Enabled);
            db.FeatureFlags.Add(flag);
        }
        else
        {
            existing.SetEnabled(request.Enabled);
        }

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
