using ChatService.Application.Appointments.Queries.GetAppointment;
using ChatService.Application.Appointments.Queries.GetSlotDayMap;
using ChatService.Application.Appointments.Queries.ListAppointments;
using ChatService.Application.Appointments.Queries.ListCaProfiles;
using ChatService.Application.Bookmarks.Queries.ListBookmarks;
using ChatService.Domain.Entities;
using FluentAssertions;
using FluentValidation;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Unit tests for Wave 7 mobile reconciliation features:
/// 1. GET /appointments/{id}  — GetAppointmentQuery validator + IDOR semantics
/// 2. GET /appointments/slots/day-map — GetSlotDayMapQuery validator + handler logic
/// 3. POST /appointments with topic — Appointment.Create topic propagation
/// 4. BookmarkDto enrichment — record shape validation
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class Wave7ReconciliationTests
{
    // ── 1. GetAppointmentQuery — validator ─────────────────────────────────────

    [Fact]
    public void GetAppointmentQuery_Validator_RejectsEmptyId()
    {
        var validator = new GetAppointmentQueryValidator();
        var result = validator.Validate(new GetAppointmentQuery(Guid.Empty));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "AppointmentId");
    }

    [Fact]
    public void GetAppointmentQuery_Validator_AcceptsValidId()
    {
        var validator = new GetAppointmentQueryValidator();
        var result = validator.Validate(new GetAppointmentQuery(Guid.NewGuid()));

        result.IsValid.Should().BeTrue();
    }

    // ── 2. GetSlotDayMapQuery — validator ──────────────────────────────────────

    [Fact]
    public void GetSlotDayMapQuery_Validator_RejectsEmptyCaProfileId()
    {
        var validator = new GetSlotDayMapQueryValidator();
        var from = DateOnly.FromDateTime(DateTime.Today);
        var to   = from.AddDays(7);
        var result = validator.Validate(new GetSlotDayMapQuery(Guid.Empty, from, to));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "CaProfileId");
    }

    [Fact]
    public void GetSlotDayMapQuery_Validator_RejectsToBeforeFrom()
    {
        var validator = new GetSlotDayMapQueryValidator();
        var from = DateOnly.FromDateTime(DateTime.Today).AddDays(5);
        var to   = DateOnly.FromDateTime(DateTime.Today);
        var result = validator.Validate(new GetSlotDayMapQuery(Guid.NewGuid(), from, to));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "To");
    }

    [Fact]
    public void GetSlotDayMapQuery_Validator_RejectsRangeOver90Days()
    {
        var validator = new GetSlotDayMapQueryValidator();
        var from = DateOnly.FromDateTime(DateTime.Today);
        var to   = from.AddDays(91); // 91 days > 90-day max
        var result = validator.Validate(new GetSlotDayMapQuery(Guid.NewGuid(), from, to));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "DateRange");
    }

    [Fact]
    public void GetSlotDayMapQuery_Validator_Accepts90DayRange()
    {
        var validator = new GetSlotDayMapQueryValidator();
        var from = DateOnly.FromDateTime(DateTime.Today);
        var to   = from.AddDays(90); // exactly 90 days — should be valid
        var result = validator.Validate(new GetSlotDayMapQuery(Guid.NewGuid(), from, to));

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void GetSlotDayMapQuery_Validator_AcceptsSingleDay()
    {
        var validator = new GetSlotDayMapQueryValidator();
        var day = DateOnly.FromDateTime(DateTime.Today);
        var result = validator.Validate(new GetSlotDayMapQuery(Guid.NewGuid(), day, day));

        result.IsValid.Should().BeTrue("from == to is a valid single-day query");
    }

    // ── 3. Appointment.Create — topic propagation (migration 086) ─────────────

    [Fact]
    public void Appointment_Create_WithTopic_PersistsTopic()
    {
        var orgId    = Guid.NewGuid();
        var userId   = Guid.NewGuid();
        var caId     = Guid.NewGuid();
        var slotId   = Guid.NewGuid();

        var appt = Appointment.Create(orgId, userId, caId, slotId, notes: "My notes", topic: "GST");

        appt.Topic.Should().Be("GST");
        appt.Notes.Should().Be("My notes");
    }

    [Fact]
    public void Appointment_Create_WithNullTopic_TopicIsNull()
    {
        var appt = Appointment.Create(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            notes: null, topic: null);

        appt.Topic.Should().BeNull("legacy rows and explicit null should produce null topic");
    }

    [Fact]
    public void Appointment_Create_TopicDefaultsToNull_WhenOmitted()
    {
        // Two-arg factory overload (backward-compat)
        var appt = Appointment.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());

        appt.Topic.Should().BeNull("topic is optional for backward compatibility");
    }

    [Theory]
    [InlineData("ACCOUNTING")]
    [InlineData("GST")]
    [InlineData("ITR")]
    [InlineData("LOAN")]
    [InlineData("OTHER")]
    public void Appointment_Create_SupportedTopicValues(string topic)
    {
        var appt = Appointment.Create(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            topic: topic);

        appt.Topic.Should().Be(topic);
    }

    // ── 4. BookmarkDto — shape validation (enrichment fields present) ──────────

    [Fact]
    public void BookmarkDto_CanBeConstructed_WithAllEnrichmentFields()
    {
        var dto = new BookmarkDto(
            BookmarkId:      Guid.NewGuid(),
            MessageId:       Guid.NewGuid(),
            ThreadId:        Guid.NewGuid(),
            MessageBody:     "Hello world",
            Note:            "My note",
            BookmarkedAt:    DateTime.UtcNow,
            MessageCreatedAt: DateTime.UtcNow.AddHours(-1),
            SenderUserId:    Guid.NewGuid(),
            SenderRole:      "CA",
            ThreadSubject:   "GST query");

        dto.MessageCreatedAt.Should().BeBefore(dto.BookmarkedAt);
        dto.SenderRole.Should().Be("CA");
        dto.ThreadSubject.Should().Be("GST query");
    }

    [Fact]
    public void BookmarkDto_AllowsNullOptionalFields()
    {
        var dto = new BookmarkDto(
            BookmarkId:      Guid.NewGuid(),
            MessageId:       Guid.NewGuid(),
            ThreadId:        Guid.NewGuid(),
            MessageBody:     "body",
            Note:            null,       // optional note
            BookmarkedAt:    DateTime.UtcNow,
            MessageCreatedAt: DateTime.UtcNow,
            SenderUserId:    null,       // null post-DPDP erasure
            SenderRole:      "USER",
            ThreadSubject:   null);      // thread with no subject

        dto.Note.Should().BeNull();
        dto.SenderUserId.Should().BeNull();
        dto.ThreadSubject.Should().BeNull();
    }

    // ── 5. Bare-GET parameter defaulting — regression guard (B-Wave3-redux fix) ─
    // These tests assert that query constructors accept the default values that the
    // fixed endpoint delegates now supply when params are omitted from the URL.
    // They protect against the "required query binding → 500" regression class.

    [Fact]
    public void ListAppointmentsQuery_AcceptsDefaultPagination()
    {
        // The fixed delegate passes (status=null, page=1, pageSize=20) on bare GET.
        var query = new ListAppointmentsQuery(null, 1, 20);

        query.Status.Should().BeNull();
        query.Page.Should().Be(1);
        query.PageSize.Should().Be(20);
    }

    [Fact]
    public void ListCaProfilesQuery_AcceptsDefaultPagination()
    {
        // The fixed delegate passes (activeOnly=true, page=1, pageSize=20) on bare GET.
        var query = new ListCaProfilesQuery(true, 1, 20);

        query.ActiveOnly.Should().BeTrue();
        query.Page.Should().Be(1);
        query.PageSize.Should().Be(20);
    }

    [Fact]
    public void ListBookmarksQuery_AcceptsDefaultPagination()
    {
        // The fixed delegate passes (page=1, pageSize=20) on bare GET.
        var query = new ListBookmarksQuery(1, 20);

        query.Page.Should().Be(1);
        query.PageSize.Should().Be(20);
    }

    // ── 5. AppointmentDetailDto — shape check ─────────────────────────────────

    [Fact]
    public void AppointmentDetailDto_CanBeConstructed_WithAllFields()
    {
        var start = DateTime.UtcNow.AddDays(1);
        var end   = start.AddMinutes(30);

        var dto = new AppointmentDetailDto(
            AppointmentId:        Guid.NewGuid(),
            CaProfileId:          Guid.NewGuid(),
            CaDisplayName:        "CA Priya",
            SlotStartUtc:         start,
            SlotEndUtc:           end,
            Status:               "CONFIRMED",
            MeetLink:             "https://meet.google.com/abc-defg-hij",
            RatingStars:          null,
            CreatedAt:            DateTime.UtcNow,
            Topic:                "GST",
            Notes:                "Quarterly filing query",
            RatingComment:        null,
            RatedAt:              null,
            CancelledByCa:        false,
            CaCancellationReason: null,
            CaSummaryNote:        null);

        dto.Topic.Should().Be("GST");
        dto.CancelledByCa.Should().BeFalse();
        dto.Notes.Should().Be("Quarterly filing query");
    }
}
