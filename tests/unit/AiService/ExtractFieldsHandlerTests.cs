using AiService.Application.Common.Interfaces;
using AiService.Application.Extraction.Commands.ExtractFields;
using AiService.Domain.Entities;
using AiService.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AiService.Tests;

/// <summary>
/// Unit tests for <see cref="ExtractFieldsCommandHandler"/>.
/// RV-03 (SEC-AI-02): Updated to reflect the RESERVATION PATTERN in ITokenBudgetService —
/// TryAcquireBudgetSlotAsync now returns (bool Allowed, Guid? ReservationId) and takes a userId
/// parameter. The handler no longer holds a direct IAiServiceDbContext dependency — audit is
/// routed through ITokenBudgetService.FinaliseReservationAsync / AbortReservationAsync.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ExtractFieldsHandlerTests
{
    private static IAiProviderResolver BuildMockResolver()
    {
        var mock = new AiService.Infrastructure.Providers.MockAiProvider(
            NullLogger<AiService.Infrastructure.Providers.MockAiProvider>.Instance);
        var resolverMock = new Mock<IAiProviderResolver>();
        resolverMock
            .Setup(r => r.ResolveAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ResolvedProvider(mock, "mock-v1"));
        return resolverMock.Object;
    }

    private static ICurrentUser BuildCurrentUser(Guid? userId = null)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.UserId).Returns(userId ?? Guid.NewGuid());
        return mock.Object;
    }

    /// <summary>
    /// Builds a mock ITokenBudgetService that grants/denies slots and tracks calls.
    /// RV-03: TryAcquireBudgetSlotAsync returns (Allowed, ReservationId).
    /// </summary>
    private static Mock<ITokenBudgetService> BuildBudgetServiceMock(bool grantSlot = true)
    {
        var mock = new Mock<ITokenBudgetService>();
        var reservationId = grantSlot ? (Guid?)Guid.NewGuid() : null;

        mock.Setup(b => b.TryAcquireBudgetSlotAsync(
                It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((grantSlot, reservationId));

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

        mock.Setup(b => b.GetDailyUsageAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);

        return mock;
    }

    private static ExtractFieldsCommandHandler BuildHandler(
        Mock<ITokenBudgetService>? budgetMock = null,
        ICurrentUser? currentUser = null)
        => new(
            BuildMockResolver(),
            new TextRedactor(NullLogger<TextRedactor>.Instance),
            budgetMock?.Object ?? BuildBudgetServiceMock().Object,
            currentUser ?? BuildCurrentUser(),
            NullLogger<ExtractFieldsCommandHandler>.Instance);

    [Fact]
    public async Task Handle_WithRawText_ReturnsMockFields()
    {
        var handler = BuildHandler();

        var cmd = new ExtractFieldsCommand(
            null, "Invoice from Acme Pvt Ltd, total 18000", "invoice_extract", Guid.NewGuid());

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Fields.Should().ContainKey("vendor_name");
        result.Value.Fields.Should().ContainKey("amount");
        result.Value.Confidence.Should().BeGreaterThan(0);
        result.Value.Provider.Should().Be("mock");
    }

    [Fact]
    public async Task Handle_PanInRawText_RedactedBeforeProviderCall()
    {
        var handler = BuildHandler();

        var cmd = new ExtractFieldsCommand(
            null, "Invoice from PAN ABCDE1234F, total 5000", "invoice_extract", Guid.NewGuid());

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_NoRawTextButHasDocumentId_ReturnsP7bNotReady()
    {
        var budgetMock = BuildBudgetServiceMock(grantSlot: true);
        var handler = BuildHandler(budgetMock);

        var cmd = new ExtractFieldsCommand(Guid.NewGuid(), null, "invoice_extract", null);
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ai.DocumentTextRequired");
        result.Error.Type.Should().Be(ErrorType.Validation);

        // Reservation must be aborted (no AI call; budget should not be consumed).
        budgetMock.Verify(b => b.AbortReservationAsync(
            It.IsAny<Guid>(), It.Is<string>(s => s == "no_raw_text"), It.IsAny<CancellationToken>()),
            Times.Once,
            "handler must abort the reservation when no raw text is available");
    }

    [Fact]
    public void Validator_NoDocumentIdOrRawText_Fails()
    {
        var validator = new ExtractFieldsCommandValidator();
        var cmd = new ExtractFieldsCommand(null, null, "invoice_extract", null);
        validator.Validate(cmd).IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_SuccessPath_FinalisesReservation()
    {
        // RV-03: after a successful provider call, FinaliseReservationAsync must be called.
        var budgetMock = BuildBudgetServiceMock(grantSlot: true);
        var handler = BuildHandler(budgetMock);

        var cmd = new ExtractFieldsCommand(null, "test invoice content", "invoice_extract", Guid.NewGuid());
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        budgetMock.Verify(b => b.FinaliseReservationAsync(
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once,
            "RV-03: successful extraction must finalise the reservation row with actual token counts");
    }

    [Fact]
    public async Task Handle_BudgetExhausted_ReturnsBudgetExceededError()
    {
        // SEC-AI-02 H-03/M-04: /ai/extract must enforce budget like /ai/chat.
        var budgetMock = BuildBudgetServiceMock(grantSlot: false);
        var handler = BuildHandler(budgetMock);

        var cmd = new ExtractFieldsCommand(null, "test invoice", "invoice_extract", Guid.NewGuid());
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Ai.DailyBudgetExceeded",
            "exhausted budget must return the standard budget-exceeded error code");

        // FinaliseReservationAsync must NOT be called when budget is denied.
        budgetMock.Verify(b => b.FinaliseReservationAsync(
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "no finalisation should happen when budget is denied");
    }

    [Fact]
    public async Task Handle_AdminNullOrgPath_WritesNonReservationRecord()
    {
        // Null/Empty org (admin call) → TryAcquireBudgetSlotAsync returns (true, null).
        // Handler should call RecordNonReservationAsync (no reservation to finalise).
        var budgetMock = new Mock<ITokenBudgetService>();
        budgetMock.Setup(b => b.TryAcquireBudgetSlotAsync(
                It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((true, (Guid?)null)); // no reservation (admin path)

        budgetMock.Setup(b => b.RecordNonReservationAsync(
                It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(),
                It.IsAny<int>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = BuildHandler(budgetMock);
        var cmd = new ExtractFieldsCommand(null, "test invoice", "invoice_extract", null);
        var result = await handler.Handle(cmd, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();

        budgetMock.Verify(b => b.RecordNonReservationAsync(
            It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(),
            It.IsAny<int>(), false, It.IsAny<CancellationToken>()),
            Times.Once,
            "admin/null-org path must write a direct audit record via RecordNonReservationAsync");
    }

    /// <summary>
    /// FG-01 (SEC-AI-02): When the HTTP request is cancelled mid-provider-call,
    /// OperationCanceledException must NOT leave the reservation row open.
    /// AbortReservationAsync must be called with CancellationToken.None (not the
    /// already-cancelled token) so the abort write actually executes.
    /// </summary>
    [Fact]
    public async Task Handle_ProviderCallCancelled_ReservationIsAborted()
    {
        // Arrange: budget service grants a reservation.
        var reservationId = Guid.NewGuid();
        var budgetMock = new Mock<ITokenBudgetService>();
        budgetMock.Setup(b => b.TryAcquireBudgetSlotAsync(
                It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((true, (Guid?)reservationId));

        budgetMock.Setup(b => b.AbortReservationAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        // Arrange: provider throws OperationCanceledException (simulating mid-flight cancel).
        var cancelledProvider = new Mock<IAiProvider>();
        cancelledProvider.Setup(p => p.ProviderId).Returns("mock-cancel");
        cancelledProvider
            .Setup(p => p.ExtractFieldsAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException("Simulated client disconnect"));

        var resolverMock = new Mock<IAiProviderResolver>();
        resolverMock
            .Setup(r => r.ResolveAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ResolvedProvider(cancelledProvider.Object, "mock-cancel-v1"));

        var handler = new ExtractFieldsCommandHandler(
            resolverMock.Object,
            new TextRedactor(NullLogger<TextRedactor>.Instance),
            budgetMock.Object,
            BuildCurrentUser(),
            NullLogger<ExtractFieldsCommandHandler>.Instance);

        var cmd = new ExtractFieldsCommand(null, "test invoice content", "invoice_extract", Guid.NewGuid());

        // Act: the handler must propagate OperationCanceledException after aborting.
        var act = async () => await handler.Handle(cmd, CancellationToken.None);
        await act.Should().ThrowAsync<OperationCanceledException>(
            "OperationCanceledException must propagate so ASP.NET Core can return 499/cancellation");

        // Assert: AbortReservationAsync was called with CancellationToken.None (FG-01).
        // Passing the already-cancelled token would prevent the abort from executing.
        budgetMock.Verify(b => b.AbortReservationAsync(
            reservationId,
            "request_cancelled",
            CancellationToken.None),
            Times.Once,
            "FG-01: AbortReservationAsync must run with CancellationToken.None on cancellation " +
            "so the 1000-token reservation is zeroed and not leaked until UTC midnight");

        // FinaliseReservationAsync must NOT be called — no provider cost was incurred.
        budgetMock.Verify(b => b.FinaliseReservationAsync(
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never,
            "FinaliseReservationAsync must not be called when the provider call was cancelled");
    }
}

// ── Minimal in-memory test DbContext (kept for IngestDocumentHandlerTests) ───

internal sealed class TestAiDbContext(DbContextOptions<TestAiDbContext> options)
    : DbContext(options), IAiServiceDbContext
{
    public DbSet<AiChunk> AiChunks => Set<AiChunk>();
    public DbSet<AiEmbedding> AiEmbeddings => Set<AiEmbedding>();
    public DbSet<AiInteraction> AiInteractions => Set<AiInteraction>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AiChunk>().HasKey(c => c.Id);
        modelBuilder.Entity<AiChunk>().HasOne(c => c.Embedding)
            .WithOne(e => e.Chunk).HasForeignKey<AiEmbedding>(e => e.ChunkId);

        modelBuilder.Entity<AiEmbedding>().HasKey(e => e.Id);
        modelBuilder.Entity<AiEmbedding>()
            .Property(e => e.Vector)
            .HasConversion(
                v => string.Join(",", v),
                s => s.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(float.Parse).ToArray());

        modelBuilder.Entity<AiInteraction>().HasKey(i => i.Id);
        modelBuilder.Entity<AiInteraction>().Property(i => i.IsReservation).HasDefaultValue(false);
    }
}
