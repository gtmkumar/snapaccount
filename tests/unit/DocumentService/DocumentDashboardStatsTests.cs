// WEB-FIX: Tests for DocumentService GetDashboardStatsQuery — verifies APPROVED is terminal.
//
// Root cause: dashboard was counting APPROVED docs as "pending" (pendingDocuments:4 visible)
// but the queue page (filtered by UPLOADED/IN_REVIEW) showed 0 because APPROVED docs
// don't appear in the review queue. Fix: add APPROVED to TerminalStatuses.
//
// Covers:
//   1.  UPLOADED doc → counted as pending
//   2.  OCR_IN_PROGRESS doc → counted as pending
//   3.  OCR_COMPLETE doc → counted as pending
//   4.  IN_REVIEW doc → counted as pending
//   5.  APPROVED doc → NOT counted as pending (WEB-FIX: was previously counted — bug)
//   6.  PROCESSED doc → NOT counted as pending
//   7.  REJECTED doc → NOT counted as pending
//   8.  ARCHIVED doc → NOT counted as pending
//   9.  Mixed statuses → correct pending count
//  10.  Soft-deleted docs → excluded from count

using DocumentService.Application.Dashboard.Queries.GetDashboardStats;
using DocumentService.Application.Common.Interfaces;
using DocumentService.Domain.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace DocumentService.Tests;

[Trait("Category", "Unit")]
public sealed class DocumentDashboardStatsTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private static IDocumentDbContext CreateInMemoryDb()
    {
        var opts = new DbContextOptionsBuilder<DocumentInMemoryContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new DocumentInMemoryContext(opts);
    }

    /// <summary>Create a minimal Document with an explicit status string.</summary>
    private static Document DocWithStatus(string status)
    {
        var doc = new Document
        {
            UserId = Guid.NewGuid(),
            OrganizationId = Guid.NewGuid(),
            FileName = "test.pdf",
            MimeType = "application/pdf",
            StoragePath = "gs://bucket/test.pdf"
        };
        // Drive status via domain methods to keep test semantics clean.
        switch (status)
        {
            case "OCR_IN_PROGRESS":
                doc.StartOcr();
                break;
            case "OCR_COMPLETE":
            case "IN_REVIEW":
                doc.StartOcr();
                doc.CompleteOcr(100m, "Vendor", DateOnly.FromDateTime(DateTime.UtcNow));
                doc.ClearDomainEvents();
                break;
            case "APPROVED":
                doc.StartOcr();
                doc.CompleteOcr(200m, "Vendor", DateOnly.FromDateTime(DateTime.UtcNow));
                doc.ClearDomainEvents();
                doc.Approve(Guid.NewGuid());
                doc.ClearDomainEvents();
                break;
            case "PROCESSED":
                doc.MarkProcessed();
                doc.ClearDomainEvents();
                break;
            case "REJECTED":
                doc.Reject("test rejection");
                break;
            case "ARCHIVED":
                doc.Archive();
                break;
            // "UPLOADED" — no transition, default status
        }
        return doc;
    }

    // ── Theory: per-status expectation ───────────────────────────────────────

    [Theory]
    [InlineData("UPLOADED",       true)]   // in-flight — pending
    [InlineData("OCR_IN_PROGRESS", true)]  // in-flight — pending
    [InlineData("OCR_COMPLETE",   true)]   // awaiting review — pending
    [InlineData("IN_REVIEW",      true)]   // under review — pending
    [InlineData("APPROVED",       false)]  // WEB-FIX: was counted; accounting event already fired → terminal
    [InlineData("PROCESSED",      false)]  // terminal
    [InlineData("REJECTED",       false)]  // terminal
    [InlineData("ARCHIVED",       false)]  // terminal
    public async Task GetDashboardStats_SingleDoc_CountMatchesExpectation(string status, bool expectPending)
    {
        var db = CreateInMemoryDb();
        ((DocumentInMemoryContext)db).Documents.Add(DocWithStatus(status));
        await ((DocumentInMemoryContext)db).SaveChangesAsync(CancellationToken.None);

        var handler = new GetDashboardStatsQueryHandler(db);

        var result = await handler.Handle(new GetDashboardStatsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.PendingDocuments.Should().Be(expectPending ? 1 : 0,
            $"status={status} should {(expectPending ? "" : "not ")}be counted as pending");
    }

    [Fact]
    public async Task GetDashboardStats_MixedStatuses_LiveScenarioFixed()
    {
        // Live scenario that triggered the bug:
        //   4 APPROVED docs + 0 UPLOADED → dashboard showed pendingDocuments:4, queue showed 0.
        // After fix: pendingDocuments:0 (APPROVED is terminal).
        var db = CreateInMemoryDb();
        var ctx = (DocumentInMemoryContext)db;
        ctx.Documents.AddRange(
            DocWithStatus("APPROVED"),
            DocWithStatus("APPROVED"),
            DocWithStatus("APPROVED"),
            DocWithStatus("APPROVED"),
            DocWithStatus("PROCESSED"),
            DocWithStatus("REJECTED"));
        await ctx.SaveChangesAsync(CancellationToken.None);

        var handler = new GetDashboardStatsQueryHandler(db);

        var result = await handler.Handle(new GetDashboardStatsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.PendingDocuments.Should().Be(0,
            "all docs are in terminal statuses — none should appear as pending");
    }

    [Fact]
    public async Task GetDashboardStats_UploadedPlusApproved_OnlyUploadedCounted()
    {
        var db = CreateInMemoryDb();
        var ctx = (DocumentInMemoryContext)db;
        ctx.Documents.AddRange(
            DocWithStatus("UPLOADED"),
            DocWithStatus("UPLOADED"),
            DocWithStatus("APPROVED"),
            DocWithStatus("APPROVED"),
            DocWithStatus("APPROVED"),
            DocWithStatus("APPROVED"));
        await ctx.SaveChangesAsync(CancellationToken.None);

        var handler = new GetDashboardStatsQueryHandler(db);

        var result = await handler.Handle(new GetDashboardStatsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.PendingDocuments.Should().Be(2, "only UPLOADED are pending");
    }

    [Fact]
    public async Task GetDashboardStats_SoftDeletedDocs_Excluded()
    {
        var db = CreateInMemoryDb();
        var ctx = (DocumentInMemoryContext)db;
        var doc = DocWithStatus("UPLOADED");
        doc.DeletedAt = DateTime.UtcNow;
        ctx.Documents.Add(doc);
        await ctx.SaveChangesAsync(CancellationToken.None);

        var handler = new GetDashboardStatsQueryHandler(db);

        var result = await handler.Handle(new GetDashboardStatsQuery(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.PendingDocuments.Should().Be(0, "soft-deleted docs must be excluded");
    }
}

// ── Minimal in-memory DbContext ───────────────────────────────────────────────

internal sealed class DocumentInMemoryContext(DbContextOptions<DocumentInMemoryContext> options)
    : DbContext(options), IDocumentDbContext
{
    public DbSet<Document> Documents { get; set; } = null!;
    public DbSet<DocumentCategory> DocumentCategories { get; set; } = null!;
    public DbSet<DocumentPage> DocumentPages { get; set; } = null!;
    public DbSet<OcrResult> OcrResults { get; set; } = null!;
    public DbSet<OcrField> OcrFields { get; set; } = null!;
    public DbSet<OcrFeedback> OcrFeedbacks { get; set; } = null!;
    public DbSet<DocumentTag> DocumentTags { get; set; } = null!;
    public DbSet<DocumentShare> DocumentShares { get; set; } = null!;
    public DbSet<DocumentArchive> DocumentArchives { get; set; } = null!;
}
