// Unit tests for DG-SUB-01: IRazorpayClient DI factory wiring.
//
// DG-SUB-01 fix: the non-Development factory no longer throws.
// Instead it reads the RazorpayConfig row from the DB (lazily, per-request) and:
//   - Returns RazorpayHttpClient when IsEnabled=true and credentials are valid.
//   - Returns MockRazorpayClient (safe fallback) when disabled, config missing, or decrypt fails.
//
// GAP-PCI-01: VerifyWebhookSignature removed from IRazorpayClient (still verified here).
//
// Covers:
//   1.  Development environment — MockRazorpayClient is resolvable
//   2.  Non-Development, no config row — falls back to MockRazorpayClient (not throw)
//   3.  Non-Development, IsEnabled=false — falls back to MockRazorpayClient
//   4.  Non-Development, IsEnabled=true + valid creds — returns RazorpayHttpClient
//   5.  Non-Development, decrypt error — falls back to MockRazorpayClient
//   6.  IRazorpayClient interface does NOT declare VerifyWebhookSignature (GAP-PCI-01)
//   7.  MockRazorpayClient does NOT implement VerifyWebhookSignature (GAP-PCI-01)
//   8.  RazorpayHttpClient does NOT implement VerifyWebhookSignature (GAP-PCI-01)

using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Infrastructure.Persistence;
using SubscriptionService.Infrastructure.Razorpay;
using SubscriptionService.Infrastructure.Services;
using Xunit;

namespace SubscriptionService.Tests;

/// <summary>
/// Helpers shared by the DI-factory guard tests.
/// </summary>
file static class FactoryTestHelpers
{
    /// <summary>Creates an in-memory DbContext, seeds an optional RazorpayConfig row, and returns it.</summary>
    public static SubscriptionServiceDbContext CreateDb(RazorpayConfig? config = null)
    {
        var opts = new DbContextOptionsBuilder<SubscriptionServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new SubscriptionServiceDbContext(opts);
        if (config is not null)
        {
            db.RazorpayConfigs.Add(config);
            db.SaveChanges();
        }
        return db;
    }

    /// <summary>Builds a fresh 32-byte AES key as base64.</summary>
    public static string RandomBase64Key32()
        => Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));

    /// <summary>
    /// Builds a service provider that replicates the non-Development scoped factory logic
    /// from Platform.Infrastructure/Subscription/DependencyInjection.cs.
    /// </summary>
    public static IServiceProvider BuildNonDevServices(
        SubscriptionServiceDbContext db,
        string? base64EncryptionKey = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();

        // Register the already-created db as ISubscriptionServiceDbContext
        services.AddSingleton<ISubscriptionServiceDbContext>(db);

        // Register encryption service (uses a real or deliberately wrong key)
        var encKey = base64EncryptionKey ?? RandomBase64Key32();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection([new KeyValuePair<string, string?>("ENCRYPTION_KEY", encKey)])
            .Build();
        services.AddSingleton<ICredentialEncryptionService>(new AesCredentialEncryptionService(config));

        // Named HttpClient for RazorpayHttpClient
        services.AddHttpClient("Razorpay", c =>
        {
            c.BaseAddress = new Uri("https://api.razorpay.com/v1/");
        });

        // Replicate the non-Dev scoped factory from DI.cs
        services.AddScoped<IRazorpayClient>(sp =>
        {
            var dbCtx       = sp.GetRequiredService<ISubscriptionServiceDbContext>();
            var encryption  = sp.GetRequiredService<ICredentialEncryptionService>();
            var factory     = sp.GetRequiredService<IHttpClientFactory>();
            var logFactory  = sp.GetRequiredService<Microsoft.Extensions.Logging.ILoggerFactory>();
            var logger      = Microsoft.Extensions.Logging.LoggerFactoryExtensions
                                .CreateLogger<RazorpayHttpClient>(logFactory);
            var mockLogger  = Microsoft.Extensions.Logging.LoggerFactoryExtensions
                                .CreateLogger<MockRazorpayClient>(logFactory);

            var razorpayConfig = dbCtx.RazorpayConfigs
                .AsQueryable()
                .Where(c => c.DeletedAt == null)
                .OrderByDescending(c => c.UpdatedAt)
                .FirstOrDefault();

            if (razorpayConfig is not { IsEnabled: true })
                return new MockRazorpayClient(mockLogger);

            string keySecret;
            try
            {
                keySecret = encryption.Decrypt(razorpayConfig.EncryptedKeySecret);
            }
            catch
            {
                return new MockRazorpayClient(mockLogger);
            }

            var options = new RazorpayClientOptions(razorpayConfig.KeyId, keySecret);
            return new RazorpayHttpClient(factory, options, logger);
        });

        return services.BuildServiceProvider();
    }
}

[Trait("Category", "Unit")]
public sealed class RazorpayDiFactoryTests
{
    // ── Test 1: Development always uses Mock ─────────────────────────────────

    [Fact]
    public void Development_MockClientIsResolvable()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddScoped<IRazorpayClient, MockRazorpayClient>();
        var sp = services.BuildServiceProvider();

        using var scope = sp.CreateScope();
        var act = () => scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        act.Should().NotThrow("MockRazorpayClient must be resolvable in Development");

        var client = scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        client.Should().BeOfType<MockRazorpayClient>();
    }

    // ── Test 2: Non-Dev, no config row → MockRazorpayClient (not throw) ──────

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void NonDev_NoConfigRow_ReturnsMockClient(string environment)
    {
        _ = environment; // label only — the factory logic is environment-agnostic in this test
        using var db = FactoryTestHelpers.CreateDb(config: null);
        var sp = FactoryTestHelpers.BuildNonDevServices(db);

        using var scope = sp.CreateScope();

        // Must NOT throw (DG-SUB-01 fix: fallback to mock, not fail-fast)
        var act = () => scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        act.Should().NotThrow("missing config row → safe fallback to MockRazorpayClient");

        var client = scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        client.Should().BeOfType<MockRazorpayClient>(
            "without a config row the factory falls back to the safe no-op mock");
    }

    // ── Test 3: Non-Dev, IsEnabled=false → MockRazorpayClient ────────────────

    [Fact]
    public void NonDev_ConfigDisabled_ReturnsMockClient()
    {
        var encSvc = new AesCredentialEncryptionService(
            new ConfigurationBuilder()
                .AddInMemoryCollection([new KeyValuePair<string, string?>(
                    "ENCRYPTION_KEY", FactoryTestHelpers.RandomBase64Key32())])
                .Build());

        var config = new RazorpayConfig
        {
            KeyId                = "rzp_test_key123",
            EncryptedKeySecret   = encSvc.Encrypt("some_secret"),
            IsEnabled            = false,  // ← disabled
        };

        using var db = FactoryTestHelpers.CreateDb(config);
        // encKey=null → factory picks a fresh key; IsEnabled=false means Mock is returned regardless
        var sp = FactoryTestHelpers.BuildNonDevServices(db, base64EncryptionKey: null);

        using var scope = sp.CreateScope();
        var client = scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        client.Should().BeOfType<MockRazorpayClient>(
            "IsEnabled=false must fall back to the no-op mock, not call the real API");
    }

    // ── Test 4: Non-Dev, IsEnabled=true + valid creds → RazorpayHttpClient ───

    [Fact]
    public void NonDev_ConfigEnabled_ReturnsRazorpayHttpClient()
    {
        var encKey = FactoryTestHelpers.RandomBase64Key32();
        var encSvc = new AesCredentialEncryptionService(
            new ConfigurationBuilder()
                .AddInMemoryCollection([new KeyValuePair<string, string?>("ENCRYPTION_KEY", encKey)])
                .Build());

        var config = new RazorpayConfig
        {
            KeyId              = "rzp_test_valid123",
            EncryptedKeySecret = encSvc.Encrypt("valid_secret_key"),
            IsEnabled          = true,   // ← enabled
        };

        using var db = FactoryTestHelpers.CreateDb(config);
        var sp = FactoryTestHelpers.BuildNonDevServices(db, encKey);

        using var scope = sp.CreateScope();
        var client = scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        client.Should().BeOfType<RazorpayHttpClient>(
            "IsEnabled=true with decryptable credentials must return the live HTTP client");
    }

    // ── Test 5: Non-Dev, decrypt fails → MockRazorpayClient (not throw) ──────

    [Fact]
    public void NonDev_DecryptFails_ReturnsMockClient()
    {
        // Encrypt with key1, but decrypt context uses key2 → CryptographicException → fallback
        var encKey1 = FactoryTestHelpers.RandomBase64Key32();
        var encSvc1 = new AesCredentialEncryptionService(
            new ConfigurationBuilder()
                .AddInMemoryCollection([new KeyValuePair<string, string?>("ENCRYPTION_KEY", encKey1)])
                .Build());

        var config = new RazorpayConfig
        {
            KeyId              = "rzp_test_badkey",
            EncryptedKeySecret = encSvc1.Encrypt("secret_encrypted_with_key1"),
            IsEnabled          = true,
        };

        using var db = FactoryTestHelpers.CreateDb(config);

        // BuildNonDevServices with a DIFFERENT key → decrypt will throw
        var encKey2 = FactoryTestHelpers.RandomBase64Key32();
        var sp = FactoryTestHelpers.BuildNonDevServices(db, encKey2);

        using var scope = sp.CreateScope();
        var act = () => scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        act.Should().NotThrow("decrypt failure must fall back to mock, not propagate the exception");

        var client = scope.ServiceProvider.GetRequiredService<IRazorpayClient>();
        client.Should().BeOfType<MockRazorpayClient>(
            "decrypt exception path must return the safe mock, not the broken http client");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// GAP-PCI-01: VerifyWebhookSignature removed from IRazorpayClient
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class PciRazorpayInterfaceTests
{
    [Fact]
    public void IRazorpayClient_DoesNotDeclare_VerifyWebhookSignature()
    {
        // The method must NOT exist on the interface — it used string.Equals (non-constant-time)
        // and was dead code. The authoritative HMAC is in RazorpayWebhook.cs.
        var interfaceMethods = typeof(IRazorpayClient)
            .GetMethods()
            .Select(m => m.Name)
            .ToList();

        interfaceMethods.Should().NotContain(
            "VerifyWebhookSignature",
            "GAP-PCI-01: non-constant-time string.Equals verification must be removed from the interface");
    }

    [Fact]
    public void MockRazorpayClient_DoesNotImplement_VerifyWebhookSignature()
    {
        var methods = typeof(MockRazorpayClient)
            .GetMethods(
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.DeclaredOnly)
            .Select(m => m.Name)
            .ToList();

        methods.Should().NotContain(
            "VerifyWebhookSignature",
            "GAP-PCI-01: MockRazorpayClient must not implement the removed method");
    }

    [Fact]
    public void RazorpayHttpClient_DoesNotImplement_VerifyWebhookSignature()
    {
        var methods = typeof(RazorpayHttpClient)
            .GetMethods(
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.DeclaredOnly)
            .Select(m => m.Name)
            .ToList();

        methods.Should().NotContain(
            "VerifyWebhookSignature",
            "GAP-PCI-01: RazorpayHttpClient must not implement the non-constant-time method");
    }
}
