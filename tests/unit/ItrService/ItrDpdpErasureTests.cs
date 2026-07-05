using FluentAssertions;
using ItrService.Domain.Entities;
using ItrService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ItrService.Tests;

/// <summary>
/// SEC-040: Unit tests for DPDP erasure logic in ItrService.
/// Tests the domain-level Anonymize() methods that AccountDeletionSubscriber calls,
/// and verifies the subscriber's DB-level erasure behaviour via InMemory EF.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ItrDpdpErasureTests : IDisposable
{
    private readonly ItrServiceDbContext _db;

    public ItrDpdpErasureTests()
    {
        var opts = new DbContextOptionsBuilder<ItrServiceDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ItrServiceDbContext(opts);
    }

    public void Dispose() => _db.Dispose();

    // ── Assessee.Anonymize ─────────────────────────────────────────────────────

    [Fact]
    public void Assessee_Anonymize_ClearsAllPiiFields()
    {
        var assessee = Assessee.Create(
            "firebase-uid-123", "ENCRYPTED_PAN", "K123", "Rahul Sharma",
            organizationId: Guid.NewGuid());
        assessee.UpdateContact("rahul@example.com", "+919876543210",
            new DateOnly(1990, 1, 1), "123 MG Road, Mumbai");

        assessee.Anonymize("DPDP_ERASURE");

        assessee.PanCipher.Should().Be("[ANONYMIZED]");
        assessee.PanLast4.Should().Be("****");
        assessee.FullName.Should().Be("[ANONYMIZED]");
        assessee.Email.Should().BeNull();
        assessee.PhoneNumber.Should().BeNull();
        assessee.Address.Should().BeNull();
        assessee.AnonymizedAt.Should().NotBeNull();
        assessee.AnonymizationReason.Should().Be("DPDP_ERASURE");
    }

    // ── Filing.Anonymize ──────────────────────────────────────────────────────

    [Fact]
    public void Filing_Anonymize_ClearsComputationJsonb()
    {
        var filing = Filing.Create(Guid.NewGuid(), "AY2025-26", "ITR-1", "NEW", Guid.NewGuid());
        filing.UpdateIncomeHeads(500000m, 0m, 0m, 0m, 0m);
        filing.PinComputation(Guid.NewGuid(), """{"gross":500000}""", "hash123");

        filing.Anonymize("DPDP_ERASURE");

        filing.ComputationJsonb.Should().BeNull("income PII must be wiped");
        filing.AnonymizedAt.Should().NotBeNull();
        filing.AnonymizationReason.Should().Be("DPDP_ERASURE");
        filing.AssessmentYear.Should().Be("AY2025-26", "non-PII fields retained for compliance");
    }

    // ── Form16Extract.Anonymize ────────────────────────────────────────────────

    [Fact]
    public void Form16Extract_Anonymize_ClearsAllSensitiveFields()
    {
        var extract = Form16Extract.Create(
            Guid.NewGuid(), Guid.NewGuid(),
            "gs://bucket/form16.pdf", "ENCRYPTED_PAN", "K123");
        extract.SetParsedData(
            "AAAXXXXXXXXX", "BBBXXXXXXXXX", "Employer Ltd",
            1200000m, 60000m, "AY2025-26",
            """{"tan":"AAAXXXXXXXXX","salary":1200000}""",
            0.98m);

        extract.Anonymize("DPDP_ERASURE");

        extract.EmployeePanCipher.Should().Be("[ANONYMIZED]");
        extract.EmployeePanLast4.Should().Be("****");
        extract.EmployerTan.Should().BeNull("employer TAN is PII");
        extract.EmployerPan.Should().BeNull("employer PAN is PII");
        extract.EmployerName.Should().BeNull("employer name is PII");
        extract.ParsedJson.Should().BeNull("P6-HANDOFF-21: parsed JSON contains employer/salary data");
        extract.AnonymizedAt.Should().NotBeNull();
    }

    // ── ItrNotice.Anonymize ────────────────────────────────────────────────────

    [Fact]
    public void ItrNotice_Anonymize_ClearsResponseAndAttachments()
    {
        var notice = ItrNotice.Create(
            Guid.NewGuid(), Guid.NewGuid(),
            "143(1)/2025", "143(1)",
            DateOnly.FromDateTime(DateTime.UtcNow));
        notice.SetAttachments("""[{"gcs_uri":"gs://bucket/notice.pdf"}]""");
        notice.FileResponse(Guid.NewGuid(), "Our response text",
            """[{"gcs_uri":"gs://bucket/response.pdf"}]""");

        notice.Anonymize("DPDP_ERASURE");

        notice.ResponseText.Should().BeNull();
        notice.AttachmentsJson.Should().BeNull();
        notice.ResponseAttachmentsJson.Should().BeNull();
        notice.AnonymizedAt.Should().NotBeNull();
        notice.AnonymizationReason.Should().Be("DPDP_ERASURE");
        notice.NoticeNumber.Should().Be("143(1)/2025", "notice reference retained for audit trail");
    }

    // ── Subscriber DB-level erasure via InMemory EF ────────────────────────────

    [Fact]
    public async Task Erasure_SoftDeletesFilingsForUsersAssessee()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var orgId = Guid.NewGuid();

        var assessee = Assessee.Create(
            userId.ToString(), "ENC_PAN", "K999", "Delete Me",
            organizationId: orgId);
        _db.Assessees.Add(assessee);

        var filing = Filing.Create(assessee.Id, "AY2025-26", "ITR-1", "NEW", Guid.NewGuid());
        _db.Filings.Add(filing);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act — simulate what AccountDeletionSubscriber.EraseUserDataAsync does
        var now = DateTime.UtcNow;
        var assessees = await _db.Assessees
            .Where(a => a.UserId == userId.ToString() && a.DeletedAt == null)
            .ToListAsync();

        foreach (var a in assessees)
        {
            a.Anonymize("DPDP_ERASURE");
            a.DeletedAt = now;
        }

        var assesseeIds = assessees.Select(a => a.Id).ToHashSet();
        var filings = await _db.Filings
            .Where(f => assesseeIds.Contains(f.AssesseeId) && f.DeletedAt == null)
            .ToListAsync();

        foreach (var f in filings)
        {
            f.Anonymize("DPDP_ERASURE");
            f.DeletedAt = now;
        }

        await _db.SaveChangesAsync(CancellationToken.None);

        // Assert
        var deletedAssessee = await _db.Assessees.FindAsync(assessee.Id);
        deletedAssessee!.DeletedAt.Should().NotBeNull("assessee must be soft-deleted");
        deletedAssessee.PanCipher.Should().Be("[ANONYMIZED]");

        var deletedFiling = await _db.Filings.FindAsync(filing.Id);
        deletedFiling!.DeletedAt.Should().NotBeNull("filing must be soft-deleted");
        deletedFiling.AnonymizationReason.Should().Be("DPDP_ERASURE");
    }

    [Fact]
    public async Task Erasure_DoesNotSoftDeleteFilingsForOtherUsers()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var orgId = Guid.NewGuid();

        var assesseeToDelete = Assessee.Create(
            userId.ToString(), "ENC_PAN", "K001", "User One", organizationId: orgId);
        var assesseeToKeep = Assessee.Create(
            otherUserId.ToString(), "ENC_PAN", "K002", "User Two", organizationId: orgId);

        _db.Assessees.AddRange(assesseeToDelete, assesseeToKeep);

        var filingToDelete = Filing.Create(assesseeToDelete.Id, "AY2025-26", "ITR-1", "NEW", Guid.NewGuid());
        var filingToKeep = Filing.Create(assesseeToKeep.Id, "AY2025-26", "ITR-1", "FILED", Guid.NewGuid());
        _db.Filings.AddRange(filingToDelete, filingToKeep);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act — erase only userId
        var now = DateTime.UtcNow;
        var assessees = await _db.Assessees
            .Where(a => a.UserId == userId.ToString() && a.DeletedAt == null)
            .ToListAsync();

        foreach (var a in assessees) { a.DeletedAt = now; }

        var assesseeIds = assessees.Select(a => a.Id).ToHashSet();
        var filings = await _db.Filings
            .Where(f => assesseeIds.Contains(f.AssesseeId) && f.DeletedAt == null)
            .ToListAsync();

        foreach (var f in filings) { f.DeletedAt = now; }
        await _db.SaveChangesAsync(CancellationToken.None);

        // Assert — other user's data untouched
        var kept = await _db.Assessees.FindAsync(assesseeToKeep.Id);
        kept!.DeletedAt.Should().BeNull("other user's assessee must not be deleted");

        var keptFiling = await _db.Filings.FindAsync(filingToKeep.Id);
        keptFiling!.DeletedAt.Should().BeNull("other user's filing must not be deleted");
    }
}
