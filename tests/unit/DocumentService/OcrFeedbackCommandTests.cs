// Unit tests for GAP-014: OCR Feedback write-path (SubmitOcrFeedbackCommand)
// and GAP-015: Document Tag CRUD (AddDocumentTagCommand, RemoveDocumentTagCommand, GetDocumentTagsQuery)
//
// Covers:
//   1.  SubmitOcrFeedback happy path — feedback row created, save called
//   2.  SubmitOcrFeedback IDOR — wrong org returns NotFound
//   3.  SubmitOcrFeedback unauthenticated — returns Unauthorized
//   4.  SubmitOcrFeedback non-existent OCR field — returns NotFound
//   5.  SubmitOcrFeedback validator — OTHER issue type requires notes
//   6.  SubmitOcrFeedback validator — standard issue types pass without notes
//   7.  SubmitOcrFeedback validator — invalid issue type rejected
//   8.  AddDocumentTag happy path — tag persisted
//   9.  AddDocumentTag idempotent — same tag name returns existing without save
//  10.  AddDocumentTag IDOR — wrong org returns NotFound
//  11.  AddDocumentTag unauthenticated — returns Unauthorized
//  12.  RemoveDocumentTag happy path — tag soft-deleted, save called
//  13.  RemoveDocumentTag idempotent — already-deleted tag returns success without re-save
//  14.  RemoveDocumentTag IDOR — wrong org returns NotFound
//  15.  GetDocumentTags happy path — returns only active tags ordered by name
//  16.  GetDocumentTags IDOR — wrong org returns NotFound
//  17.  AddDocumentTag validator — empty name invalid
//  18.  AddDocumentTag validator — invalid characters invalid
//  19.  AddDocumentTag validator — tag name too long invalid

using DocumentService.Application.Common.Interfaces;
using DocumentService.Application.Documents.Commands.AddDocumentTag;
using DocumentService.Application.Documents.Commands.RemoveDocumentTag;
using DocumentService.Application.Documents.Commands.SubmitOcrFeedback;
using DocumentService.Application.Documents.Queries.GetDocumentTags;
using DocumentService.Domain.Entities;
using FluentAssertions;
using Moq;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;
using Xunit;

namespace DocumentService.Tests;

// ────────────────────────────────────────────────────────────────────────────
// Test-local helpers
// ────────────────────────────────────────────────────────────────────────────

file static class OcrFeedbackTestHelpers
{
    /// <summary>
    /// Creates an IDocumentDbContext mock containing a single OCR-complete Document.
    /// </summary>
    public static (Mock<IDocumentDbContext> db, Document doc) WithOcrDoc(
        Guid? orgId = null, Guid? userId = null)
    {
        var doc = new Document
        {
            UserId         = userId ?? Guid.NewGuid(),
            OrganizationId = orgId ?? Guid.NewGuid(),
            FileName       = "invoice.pdf",
            MimeType       = "application/pdf",
            StoragePath    = "documents/invoice.pdf"
        };
        doc.StartOcr();
        doc.CompleteOcr(500m, "Acme Ltd", DateOnly.FromDateTime(DateTime.Today));
        doc.ClearDomainEvents();

        var db = new Mock<IDocumentDbContext>();
        db.Setup(d => d.Documents).Returns(new List<Document> { doc }.BuildAsyncDbSetMock());
        db.Setup(d => d.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);

        return (db, doc);
    }

    /// <summary>
    /// Seeds the OcrFields DbSet with a single field and prepares an empty OcrFeedbacks set.
    /// OcrField has a private ctor; we instantiate via reflection.
    /// </summary>
    public static Guid SeedOcrField(Mock<IDocumentDbContext> db)
    {
        var field   = InstantiatePrivate<OcrField>();
        var fieldId = Guid.NewGuid();
        SetProp(field, "Id", fieldId);
        SetProp(field, "OcrResultId", Guid.NewGuid());
        SetProp(field, "FieldName", "total_amount");

        db.Setup(d => d.OcrFields).Returns(new List<OcrField> { field }.BuildAsyncDbSetMock());
        db.Setup(d => d.OcrFeedbacks).Returns(new List<OcrFeedback>().BuildAsyncDbSetMock());
        db.Setup(d => d.OcrFeedbacks.Add(It.IsAny<OcrFeedback>()));

        return fieldId;
    }

    public static void SeedEmptyOcrFields(Mock<IDocumentDbContext> db)
    {
        db.Setup(d => d.OcrFields).Returns(new List<OcrField>().BuildAsyncDbSetMock());
        db.Setup(d => d.OcrFeedbacks).Returns(new List<OcrFeedback>().BuildAsyncDbSetMock());
        db.Setup(d => d.OcrFeedbacks.Add(It.IsAny<OcrFeedback>()));
    }

    public static DocumentTag MakeTag(Guid documentId, string tagName, bool deleted = false)
    {
        var tag = DocumentTag.Create(documentId, DateTime.UtcNow, tagName, Guid.NewGuid());
        if (deleted)
            tag.DeletedAt = DateTime.UtcNow.AddMinutes(-5);
        return tag;
    }

    private static T InstantiatePrivate<T>() =>
        (T)Activator.CreateInstance(typeof(T), nonPublic: true)!;

    private static void SetProp(object obj, string name, object value)
    {
        // Try public/private property first (handles auto-property backing store)
        var prop = FindMember(obj.GetType(), name);
        if (prop is not null)
        {
            prop.SetValue(obj, value);
            return;
        }
        // Fall back to compiler-generated backing field
        var field = obj.GetType().GetField(
            $"<{name}>k__BackingField",
            System.Reflection.BindingFlags.NonPublic |
            System.Reflection.BindingFlags.Instance |
            System.Reflection.BindingFlags.FlattenHierarchy);
        field?.SetValue(obj, value);
    }

    private static System.Reflection.PropertyInfo? FindMember(Type t, string name)
    {
        for (var type = t; type is not null; type = type.BaseType)
        {
            var prop = type.GetProperty(name,
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic |
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.DeclaredOnly);
            if (prop?.CanWrite == true) return prop;
        }
        return null;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// SubmitOcrFeedbackCommand tests
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class SubmitOcrFeedbackCommandTests
{
    private static readonly Guid OrgId  = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task HappyPath_FeedbackRowCreated_SaveCalled()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        var fieldId   = OcrFeedbackTestHelpers.SeedOcrField(db);

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new SubmitOcrFeedbackCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new SubmitOcrFeedbackCommand(doc.Id, fieldId, "WRONG_VALUE", null),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.FeedbackId.Should().NotBeEmpty();
        db.Verify(d => d.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task WrongOrg_ReturnsNotFound()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        OcrFeedbackTestHelpers.SeedOcrField(db);

        // Use a different org — document ownership check should fail
        var user    = FakeCurrentUser.Make(Guid.NewGuid(), UserId);
        var handler = new SubmitOcrFeedbackCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new SubmitOcrFeedbackCommand(doc.Id, Guid.NewGuid(), "WRONG_VALUE", null),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task Unauthenticated_ReturnsUnauthorized()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        OcrFeedbackTestHelpers.SeedEmptyOcrFields(db);

        var user    = FakeCurrentUser.Unauthenticated();
        var handler = new SubmitOcrFeedbackCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new SubmitOcrFeedbackCommand(doc.Id, Guid.NewGuid(), "WRONG_VALUE", null),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Unauthorized);
    }

    [Fact]
    public async Task NonExistentField_ReturnsOcrFieldNotFound()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        OcrFeedbackTestHelpers.SeedEmptyOcrFields(db); // no fields at all

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new SubmitOcrFeedbackCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new SubmitOcrFeedbackCommand(doc.Id, Guid.NewGuid(), "WRONG_VALUE", null),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("OcrField.NotFound");
    }

    [Fact]
    public void Validator_OtherIssueType_RequiresNotes()
    {
        var v      = new SubmitOcrFeedbackCommandValidator();
        var result = v.Validate(
            new SubmitOcrFeedbackCommand(Guid.NewGuid(), Guid.NewGuid(), "OTHER", null));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Notes");
    }

    [Theory]
    [InlineData("WRONG_VALUE")]
    [InlineData("MISSING_FIELD")]
    [InlineData("WRONG_FIELD")]
    [InlineData("ILLEGIBLE")]
    [InlineData("FORMATTING_ERROR")]
    public void Validator_StandardIssueTypes_PassWithoutNotes(string issueType)
    {
        var v      = new SubmitOcrFeedbackCommandValidator();
        var result = v.Validate(
            new SubmitOcrFeedbackCommand(Guid.NewGuid(), Guid.NewGuid(), issueType, null));

        result.Errors.Should().NotContain(e => e.PropertyName == "IssueType");
    }

    [Fact]
    public void Validator_InvalidIssueType_Fails()
    {
        var v      = new SubmitOcrFeedbackCommandValidator();
        var result = v.Validate(
            new SubmitOcrFeedbackCommand(Guid.NewGuid(), Guid.NewGuid(), "TYPO_BAD", null));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "IssueType");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// AddDocumentTag tests
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class AddDocumentTagCommandTests
{
    private static readonly Guid OrgId  = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task HappyPath_TagPersisted_SaveCalled()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag>().BuildAsyncDbSetMock());
        db.Setup(d => d.DocumentTags.Add(It.IsAny<DocumentTag>()));

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new AddDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new AddDocumentTagCommand(doc.Id, "gst-invoice"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TagName.Should().Be("gst-invoice");
        result.Value.DocumentId.Should().Be(doc.Id);
        db.Verify(d => d.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SameTagTwice_IsIdempotent_NoExtraSave_ReturnsSameTagId()
    {
        // BUG-W6-004: Re-adding the same tag must return the *existing* tagId and
        // set IsNewlyCreated=false so the endpoint emits HTTP 200 (not 201).
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        var existing  = OcrFeedbackTestHelpers.MakeTag(doc.Id, "gst-invoice");

        // Pre-seed the DB with the existing tag
        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag> { existing }.BuildAsyncDbSetMock());
        db.Setup(d => d.DocumentTags.Add(It.IsAny<DocumentTag>()));

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new AddDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new AddDocumentTagCommand(doc.Id, "gst-invoice"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue("idempotent path must succeed");
        result.Value.TagId.Should().Be(existing.Id, "existing tagId must be returned on re-add");
        result.Value.IsNewlyCreated.Should().BeFalse("idempotent path: IsNewlyCreated must be false so endpoint returns 200");
        // No new save — the handler returns early with the existing row
        db.Verify(d => d.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task NewTag_HappyPath_IsNewlyCreatedTrue()
    {
        // BUG-W6-004: A genuinely new tag must have IsNewlyCreated=true so the endpoint returns 201.
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag>().BuildAsyncDbSetMock());
        db.Setup(d => d.DocumentTags.Add(It.IsAny<DocumentTag>()));

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new AddDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new AddDocumentTagCommand(doc.Id, "new-tag"),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.IsNewlyCreated.Should().BeTrue("a newly inserted tag must have IsNewlyCreated=true");
        db.Verify(d => d.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task WrongOrg_ReturnsNotFound()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag>().BuildAsyncDbSetMock());

        var user    = FakeCurrentUser.Make(Guid.NewGuid(), UserId);
        var handler = new AddDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new AddDocumentTagCommand(doc.Id, "gst-invoice"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task Unauthenticated_ReturnsUnauthorized()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag>().BuildAsyncDbSetMock());

        var user    = FakeCurrentUser.Unauthenticated();
        var handler = new AddDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new AddDocumentTagCommand(doc.Id, "gst-invoice"),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Unauthorized);
    }

    [Fact]
    public void Validator_EmptyTagName_IsInvalid()
    {
        var v = new AddDocumentTagCommandValidator();
        v.Validate(new AddDocumentTagCommand(Guid.NewGuid(), ""))
         .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validator_InvalidCharacters_IsInvalid()
    {
        var v = new AddDocumentTagCommandValidator();
        v.Validate(new AddDocumentTagCommand(Guid.NewGuid(), "tag<script>alert(1)"))
         .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validator_TooLong_IsInvalid()
    {
        var v = new AddDocumentTagCommandValidator();
        v.Validate(new AddDocumentTagCommand(Guid.NewGuid(), new string('a', 65)))
         .IsValid.Should().BeFalse();
    }
}

// ────────────────────────────────────────────────────────────────────────────
// RemoveDocumentTag tests
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class RemoveDocumentTagCommandTests
{
    private static readonly Guid OrgId  = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task HappyPath_TagSoftDeleted_SaveCalled()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        var tag       = OcrFeedbackTestHelpers.MakeTag(doc.Id, "gst-invoice");

        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag> { tag }.BuildAsyncDbSetMock());

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new RemoveDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new RemoveDocumentTagCommand(doc.Id, tag.Id),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        tag.DeletedAt.Should().NotBeNull("tag must be soft-deleted");
        db.Verify(d => d.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AlreadyDeleted_IsIdempotent_NoExtraSave()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        var tag       = OcrFeedbackTestHelpers.MakeTag(doc.Id, "gst-invoice", deleted: true);

        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag> { tag }.BuildAsyncDbSetMock());

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new RemoveDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new RemoveDocumentTagCommand(doc.Id, tag.Id),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue("should be idempotent");
        db.Verify(d => d.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task WrongOrg_ReturnsNotFound()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        var tag       = OcrFeedbackTestHelpers.MakeTag(doc.Id, "gst-invoice");

        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag> { tag }.BuildAsyncDbSetMock());

        var user    = FakeCurrentUser.Make(Guid.NewGuid(), UserId);
        var handler = new RemoveDocumentTagCommandHandler(db.Object, user);

        var result = await handler.Handle(
            new RemoveDocumentTagCommand(doc.Id, tag.Id),
            CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// GetDocumentTags query tests
// ────────────────────────────────────────────────────────────────────────────

[Trait("Category", "Unit")]
public sealed class GetDocumentTagsQueryTests
{
    private static readonly Guid OrgId  = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task HappyPath_ReturnsOnlyActiveTagsOrderedByName()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        var tag1      = OcrFeedbackTestHelpers.MakeTag(doc.Id, "fy-2026");
        var tag2      = OcrFeedbackTestHelpers.MakeTag(doc.Id, "gst-invoice");
        var delTag    = OcrFeedbackTestHelpers.MakeTag(doc.Id, "old", deleted: true);

        db.Setup(d => d.DocumentTags).Returns(
            new List<DocumentTag> { tag2, tag1, delTag }.BuildAsyncDbSetMock());

        var user    = FakeCurrentUser.Make(OrgId, UserId);
        var handler = new GetDocumentTagsQueryHandler(db.Object, user);

        var result = await handler.Handle(new GetDocumentTagsQuery(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2, "deleted tag must be excluded");
        result.Value.Select(t => t.TagName).Should().ContainInOrder("fy-2026", "gst-invoice");
    }

    [Fact]
    public async Task WrongOrg_ReturnsNotFound()
    {
        var (db, doc) = OcrFeedbackTestHelpers.WithOcrDoc(OrgId, UserId);
        db.Setup(d => d.DocumentTags).Returns(new List<DocumentTag>().BuildAsyncDbSetMock());

        var user    = FakeCurrentUser.Make(Guid.NewGuid(), UserId);
        var handler = new GetDocumentTagsQueryHandler(db.Object, user);

        var result = await handler.Handle(new GetDocumentTagsQuery(doc.Id), CancellationToken.None);

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}
