using AuthService.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;
using System.Text.Json;

namespace AuthService.Application.Config.Queries.GetPlatformConfig;

/// <summary>
/// Returns a typed platform config section by key.
/// SEC-056: backs GET /auth/config/language and GET /auth/config/whatsapp.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformConfigRead)]
public record GetPlatformConfigQuery(string ConfigKey) : IQuery<JsonElement>;

public sealed class GetPlatformConfigQueryHandler(IAuthDbContext db)
    : IQueryHandler<GetPlatformConfigQuery, JsonElement>
{
    public async Task<Result<JsonElement>> Handle(
        GetPlatformConfigQuery request,
        CancellationToken cancellationToken)
    {
        var row = await db.PlatformConfigs
            .Where(c => c.ConfigKey == request.ConfigKey && c.DeletedAt == null)
            .Select(c => c.ConfigValueJson)
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            // Return well-known defaults per config key
            var defaults = DefaultValue(request.ConfigKey);
            return Result<JsonElement>.Success(defaults);
        }

        try
        {
            var element = JsonSerializer.Deserialize<JsonElement>(row);
            return Result<JsonElement>.Success(element);
        }
        catch (JsonException)
        {
            return Result<JsonElement>.Failure(
                new Error("PlatformConfig.ParseError", "Stored config value is corrupt."));
        }
    }

    private static JsonElement DefaultValue(string key) => key switch
    {
        "language" => JsonSerializer.Deserialize<JsonElement>("""
            {"defaultLocale":"en","supportedLocales":["en","hi"],"fallbackLocale":"en"}
            """),
        "whatsapp" => JsonSerializer.Deserialize<JsonElement>("""
            {"enabled":false,"wabaId":null,"phoneNumberId":null,"webhookVerifyToken":null}
            """),
        _ => JsonSerializer.Deserialize<JsonElement>("{}")
    };
}
