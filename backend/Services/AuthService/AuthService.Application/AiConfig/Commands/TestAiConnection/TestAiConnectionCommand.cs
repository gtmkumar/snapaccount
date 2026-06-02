using AuthService.Application.Common.Interfaces;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.AiConfig.Commands.TestAiConnection;

/// <summary>
/// Tests connectivity/credentials for the active (or specified) AI provider. Cheap auth check —
/// lists models / validates the key rather than generating tokens. Super Admin only.
/// </summary>
[RequiresPermission(AuthService.Domain.Permissions.PlatformAiManage)]
public record TestAiConnectionCommand(string? Provider = null) : ICommand<TestAiConnectionResponse>;

public record TestAiConnectionResponse(bool Ok, string Provider, string Message);

public sealed class TestAiConnectionCommandHandler(
    IAuthDbContext db,
    IAiKeyProtector protector,
    IAiProviderTester tester) : ICommandHandler<TestAiConnectionCommand, TestAiConnectionResponse>
{
    public async Task<Result<TestAiConnectionResponse>> Handle(TestAiConnectionCommand request, CancellationToken ct)
    {
        var cfg = await db.AiConfigurations.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == AiConfiguration.SingletonId, ct)
            ?? AiConfiguration.CreateDefault();

        var provider = string.IsNullOrWhiteSpace(request.Provider)
            ? cfg.OcrProvider
            : request.Provider.Trim().ToLowerInvariant();

        if (provider is "tesseract" or "document_ai")
            return new TestAiConnectionResponse(true, provider,
                provider == "tesseract" ? "Local OCR engine — no key required." : "Google Document AI uses GCP credentials.");

        var keyRow = await db.AiProviderKeys.AsNoTracking()
            .FirstOrDefaultAsync(k => k.Provider == provider && k.DeletedAt == null, ct);
        if (keyRow is null || string.IsNullOrEmpty(keyRow.EncryptedKey))
            return new TestAiConnectionResponse(false, provider, "No API key configured for this provider.");

        string apiKey;
        try { apiKey = protector.Decrypt(keyRow.EncryptedKey); }
        catch { return new TestAiConnectionResponse(false, provider, "Stored key could not be decrypted (rotate the key)."); }

        var (ok, message) = await tester.TestAsync(provider, apiKey, cfg.OcrModel, ct);
        return new TestAiConnectionResponse(ok, provider, message);
    }
}
