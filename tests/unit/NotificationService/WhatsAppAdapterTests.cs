// Unit tests for GAP-045: WhatsAppBusinessAdapter
//
// Covers:
//   1.  SendAsync returns WHATSAPP_DISABLED when feature flag is off (no HTTP call)
//   2.  SendAsync logs a warning when skipped due to disabled flag
//   3.  WhatsApp channel is registered on the adapter
//   4.  NormalisePhone strips + and spaces
//   5.  NormalisePhone strips dashes

using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using NotificationService.Application.Interfaces;
using NotificationService.Domain.Entities;
using NotificationService.Infrastructure.Adapters;
using Xunit;

namespace NotificationService.Tests;

[Trait("Category", "Unit")]
public sealed class WhatsAppAdapterTests
{
    private static NotificationDispatchContext MakeContext(string? phone = "+91 98765-43210") =>
        new(
            UserId: Guid.NewGuid(),
            EventCode: "test.event",
            RenderedSubject: "Test",
            RenderedBody: "Hello",
            DltTemplateId: null,
            SenderName: "SnapAccount",
            RecipientEmail: null,
            RecipientPhone: phone,
            FcmTokens: [],
            Locale: "en",
            Metadata: new Dictionary<string, string>());

    private static WhatsAppBusinessAdapter BuildAdapter(
        bool enabled,
        IHttpClientFactory? httpFactory = null,
        ILogger<WhatsAppBusinessAdapter>? logger = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["WhatsApp:Enabled"]       = enabled ? "true" : "false",
                ["WhatsApp:AccessToken"]   = "test-token",
                ["WhatsApp:PhoneNumberId"] = "12345678",
                ["WhatsApp:ApiVersion"]    = "v19.0",
            })
            .Build();

        httpFactory ??= new Mock<IHttpClientFactory>().Object;
        logger      ??= new Mock<ILogger<WhatsAppBusinessAdapter>>().Object;

        return new WhatsAppBusinessAdapter(httpFactory, config, logger);
    }

    [Fact]
    public async Task SendAsync_FeatureFlagOff_ReturnsWhatsAppDisabled_WithoutHttpCall()
    {
        var httpFactory = new Mock<IHttpClientFactory>();
        var adapter     = BuildAdapter(enabled: false, httpFactory: httpFactory.Object);

        var result = await adapter.SendAsync(MakeContext(), CancellationToken.None);

        result.Should().Be("WHATSAPP_DISABLED");
        // No HTTP client should be created
        httpFactory.Verify(f => f.CreateClient(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SendAsync_FeatureFlagOff_LogsWarning()
    {
        var logger = new Mock<ILogger<WhatsAppBusinessAdapter>>();
        var adapter = BuildAdapter(enabled: false, logger: logger.Object);

        await adapter.SendAsync(MakeContext(), CancellationToken.None);

        // Should have logged a warning about the skip
        logger.Verify(
            l => l.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, _) => v.ToString()!.Contains("disabled")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once,
            "adapter should emit a LogWarning when WhatsApp is disabled (GAP-053 pattern)");
    }

    [Fact]
    public void Channel_IsWhatsApp()
    {
        var adapter = BuildAdapter(enabled: false);
        adapter.Channel.Should().Be(NotificationChannel.WhatsApp);
    }

    // ── Phone normalisation via private static — tested via Reflection ─────

    [Theory]
    [InlineData("+91 98765-43210", "919876543210")]
    [InlineData("+1-800-555-1234", "18005551234")]
    [InlineData("91 98765 43210", "919876543210")]
    [InlineData("9876543210",     "9876543210")]
    public void NormalizePhone_StripsLeadingPlusSpacesDashes(string input, string expected)
    {
        // Access the private static NormalizePhone via reflection so we test the
        // actual helper without calling the full SendAsync path.
        var method = typeof(WhatsAppBusinessAdapter).GetMethod(
            "NormalizePhone",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

        method.Should().NotBeNull("NormalizePhone private static method must exist");

        var result = (string)method!.Invoke(null, [input])!;
        result.Should().Be(expected);
    }
}
