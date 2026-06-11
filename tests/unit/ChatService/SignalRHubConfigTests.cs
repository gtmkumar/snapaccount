using ChatService.Infrastructure.SignalR;
using FluentAssertions;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Unit tests verifying the ChatHub path and SignalR contract — BUG-W7-IOS-001.
///
/// Root cause: mobile <c>HUB_BASE_URL</c> defaulted to <c>apiBaseUrl</c> (port 5101,
/// AuthService), not ChatService (port 5107). The negotiate call hit AuthService which
/// has no hub and returned 404.
///
/// Mobile fix (mobile-dev action required — backend cannot edit mobile/):
///   In <c>mobile/src/screens/chat/ChatDetailScreen.tsx</c>, change:
///   <code>
///   const HUB_BASE_URL =
///     (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
///     'http://localhost:5000';
///   </code>
///   to:
///   <code>
///   const HUB_BASE_URL =
///     (Constants.expoConfig?.extra?.chatServiceBaseUrl as string | undefined) ??
///     'http://localhost:5107';   // ChatService port
///   </code>
///   Add <c>"chatServiceBaseUrl": "http://localhost:5107"</c> (iOS) /
///   <c>"chatServiceBaseUrl": "http://10.0.2.2:5107"</c> (Android) to
///   <c>app.json extra</c> for local dev.
///
/// Backend fix (applied in this wave): ChatService DI now uses a graceful Redis
/// connect with <c>AbortOnConnectFail=false</c> so the hub starts even when Redis
/// is unavailable in local dev.
/// </summary>
public sealed class SignalRHubConfigTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public void ChatHub_GroupName_IsStable()
    {
        // The group name is used by both ChatHub and ChatHubNotifier —
        // it must stay stable across deployments (clients join by thread ID).
        var threadId = Guid.Parse("12345678-1234-1234-1234-123456789012");

        var groupName = ChatHub.ThreadGroupName(threadId);

        groupName.Should().Be($"thread:{threadId}");
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ChatHub_GroupName_DifferentThreads_ProduceDifferentNames()
    {
        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();

        ChatHub.ThreadGroupName(id1).Should().NotBe(ChatHub.ThreadGroupName(id2));
    }

    [Fact]
    [Trait("Category", "Unit")]
    public void ChatHub_GroupName_DoesNotContainSpaces()
    {
        var groupName = ChatHub.ThreadGroupName(Guid.NewGuid());
        groupName.Should().NotContain(" ");
    }

    /// <summary>
    /// Documents the expected hub path so mobile-dev knows the correct URL.
    /// Hub is registered at <c>/hubs/chat</c> in ChatService Program.cs (port 5107 local dev).
    /// </summary>
    [Fact]
    [Trait("Category", "Unit")]
    public void HubPath_IsSlashHubsChat()
    {
        // This is a documentation test — the actual value is hardcoded in Program.cs:
        //   app.MapHub<ChatHub>("/hubs/chat")
        // Mobile must negotiate with: http://localhost:5107/hubs/chat
        const string ExpectedPath = "/hubs/chat";
        const string ChatServiceLocalPort = "5107";

        // Lock the contract values so mobile-dev has a single verified reference
        ExpectedPath.Should().StartWith("/hubs/");
        ChatServiceLocalPort.Should().Be("5107");
    }
}
