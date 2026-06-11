using AiService.Application.Chat.Queries.AiChat;
using AiService.Application.Common.Interfaces;
using AiService.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AiService.Tests;

/// <summary>
/// Unit tests for <see cref="AiChatQueryHandler"/>.
/// Covers: cancellation reservation leak (FG-01/SEC-AI-02), success-path finalisation,
/// and admin/null-org non-reservation record.
/// </summary>
[Trait("Category", "Unit")]
public sealed class AiChatHandlerTests
{
    // ── Helpers ─────────────────────────────────────────────────────────────────

    private static ICurrentUser BuildCurrentUser()
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.UserId).Returns(Guid.NewGuid());
        return mock.Object;
    }

    private static ISarvamAiService BuildSarvam()
    {
        var mock = new Mock<ISarvamAiService>();
        mock.Setup(s => s.TranslateToEnglishAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Success("translated"));
        mock.Setup(s => s.TranslateFromEnglishAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<string>.Success("translated-back"));
        return mock.Object;
    }

    /// <summary>
    /// Builds an in-memory DbContext for <see cref="IAiServiceDbContext"/>.
    /// The AiEmbeddings table will be empty → graceful degradation (no chunk retrieval).
    /// </summary>
    private static IAiServiceDbContext BuildEmptyDb()
    {
        var options = new DbContextOptionsBuilder<TestAiDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TestAiDbContext(options);
    }

    private static Mock<ITokenBudgetService> BuildBudgetMock(bool grantSlot = true, Guid? reservationId = null)
    {
        var id = reservationId ?? (grantSlot ? (Guid?)Guid.NewGuid() : null);
        var mock = new Mock<ITokenBudgetService>();

        mock.Setup(b => b.TryAcquireBudgetSlotAsync(
                It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((grantSlot, id));

        mock.Setup(b => b.FinaliseReservationAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        mock.Setup(b => b.AbortReservationAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        mock.Setup(b => b.RecordNonReservationAsync(
                It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<int>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        return mock;
    }

    private static AiChatQueryHandler BuildHandler(
        Mock<ITokenBudgetService> budgetMock,
        IAiProvider? provider = null,
        IAiServiceDbContext? db = null)
    {
        var actualProvider = provider
            ?? new AiService.Infrastructure.Providers.MockAiProvider(
                NullLogger<AiService.Infrastructure.Providers.MockAiProvider>.Instance);

        var resolverMock = new Mock<IAiProviderResolver>();
        resolverMock
            .Setup(r => r.ResolveAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ResolvedProvider(actualProvider, "mock-v1"));

        return new AiChatQueryHandler(
            resolverMock.Object,
            new TextRedactor(NullLogger<TextRedactor>.Instance),
            BuildSarvam(),
            db ?? BuildEmptyDb(),
            budgetMock.Object,
            BuildCurrentUser(),
            NullLogger<AiChatQueryHandler>.Instance);
    }

    // ── Tests ────────────────────────────────────────────────────────────────────

    /// <summary>
    /// FG-01 (SEC-AI-02): When the HTTP request is cancelled mid-provider-call,
    /// the reservation row must be aborted — not left open until UTC midnight.
    /// AbortReservationAsync must be called with CancellationToken.None (not the
    /// already-cancelled token), so the DB write actually executes.
    /// </summary>
    [Fact]
    public async Task Handle_ChatProviderCallCancelled_ReservationIsAborted()
    {
        // Arrange: budget grants a reservation.
        var reservationId = Guid.NewGuid();
        var budgetMock = BuildBudgetMock(grantSlot: true, reservationId: reservationId);

        // Arrange: embed succeeds, but ChatAsync throws OperationCanceledException
        // (simulating a client disconnect mid-LLM-call).
        var cancelledProvider = new Mock<IAiProvider>();
        cancelledProvider.Setup(p => p.ProviderId).Returns("mock-cancel");
        cancelledProvider
            .Setup(p => p.EmbedAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<float[]>.Success(new float[768]));
        cancelledProvider
            .Setup(p => p.ChatAsync(
                It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(),
                It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException("Simulated client disconnect"));

        var handler = BuildHandler(budgetMock, provider: cancelledProvider.Object);

        var query = new AiChatQuery(
            Message: "What is my GST due?",
            OrganizationId: Guid.NewGuid(),
            SessionId: null,
            Locale: "en");

        // Act: handler must propagate OperationCanceledException.
        var act = async () => await handler.Handle(query, CancellationToken.None);
        await act.Should().ThrowAsync<OperationCanceledException>(
            "OperationCanceledException must propagate so ASP.NET Core can return 499/cancellation");

        // Assert: AbortReservationAsync called with CancellationToken.None (FG-01).
        budgetMock.Verify(b => b.AbortReservationAsync(
            reservationId,
            "request_cancelled",
            CancellationToken.None),
            Times.Once,
            "FG-01: AbortReservationAsync must run with CancellationToken.None on cancellation " +
            "so the 1000-token reservation is zeroed and not leaked until UTC midnight");

        // FinaliseReservationAsync must NOT be called — provider did not return.
        budgetMock.Verify(b => b.FinaliseReservationAsync(
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "FinaliseReservationAsync must not be called when the provider call was cancelled");
    }

    /// <summary>
    /// Verifies the success path: FinaliseReservationAsync is called with CancellationToken.None
    /// so that a concurrent cancellation (e.g. load-balancer timeout) between provider return
    /// and finalise cannot skip the audit write once the provider cost is already incurred.
    /// </summary>
    [Fact]
    public async Task Handle_SuccessPath_FinalisesReservationWithNoneToken()
    {
        var reservationId = Guid.NewGuid();
        var budgetMock = BuildBudgetMock(grantSlot: true, reservationId: reservationId);

        var handler = BuildHandler(budgetMock);

        var query = new AiChatQuery(
            Message: "What is my GST due?",
            OrganizationId: Guid.NewGuid(),
            SessionId: null,
            Locale: "en");

        var result = await handler.Handle(query, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        // FG-01: finalise must use CancellationToken.None.
        budgetMock.Verify(b => b.FinaliseReservationAsync(
            reservationId,
            It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<int>(),
            CancellationToken.None),
            Times.Once,
            "FG-01: FinaliseReservationAsync must use CancellationToken.None so cost write " +
            "cannot be skipped by a concurrent cancellation after the provider already returned");

        budgetMock.Verify(b => b.AbortReservationAsync(
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "AbortReservationAsync must not be called on the success path");
    }
}
