// Unit tests for the document review-decision + archive endpoints (Task B15/NEW-D03).
//
// Covers:
//   1.  ApproveDocument happy path — status APPROVED, event publisher called
//   2.  ApproveDocument idempotent — already APPROVED returns success without re-emit
//   3.  ApproveDocument invalid transition — UPLOADED status returns validation failure
//   4.  ApproveDocument IDOR — wrong org returns NotFound
//   5.  ApproveDocument unauthenticated — returns Unauthorized
//   6.  RejectDocument happy path — status REJECTED, reason persisted
//   7.  RejectDocument idempotent — already REJECTED returns success
//   8.  RejectDocument terminal guard — ARCHIVED/APPROVED cannot be rejected
//   9.  RejectDocument IDOR — wrong org returns NotFound
//  10.  RequestClarification happy path — status unchanged, save called
//  11.  RequestClarification IDOR — wrong org returns NotFound
//  12.  RequestClarification unauthenticated — returns Unauthorized
//  13.  Validator rejects missing reason / message
//  14.  Document.Approve domain method — sets correct state
//  15.  Document.Approve raises DocumentApprovedEvent
//  16.  Document.Approve from terminal status throws
//  17.  Document.Reject stores reason

using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Commands.ApproveDocument;
using DocumentService.Application.Documents.Commands.RejectDocument;
using DocumentService.Application.Documents.Commands.RequestClarification;
using DocumentService.Application.Documents.Interfaces;
using DocumentService.Domain.Entities;
using FluentAssertions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace DocumentService.Tests;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

file static class FakeCurrentUser
{
    public static ICurrentUser Make(Guid? orgId = null, Guid? userId = null)
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.IsAuthenticated).Returns(true);
        mock.Setup(u => u.UserId).Returns(userId ?? Guid.NewGuid());
        mock.Setup(u => u.OrganizationId).Returns(orgId ?? Guid.NewGuid());
        mock.Setup(u => u.HasPermission(It.IsAny<string>())).Returns(true);
        mock.Setup(u => u.Permissions).Returns(["document.review", "document.archive"]);
        mock.Setup(u => u.Roles).Returns([]);
        return mock.Object;
    }

    public static ICurrentUser Unauthenticated()
    {
        var mock = new Mock<ICurrentUser>();
        mock.Setup(u => u.IsAuthenticated).Returns(false);
        mock.Setup(u => u.OrganizationId).Returns((Guid?)null);
        return mock.Object;
    }
}

/// <summary>
/// Builds Document entities by driving them through domain methods to reach the desired status.
/// We use the EF-queryable mock via Moq's setup of <see cref="IDocumentDbContext"/> returning a
/// list-backed async queryable, sidestepping EF Core in-memory for cleaner unit tests.
/// </summary>
file static class FakeDocumentDb
{
    /// <summary>
    /// Returns a (mock db, document) pair where <c>db.Documents</c> yields <c>document</c>.
    /// Uses a simple <c>Task&lt;TEntity?&gt;</c> interception via
    /// <see cref="EntityFrameworkCoreAsyncFakes"/> so <c>FirstOrDefaultAsync</c> resolves correctly.
    /// </summary>
    public static (Mock<IDocumentDbContext> dbMock, Document document) WithDocument(
        string status, Guid? orgId = null, Guid? userId = null)
    {
        var doc = BuildDocument(status, orgId, userId);
        return CreateMock(doc);
    }

    private static (Mock<IDocumentDbContext> dbMock, Document document) CreateMock(Document doc)
    {
        var dbMock = new Mock<IDocumentDbContext>();

        // AsyncQueryable backed by an in-memory list — avoids custom IAsyncQueryProvider.
        var docs = new List<Document> { doc };
        dbMock.Setup(db => db.Documents)
              .Returns(docs.BuildAsyncDbSetMock());
        dbMock.Setup(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()))
              .ReturnsAsync(1);

        // Mock OcrResults as empty list — ApproveDocumentCommandHandler queries this
        // to populate the OcrText field in the Pub/Sub event payload.
        // Empty list means null OcrText (no OCR result available), which is valid.
        var ocrResults = new List<DocumentService.Domain.Entities.OcrResult>();
        dbMock.Setup(db => db.OcrResults)
              .Returns(ocrResults.BuildAsyncDbSetMock());

        return (dbMock, doc);
    }

    private static Document BuildDocument(string status, Guid? orgId, Guid? userId)
    {
        var doc = new Document
        {
            UserId = userId ?? Guid.NewGuid(),
            OrganizationId = orgId,
            FileName = "invoice.pdf",
            MimeType = "application/pdf",
            StoragePath = "documents/invoice.pdf"
        };

        switch (status)
        {
            case "OCR_COMPLETE":
            case "IN_REVIEW":
                doc.StartOcr();
                doc.CompleteOcr(1000m, "Acme Ltd", DateOnly.FromDateTime(DateTime.UtcNow));
                doc.ClearDomainEvents();
                break;
            case "REJECTED":
                doc.Reject("Prior rejection");
                break;
            case "ARCHIVED":
                doc.Archive();
                break;
            case "APPROVED":
                doc.StartOcr();
                doc.CompleteOcr(200m, "Gamma Inc", DateOnly.FromDateTime(DateTime.UtcNow));
                doc.ClearDomainEvents();
                doc.Approve(Guid.NewGuid());
                doc.ClearDomainEvents();
                break;
            // UPLOADED: no transition needed
        }

        return doc;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Async DbSet mock helpers (list-backed, no custom IAsyncQueryProvider reflection)
// ────────────────────────────────────────────────────────────────────────────

file static class MockDbSetExtensions
{
    /// <summary>
    /// Builds a Moq <see cref="Microsoft.EntityFrameworkCore.DbSet{T}"/> from a list.
    /// Supports LINQ + async operations (FirstOrDefaultAsync, etc.) via
    /// <c>InMemoryAsyncEnumerable</c> which does NOT require reflection over
    /// <c>IQueryProvider.Execute</c>.
    /// </summary>
    public static Microsoft.EntityFrameworkCore.DbSet<T> BuildAsyncDbSetMock<T>(
        this List<T> source) where T : class
    {
        var queryable = source.AsQueryable();
        var mock = new Mock<Microsoft.EntityFrameworkCore.DbSet<T>>();

        mock.As<IAsyncEnumerable<T>>()
            .Setup(m => m.GetAsyncEnumerator(It.IsAny<CancellationToken>()))
            .Returns(new InMemoryAsyncEnumerator<T>(source.GetEnumerator()));

        mock.As<IQueryable<T>>()
            .Setup(m => m.Provider)
            .Returns(new InMemoryAsyncQueryProvider<T>(queryable.Provider));

        mock.As<IQueryable<T>>()
            .Setup(m => m.Expression).Returns(queryable.Expression);
        mock.As<IQueryable<T>>()
            .Setup(m => m.ElementType).Returns(queryable.ElementType);
        mock.As<IQueryable<T>>()
            .Setup(m => m.GetEnumerator()).Returns(queryable.GetEnumerator());

        return mock.Object;
    }
}

/// <summary>Wraps a synchronous <see cref="IQueryProvider"/> so EF Core's async overloads work.</summary>
file sealed class InMemoryAsyncQueryProvider<T>(IQueryProvider inner)
    : Microsoft.EntityFrameworkCore.Query.IAsyncQueryProvider
{
    public IQueryable CreateQuery(System.Linq.Expressions.Expression expression)
        => inner.CreateQuery(expression);

    public IQueryable<TElement> CreateQuery<TElement>(System.Linq.Expressions.Expression expression)
        => inner.CreateQuery<TElement>(expression);

    public object? Execute(System.Linq.Expressions.Expression expression)
        => inner.Execute(expression);

    public TResult Execute<TResult>(System.Linq.Expressions.Expression expression)
        => inner.Execute<TResult>(expression);

    public TResult ExecuteAsync<TResult>(
        System.Linq.Expressions.Expression expression,
        CancellationToken cancellationToken = default)
    {
        // TResult is Task<TEntity> — unwrap the generic argument and call Execute<TEntity>.
        var elementType = typeof(TResult).GetGenericArguments()[0];

        // Call the strongly-typed Execute<TElement> via dynamic dispatch (avoids reflection ambiguity).
        dynamic syncResult = Execute<object>(expression)!;
        // Wrap in Task.
        return (TResult)(object)Task.FromResult((dynamic)syncResult);
    }
}

/// <summary>Async enumerator backed by a synchronous <see cref="IEnumerator{T}"/>.</summary>
file sealed class InMemoryAsyncEnumerator<T>(IEnumerator<T> inner) : IAsyncEnumerator<T>
{
    public T Current => inner.Current;
    public ValueTask<bool> MoveNextAsync() => ValueTask.FromResult(inner.MoveNext());
    public ValueTask DisposeAsync() { inner.Dispose(); return ValueTask.CompletedTask; }
}

// ────────────────────────────────────────────────────────────────────────────
// Tests: ApproveDocumentCommand
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class ApproveDocumentCommandTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private static (ApproveDocumentCommandHandler handler, Mock<IDocumentEventPublisher> publisherMock)
        BuildHandler(IDocumentDbContext db, ICurrentUser user)
    {
        var publisherMock = new Mock<IDocumentEventPublisher>();
        publisherMock
            .Setup(p => p.PublishOcrCompletedAsync(
                It.IsAny<Document>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        var handler = new ApproveDocumentCommandHandler(db, user, publisherMock.Object);
        return (handler, publisherMock);
    }

    [Fact]
    public async Task Approve_OcrComplete_Succeeds_AndPublishesEvent()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("OCR_COMPLETE", OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var (handler, publisherMock) = BuildHandler(dbMock.Object, user);

        var result = await handler.Handle(new ApproveDocumentCommand(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        doc.Status.Should().Be("APPROVED");
        doc.ApprovedBy.Should().Be(UserId);
        doc.ApprovedAt.Should().NotBeNull();
        publisherMock.Verify(
            p => p.PublishOcrCompletedAsync(doc, It.IsAny<string?>(), It.IsAny<CancellationToken>()),
            Times.Once);
        dbMock.Verify(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Approve_InReview_Succeeds()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("IN_REVIEW", OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var (handler, _) = BuildHandler(dbMock.Object, user);

        var result = await handler.Handle(new ApproveDocumentCommand(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        doc.Status.Should().Be("APPROVED");
    }

    [Fact]
    public async Task Approve_AlreadyApproved_IsIdempotent_NoReemit()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("APPROVED", OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var (handler, publisherMock) = BuildHandler(dbMock.Object, user);

        var result = await handler.Handle(new ApproveDocumentCommand(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        publisherMock.Verify(
            p => p.PublishOcrCompletedAsync(It.IsAny<Document>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()),
            Times.Never);
        dbMock.Verify(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Approve_FromUploadedStatus_ReturnsValidationError()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("UPLOADED", OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var (handler, _) = BuildHandler(dbMock.Object, user);

        var result = await handler.Handle(new ApproveDocumentCommand(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Document.InvalidTransition");
    }

    [Fact]
    public async Task Approve_WrongOrg_ReturnsNotFound()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("OCR_COMPLETE", OrgId, UserId);
        var user = FakeCurrentUser.Make(Guid.NewGuid(), UserId); // caller is in a different org
        var (handler, _) = BuildHandler(dbMock.Object, user);

        var result = await handler.Handle(new ApproveDocumentCommand(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task Approve_Unauthenticated_ReturnsUnauthorized()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("OCR_COMPLETE", OrgId, UserId);
        var user = FakeCurrentUser.Unauthenticated();
        var (handler, _) = BuildHandler(dbMock.Object, user);

        var result = await handler.Handle(new ApproveDocumentCommand(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Unauthorized);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Tests: RejectDocumentCommand
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class RejectDocumentCommandTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Reject_OcrComplete_Succeeds_ReasonPersisted()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("OCR_COMPLETE", OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new RejectDocumentCommandHandler(dbMock.Object, user);

        var result = await handler.Handle(
            new RejectDocumentCommand(doc.Id, "Invoice amount mismatch"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        doc.Status.Should().Be("REJECTED");
        doc.RejectionReason.Should().Be("Invoice amount mismatch");
        dbMock.Verify(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Reject_AlreadyRejected_IsIdempotent()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("REJECTED", OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new RejectDocumentCommandHandler(dbMock.Object, user);

        var result = await handler.Handle(
            new RejectDocumentCommand(doc.Id, "Reason"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        dbMock.Verify(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("APPROVED")]
    [InlineData("ARCHIVED")]
    public async Task Reject_TerminalStatus_ReturnsValidationError(string terminalStatus)
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument(terminalStatus, OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new RejectDocumentCommandHandler(dbMock.Object, user);

        var result = await handler.Handle(
            new RejectDocumentCommand(doc.Id, "Terminal"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Document.InvalidTransition");
    }

    [Fact]
    public async Task Reject_WrongOrg_ReturnsNotFound()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("OCR_COMPLETE", OrgId, UserId);
        var user = FakeCurrentUser.Make(Guid.NewGuid(), UserId);
        var handler = new RejectDocumentCommandHandler(dbMock.Object, user);

        var result = await handler.Handle(
            new RejectDocumentCommand(doc.Id, "Wrong org"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Tests: RequestClarificationCommand
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class RequestClarificationCommandTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task RequestClarification_OcrComplete_StatusUnchanged_SaveCalled()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("OCR_COMPLETE", OrgId, UserId);
        var user = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new RequestClarificationCommandHandler(dbMock.Object, user);

        var result = await handler.Handle(
            new RequestClarificationCommand(doc.Id, "Please reupload a clearer image."),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        doc.Status.Should().Be("OCR_COMPLETE", "clarification request does not change document status");
        dbMock.Verify(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RequestClarification_WrongOrg_ReturnsNotFound()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("OCR_COMPLETE", OrgId, UserId);
        var user = FakeCurrentUser.Make(Guid.NewGuid(), UserId);
        var handler = new RequestClarificationCommandHandler(dbMock.Object, user);

        var result = await handler.Handle(
            new RequestClarificationCommand(doc.Id, "Message"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task RequestClarification_Unauthenticated_ReturnsUnauthorized()
    {
        var (dbMock, doc) = FakeDocumentDb.WithDocument("UPLOADED", OrgId, UserId);
        var user = FakeCurrentUser.Unauthenticated();
        var handler = new RequestClarificationCommandHandler(dbMock.Object, user);

        var result = await handler.Handle(
            new RequestClarificationCommand(doc.Id, "Message"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Unauthorized);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Tests: FluentValidation validators
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class DocumentReviewValidatorTests
{
    [Fact]
    public void RejectValidator_EmptyReason_IsInvalid()
    {
        var validator = new RejectDocumentCommandValidator();
        var result = validator.Validate(new RejectDocumentCommand(Guid.NewGuid(), ""));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Reason");
    }

    [Fact]
    public void RejectValidator_TooLongReason_IsInvalid()
    {
        var validator = new RejectDocumentCommandValidator();
        var result = validator.Validate(
            new RejectDocumentCommand(Guid.NewGuid(), new string('A', 2001)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void RejectValidator_ValidReason_IsValid()
    {
        var validator = new RejectDocumentCommandValidator();
        var result = validator.Validate(
            new RejectDocumentCommand(Guid.NewGuid(), "Invoice data is incomplete."));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ClarificationValidator_EmptyMessage_IsInvalid()
    {
        var validator = new RequestClarificationCommandValidator();
        var result = validator.Validate(new RequestClarificationCommand(Guid.NewGuid(), ""));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Message");
    }

    [Fact]
    public void ClarificationValidator_ValidMessage_IsValid()
    {
        var validator = new RequestClarificationCommandValidator();
        var result = validator.Validate(
            new RequestClarificationCommand(Guid.NewGuid(), "Please provide GST number."));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ApproveValidator_EmptyDocumentId_IsInvalid()
    {
        var validator = new ApproveDocumentCommandValidator();
        var result = validator.Validate(new ApproveDocumentCommand(Guid.Empty));
        result.IsValid.Should().BeFalse();
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Tests: Document domain entity state machine
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class DocumentDomainStateMachineTests
{
    private static Document MakeDocument()
        => new()
        {
            UserId = Guid.NewGuid(),
            OrganizationId = Guid.NewGuid(),
            FileName = "test.pdf",
            MimeType = "application/pdf",
            StoragePath = "documents/test.pdf"
        };

    [Fact]
    public void Approve_FromOcrComplete_SetsApprovedStatusAndApprovedBy()
    {
        var doc = MakeDocument();
        var approver = Guid.NewGuid();

        doc.StartOcr();
        doc.CompleteOcr(500m, "Vendor", DateOnly.FromDateTime(DateTime.UtcNow));
        doc.ClearDomainEvents();

        doc.Approve(approver);

        doc.Status.Should().Be("APPROVED");
        doc.ApprovedBy.Should().Be(approver);
        doc.ApprovedAt.Should().NotBeNull();
        doc.ApprovedAt!.Value.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Approve_RaisesDocumentApprovedEvent()
    {
        var doc = MakeDocument();
        doc.StartOcr();
        doc.CompleteOcr(100m, "Vendor", DateOnly.FromDateTime(DateTime.UtcNow));
        doc.ClearDomainEvents();

        doc.Approve(Guid.NewGuid());

        doc.DomainEvents.Should().ContainSingle(e =>
            e.GetType().Name == "DocumentApprovedEvent");
    }

    [Fact]
    public void Approve_FromUploadedStatus_ThrowsInvalidOperationException()
    {
        var doc = MakeDocument();

        var act = () => doc.Approve(Guid.NewGuid());

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*cannot be approved from status*");
    }

    [Fact]
    public void Approve_FromArchivedStatus_ThrowsInvalidOperationException()
    {
        var doc = MakeDocument();
        doc.Archive();

        var act = () => doc.Approve(Guid.NewGuid());

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Reject_SetsStatusAndReason()
    {
        var doc = MakeDocument();
        doc.StartOcr();
        doc.CompleteOcr(null, null, null);
        doc.ClearDomainEvents();

        doc.Reject("Blurry image");

        doc.Status.Should().Be("REJECTED");
        doc.RejectionReason.Should().Be("Blurry image");
    }
}
