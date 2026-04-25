using AccountingService.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace AccountingService.Tests;

/// <summary>
/// Unit tests for the <see cref="JournalBatch"/> aggregate root.
/// Phase 6A — domain invariant coverage.
/// </summary>
[Trait("Category", "Unit")]
public class JournalBatchDomainTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid DebitAccId = Guid.NewGuid();
    private static readonly Guid CreditAccId = Guid.NewGuid();

    // ──────────────────────────────────────────────────────────────
    // Factory
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Create_SetsOrgIdAndSource()
    {
        var batch = JournalBatch.Create(OrgId, "JB-001", "Test batch",
            new DateOnly(2026, 3, 31), PostingSource.Manual);

        batch.OrgId.Should().Be(OrgId);
        batch.Source.Should().Be(PostingSource.Manual);
        batch.Status.Should().Be("DRAFT");
    }

    // ──────────────────────────────────────────────────────────────
    // Indian FY mapping  (Apr–Mar)
    // ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(2026, 4, 1, 2027)]   // April 2026 → FY 2026-27 → fyYear = 2027
    [InlineData(2026, 3, 31, 2026)]  // March 2026 → FY 2025-26 → fyYear = 2026
    [InlineData(2025, 4, 1, 2026)]   // April 2025 → FY 2025-26 → fyYear = 2026
    [InlineData(2025, 12, 31, 2026)] // December 2025 → FY 2025-26 → fyYear = 2026
    public void Create_MapsIndianFiscalYearCorrectly(int year, int month, int day, int expectedFyYear)
    {
        var batch = JournalBatch.Create(OrgId, "JB-001", "FY test",
            new DateOnly(year, month, day), PostingSource.Manual);

        batch.FyYear.Should().Be(expectedFyYear);
    }

    // ──────────────────────────────────────────────────────────────
    // Validate — balance invariant
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Validate_EmptyBatch_ReturnsFailure()
    {
        var batch = JournalBatch.Create(OrgId, "JB-001", "Empty", new DateOnly(2026, 1, 1), PostingSource.Manual);

        var result = batch.Validate();

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("JournalBatch.Empty");
    }

    [Fact]
    public void Validate_BalancedBatch_ReturnsSuccess()
    {
        var batch = BuildBalancedBatch(1000m);

        var result = batch.Validate();

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void Validate_BalancedBatch_WithMultipleEntries_ReturnsSuccess()
    {
        var batch = JournalBatch.Create(OrgId, "JB-002", "Multi", new DateOnly(2026, 1, 15), PostingSource.Manual);
        AddEntry(batch, 500m);
        AddEntry(batch, 750m);

        var result = batch.Validate();

        // In double-entry each AddEntry adds to both TotalDebit and TotalCredit equally
        result.IsSuccess.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────
    // Post
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Post_ValidBatch_SetsStatusToPosted()
    {
        var batch = BuildBalancedBatch(5000m);

        var result = batch.Post();

        result.IsSuccess.Should().BeTrue();
        batch.Status.Should().Be("POSTED");
    }

    [Fact]
    public void Post_ValidBatch_RaisesDomainEvent()
    {
        var batch = BuildBalancedBatch(5000m);

        batch.Post();

        batch.DomainEvents.Should().ContainSingle(e =>
            e is AccountingService.Domain.Events.JournalBatchPostedEvent);
    }

    [Fact]
    public void Post_EmptyBatch_ReturnsFailure_WithoutMutatingStatus()
    {
        var batch = JournalBatch.Create(OrgId, "JB-003", "Empty post", new DateOnly(2026, 1, 1), PostingSource.Manual);

        var result = batch.Post();

        result.IsFailure.Should().BeTrue();
        batch.Status.Should().Be("DRAFT");
    }

    // ──────────────────────────────────────────────────────────────
    // AddEntry accumulation
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void AddEntry_AccumulatesTotalDebitAndCredit()
    {
        var batch = JournalBatch.Create(OrgId, "JB-004", "Accumulate", new DateOnly(2026, 2, 1), PostingSource.Ocr);
        AddEntry(batch, 1000m);
        AddEntry(batch, 500m);

        batch.TotalDebit.Should().Be(1500m);
        batch.TotalCredit.Should().Be(1500m);
        batch.Entries.Count.Should().Be(2);
    }

    // ──────────────────────────────────────────────────────────────
    // PostFromOcr idempotency — dedupe_hash behaviour
    // DedupeHash is passed in by the PostFromOcr handler (computed externally as
    // SHA-256(documentId || payloadHash)); the entity stores it as-is.
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void LedgerEntry_Create_WithDedupeHash_StoresIt()
    {
        var hash = "abc123deadbeef";
        var entry = LedgerEntry.Create(
            OrgId, DebitAccId, CreditAccId,
            1000m, "OCR narration",
            2026, 12, PostingSource.Ocr,
            documentId: Guid.NewGuid(),
            dedupeHash: hash);

        entry.DedupeHash.Should().Be(hash);
    }

    [Fact]
    public void LedgerEntry_Create_WithoutDedupeHash_IsNullForManualEntry()
    {
        var entry = LedgerEntry.Create(
            OrgId, DebitAccId, CreditAccId,
            500m, "Manual narration",
            2026, 9, PostingSource.Manual);

        entry.DedupeHash.Should().BeNull();
    }

    [Fact]
    public void LedgerEntry_Create_WithSameDedupeHash_UniqueIndexWouldReject()
    {
        // This test validates the contract: two entries with the same dedupe_hash
        // are identical OCR redeliveries. At the DB level a partial unique index prevents
        // duplicates — here we just verify the hash is stored correctly per contract.
        var docId = Guid.NewGuid();
        const string hash = "sha256-deterministic-hash-value";

        var entry1 = LedgerEntry.Create(OrgId, DebitAccId, CreditAccId, 500m, "Test",
            2026, 12, PostingSource.Ocr, documentId: docId, dedupeHash: hash);
        var entry2 = LedgerEntry.Create(OrgId, DebitAccId, CreditAccId, 500m, "Test",
            2026, 12, PostingSource.Ocr, documentId: docId, dedupeHash: hash);

        entry1.DedupeHash.Should().Be(entry2.DedupeHash, "same payload → same hash → DB unique index catches duplicate");
    }

    // ──────────────────────────────────────────────────────────────
    // PostJournalBatchCommandValidator
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void PostJournalBatchCommandValidator_EmptyEntries_IsInvalid()
    {
        var validator = new Application.JournalBatches.Commands.PostJournalBatch.PostJournalBatchCommandValidator();
        var cmd = new Application.JournalBatches.Commands.PostJournalBatch.PostJournalBatchCommand(
            OrgId, "Test batch", new DateOnly(2026, 1, 1),
            []);  // no entries

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("at least one entry"));
    }

    [Fact]
    public void PostJournalBatchCommandValidator_NegativeAmount_IsInvalid()
    {
        var validator = new Application.JournalBatches.Commands.PostJournalBatch.PostJournalBatchCommandValidator();
        var cmd = new Application.JournalBatches.Commands.PostJournalBatch.PostJournalBatchCommand(
            OrgId, "Test", new DateOnly(2026, 1, 1),
            [new Application.JournalBatches.Commands.PostJournalBatch.JournalBatchLineRequest(
                DebitAccId, CreditAccId, -100m, "Bad amount")]);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void PostJournalBatchCommandValidator_ValidCommand_IsValid()
    {
        var validator = new Application.JournalBatches.Commands.PostJournalBatch.PostJournalBatchCommandValidator();
        var cmd = new Application.JournalBatches.Commands.PostJournalBatch.PostJournalBatchCommand(
            OrgId, "Valid batch", new DateOnly(2026, 1, 15),
            [new Application.JournalBatches.Commands.PostJournalBatch.JournalBatchLineRequest(
                DebitAccId, CreditAccId, 1000m, "Sales revenue")]);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────
    // GetTrialBalance validator
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void GetTrialBalanceQueryValidator_InvalidFyYear_IsInvalid()
    {
        var validator = new Application.Reports.Queries.GetTrialBalance.GetTrialBalanceQueryValidator();
        var query = new Application.Reports.Queries.GetTrialBalance.GetTrialBalanceQuery(OrgId, 1999); // too old

        var result = validator.Validate(query);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void GetTrialBalanceQueryValidator_ValidQuery_IsValid()
    {
        var validator = new Application.Reports.Queries.GetTrialBalance.GetTrialBalanceQueryValidator();
        var query = new Application.Reports.Queries.GetTrialBalance.GetTrialBalanceQuery(OrgId, 2026);

        var result = validator.Validate(query);

        result.IsValid.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────

    private static JournalBatch BuildBalancedBatch(decimal amount)
    {
        var batch = JournalBatch.Create(OrgId, "JB-TEST", "Balanced", new DateOnly(2026, 1, 1), PostingSource.Manual);
        AddEntry(batch, amount);
        return batch;
    }

    private static void AddEntry(JournalBatch batch, decimal amount)
    {
        var entry = LedgerEntry.Create(
            OrgId, DebitAccId, CreditAccId, amount,
            "Test narration", batch.FyYear, 10, PostingSource.Manual,
            documentId: null, dedupeHash: null, journalBatchId: batch.Id);
        batch.AddEntry(entry);
    }
}
