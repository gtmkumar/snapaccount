using ChatService.Application.Common.Interfaces;
using ChatService.Application.Threads.Commands.SendMessage;
using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Unit tests for <see cref="SendMessageCommandHandler"/> idempotency via
/// <c>client_message_id</c> (migration 057 / Phase 7 #15).
///
/// Covers:
///   1. Duplicate send with same clientMessageId returns the SAME messageId.
///   2. No new message is persisted on a duplicate send.
///   3. Null clientMessageId always creates a new message (no idempotency gate).
///   4. Empty clientMessageId behaves the same as null (no idempotency gate).
///   5. Different clientMessageIds in the same thread create distinct messages.
///
/// Uses EF Core InMemory database — no real Postgres needed for unit tests.
/// </summary>
[Trait("Category", "Unit")]
public sealed class SendMessageIdempotencyTests : IDisposable
{
    // ── Setup ─────────────────────────────────────────────────────────────────

    private readonly IChatServiceDbContext _db;
    private readonly Mock<ICurrentUser> _currentUserMock = new();
    private readonly Mock<IChatHubNotifier> _hubMock = new();

    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _userId = Guid.NewGuid();

    // Underlying EF Core InMemory context
    private readonly ChatService.Infrastructure.Persistence.ChatServiceDbContext _efContext;

    public SendMessageIdempotencyTests()
    {
        var options = new DbContextOptionsBuilder<ChatService.Infrastructure.Persistence.ChatServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _efContext = new ChatService.Infrastructure.Persistence.ChatServiceDbContext(options);
        _db = _efContext;

        // Default current user: authenticated, in org
        _currentUserMock.Setup(u => u.IsAuthenticated).Returns(true);
        _currentUserMock.Setup(u => u.UserId).Returns(_userId);
        _currentUserMock.Setup(u => u.OrganizationId).Returns(_orgId);
        _currentUserMock.Setup(u => u.HasPermission(It.IsAny<string>())).Returns(true);

        // Hub notifier: no-op
        _hubMock
            .Setup(h => h.NotifyMessageAsync(
                It.IsAny<Guid>(),
                It.IsAny<SendMessageResponse>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
    }

    public void Dispose() => _efContext.Dispose();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private SendMessageCommandHandler MakeHandler()
        => new(_db, _currentUserMock.Object, _hubMock.Object);

    /// <summary>
    /// Creates a thread in the InMemory DB, adds the test user as a participant,
    /// and returns the thread ID.
    /// </summary>
    private async Task<Guid> SeedThreadAsync()
    {
        var thread = ChatThread.Open(_orgId, _userId, ThreadCategory.GENERAL, "Test thread");
        _efContext.Threads.Add(thread);
        await _efContext.SaveChangesAsync();
        return thread.Id;
    }

    // ── Test: duplicate send returns same messageId ───────────────────────────

    [Fact]
    public async Task SendMessage_SameClientMessageId_Returns_Same_MessageId()
    {
        var threadId = await SeedThreadAsync();
        var clientMessageId = $"offline-{Guid.NewGuid():N}";
        var handler = MakeHandler();

        // First send
        var first = await handler.Handle(
            new SendMessageCommand(threadId, "Hello world", null, clientMessageId),
            CancellationToken.None);

        first.IsSuccess.Should().BeTrue();
        var firstMessageId = first.Value.MessageId;

        // Second send — same clientMessageId
        var second = await handler.Handle(
            new SendMessageCommand(threadId, "Hello world", null, clientMessageId),
            CancellationToken.None);

        second.IsSuccess.Should().BeTrue();
        var secondMessageId = second.Value.MessageId;

        secondMessageId.Should().Be(firstMessageId,
            "repeated send with same clientMessageId must return the existing messageId (idempotent)");
    }

    // ── Test: duplicate send does NOT create a new row ────────────────────────

    [Fact]
    public async Task SendMessage_SameClientMessageId_Does_Not_Create_Duplicate_Row()
    {
        var threadId = await SeedThreadAsync();
        var clientMessageId = $"offline-{Guid.NewGuid():N}";
        var handler = MakeHandler();

        await handler.Handle(
            new SendMessageCommand(threadId, "First", null, clientMessageId),
            CancellationToken.None);

        var countBefore = await _efContext.Messages
            .CountAsync(m => m.ThreadId == threadId && m.ClientMessageId == clientMessageId);

        // Duplicate send
        await handler.Handle(
            new SendMessageCommand(threadId, "First", null, clientMessageId),
            CancellationToken.None);

        var countAfter = await _efContext.Messages
            .CountAsync(m => m.ThreadId == threadId && m.ClientMessageId == clientMessageId);

        countBefore.Should().Be(1);
        countAfter.Should().Be(1, "duplicate clientMessageId must not insert a second row");
    }

    // ── Test: null clientMessageId always creates a new message ──────────────

    [Fact]
    public async Task SendMessage_NullClientMessageId_Creates_New_Message_Each_Time()
    {
        var threadId = await SeedThreadAsync();
        var handler = MakeHandler();

        // Two sends without clientMessageId
        var first = await handler.Handle(
            new SendMessageCommand(threadId, "Msg A", null, null),
            CancellationToken.None);

        var second = await handler.Handle(
            new SendMessageCommand(threadId, "Msg B", null, null),
            CancellationToken.None);

        first.IsSuccess.Should().BeTrue();
        second.IsSuccess.Should().BeTrue();
        first.Value.MessageId.Should().NotBe(second.Value.MessageId,
            "null clientMessageId must not trigger idempotency check — each call creates a new message");
    }

    // ── Test: empty clientMessageId treated same as null ─────────────────────

    [Fact]
    public async Task SendMessage_EmptyClientMessageId_Creates_New_Message_Each_Time()
    {
        var threadId = await SeedThreadAsync();
        var handler = MakeHandler();

        var first = await handler.Handle(
            new SendMessageCommand(threadId, "Msg A", null, ""),
            CancellationToken.None);

        var second = await handler.Handle(
            new SendMessageCommand(threadId, "Msg B", null, ""),
            CancellationToken.None);

        first.IsSuccess.Should().BeTrue();
        second.IsSuccess.Should().BeTrue();
        // Empty string is treated same as null (IsNullOrEmpty check in handler)
        first.Value.MessageId.Should().NotBe(second.Value.MessageId,
            "empty clientMessageId must not trigger idempotency — same as null");
    }

    // ── Test: different clientMessageIds in same thread create distinct rows ──

    [Fact]
    public async Task SendMessage_DifferentClientMessageIds_Create_Distinct_Messages()
    {
        var threadId = await SeedThreadAsync();
        var handler = MakeHandler();

        var first = await handler.Handle(
            new SendMessageCommand(threadId, "Msg 1", null, "client-id-1"),
            CancellationToken.None);

        var second = await handler.Handle(
            new SendMessageCommand(threadId, "Msg 2", null, "client-id-2"),
            CancellationToken.None);

        first.IsSuccess.Should().BeTrue();
        second.IsSuccess.Should().BeTrue();
        first.Value.MessageId.Should().NotBe(second.Value.MessageId,
            "different clientMessageIds must produce distinct message rows");
    }

    // ── Test: idempotent response contains correct clientMessageId ────────────

    [Fact]
    public async Task SendMessage_IdempotentResponse_Contains_ClientMessageId()
    {
        var threadId = await SeedThreadAsync();
        var clientMessageId = $"mobile-{Guid.NewGuid():N}";
        var handler = MakeHandler();

        // First send
        await handler.Handle(
            new SendMessageCommand(threadId, "Body text", null, clientMessageId),
            CancellationToken.None);

        // Idempotent second send
        var response = await handler.Handle(
            new SendMessageCommand(threadId, "Body text", null, clientMessageId),
            CancellationToken.None);

        response.IsSuccess.Should().BeTrue();
        response.Value.ClientMessageId.Should().Be(clientMessageId,
            "the idempotent response must echo back the original clientMessageId");
    }

    // ── Test: validator accepts clientMessageId up to 128 chars ──────────────

    [Fact]
    public void SendMessageCommandValidator_Accepts_ClientMessageId_Up_To_128_Chars()
    {
        var validator = new SendMessageCommandValidator();
        var cmd = new SendMessageCommand(
            Guid.NewGuid(),
            "Hello",
            null,
            new string('x', 128));  // exactly 128 chars

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void SendMessageCommandValidator_Rejects_ClientMessageId_Over_128_Chars()
    {
        var validator = new SendMessageCommandValidator();
        var cmd = new SendMessageCommand(
            Guid.NewGuid(),
            "Hello",
            null,
            new string('x', 129));  // 129 chars — exceeds limit

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "ClientMessageId");
    }

    // ── Test: SendMessageCommand carries clientMessageId through to response ──

    [Fact]
    public async Task SendMessageCommand_ClientMessageId_Is_Surfaced_In_Response()
    {
        // Verify the command DTO carries ClientMessageId and it appears in the response
        var threadId = await SeedThreadAsync();
        var handler = MakeHandler();
        var clientId = "api-dto-test-" + Guid.NewGuid().ToString("N");

        var result = await handler.Handle(
            new SendMessageCommand(threadId, "Hello", null, clientId),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.ClientMessageId.Should().Be(clientId,
            "SendMessageResponse must echo back the clientMessageId from the command");
    }
}
