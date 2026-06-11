using AuthService.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Services;

/// <summary>
/// Mock device integrity verifier — local dev / CI default.
/// Accepts all tokens and returns <see cref="DeviceIntegrityVerdict.Pass"/>, EXCEPT:
/// <list type="bullet">
///   <item>token equal to <c>"mock-fail"</c> → returns <see cref="DeviceIntegrityVerdict.Fail"/> (for testing enforcement path).</item>
///   <item>token equal to <c>"mock-skip"</c> or empty → returns <see cref="DeviceIntegrityVerdict.Skipped"/>.</item>
/// </list>
/// Always logs at DEBUG level so developers can observe the bypass.
/// </summary>
public sealed class MockDeviceIntegrityVerifier(
    ILogger<MockDeviceIntegrityVerifier> logger) : IDeviceIntegrityVerifier
{
    private const string FailToken = "mock-fail";
    private const string SkipToken = "mock-skip";

    /// <inheritdoc />
    public Task<DeviceIntegrityResult> VerifyAsync(
        string token,
        string platform,
        CancellationToken cancellationToken = default)
    {
        if (token == FailToken)
        {
            logger.LogDebug(
                "[MockDeviceIntegrity] Token={Token} Platform={Platform} → FAIL (test sentinel).",
                token, platform);
            return Task.FromResult(new DeviceIntegrityResult(
                DeviceIntegrityVerdict.Fail,
                "Mock verifier: 'mock-fail' sentinel token returned FAIL for testing."));
        }

        if (token == SkipToken || string.IsNullOrWhiteSpace(token))
        {
            logger.LogDebug(
                "[MockDeviceIntegrity] Token absent/skip sentinel, Platform={Platform} → SKIPPED.",
                platform);
            return Task.FromResult(new DeviceIntegrityResult(
                DeviceIntegrityVerdict.Skipped,
                "Mock verifier: token absent or 'mock-skip' sentinel."));
        }

        logger.LogDebug(
            "[MockDeviceIntegrity] DEV BYPASS — Token={Token} Platform={Platform} → PASS.",
            token, platform);

        return Task.FromResult(new DeviceIntegrityResult(DeviceIntegrityVerdict.Pass));
    }
}
