using AuthService.Application.Common.Interfaces;
using AuthService.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace AuthService.Application.Config.Commands.UpdatePlatformConfig;

/// <summary>
/// Creates or replaces a platform config section (upsert semantics).
/// SEC-056: backs PATCH /auth/config/language and PATCH /auth/config/whatsapp.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformConfigWrite)]
public record UpdatePlatformConfigCommand(string ConfigKey, string ConfigValueJson) : ICommand;

public sealed class UpdatePlatformConfigCommandValidator : AbstractValidator<UpdatePlatformConfigCommand>
{
    private static readonly HashSet<string> AllowedKeys = ["language", "whatsapp"];

    public UpdatePlatformConfigCommandValidator()
    {
        RuleFor(x => x.ConfigKey)
            .NotEmpty()
            .Must(k => AllowedKeys.Contains(k))
            .WithMessage($"ConfigKey must be one of: {string.Join(", ", AllowedKeys)}.");

        RuleFor(x => x.ConfigValueJson)
            .NotEmpty()
            .Must(IsValidJson)
            .WithMessage("ConfigValueJson must be valid JSON.");
    }

    private static bool IsValidJson(string json)
    {
        try
        {
            JsonSerializer.Deserialize<JsonElement>(json);
            return true;
        }
        catch
        {
            return false;
        }
    }
}

public sealed class UpdatePlatformConfigCommandHandler(IAuthDbContext db)
    : ICommandHandler<UpdatePlatformConfigCommand>
{
    public async Task<Result> Handle(
        UpdatePlatformConfigCommand request,
        CancellationToken cancellationToken)
    {
        var existing = await db.PlatformConfigs
            .FirstOrDefaultAsync(
                c => c.ConfigKey == request.ConfigKey && c.DeletedAt == null,
                cancellationToken);

        if (existing is null)
        {
            var config = PlatformConfig.Create(request.ConfigKey, request.ConfigValueJson);
            db.PlatformConfigs.Add(config);
        }
        else
        {
            existing.SetValue(request.ConfigValueJson);
        }

        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
