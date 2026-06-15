using ChatService.Application.Appointments.Commands.BookAppointment;
using ChatService.Application.Appointments.Commands.CancelAppointment;
using ChatService.Application.Appointments.Commands.CreateSlot;
using ChatService.Application.Appointments.Commands.RateAppointment;
using ChatService.Application.Bookmarks.Commands.ToggleBookmark;
using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using ChatService.Domain.Events;
using FluentAssertions;
using SnapAccount.Shared.Domain;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Unit tests for the appointment domain entities introduced in GAP-031.
/// Covers: CaProfile rating aggregate, AppointmentSlot state machine,
/// Appointment state machine (2h cancel/reschedule rule, one-per-rating), and
/// MessageBookmark creation.
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class AppointmentDomainTests
{
    // ── CaProfile ──────────────────────────────────────────────────────────────

    [Fact]
    public void CaProfile_Create_SetsDefaults()
    {
        var userId = Guid.NewGuid();
        var profile = CaProfile.Create(userId, "Priya Sharma", bio: "GST specialist");

        profile.UserId.Should().Be(userId);
        profile.DisplayName.Should().Be("Priya Sharma");
        profile.Bio.Should().Be("GST specialist");
        profile.AverageRating.Should().Be(0m);
        profile.RatingCount.Should().Be(0);
        profile.IsActive.Should().BeTrue();
    }

    [Fact]
    public void CaProfile_RecordRating_ComputesCorrectAverage_SingleRating()
    {
        var profile = CaProfile.Create(Guid.NewGuid(), "CA Test");
        profile.RecordRating(4);

        profile.AverageRating.Should().Be(4m);
        profile.RatingCount.Should().Be(1);
    }

    [Fact]
    public void CaProfile_RecordRating_ComputesCorrectAverage_MultipleRatings()
    {
        var profile = CaProfile.Create(Guid.NewGuid(), "CA Test");
        profile.RecordRating(4);
        profile.RecordRating(2);
        profile.RecordRating(3);

        // (4+2+3)/3 = 3
        profile.RatingCount.Should().Be(3);
        profile.AverageRating.Should().BeApproximately(3m, precision: 0.01m);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    [InlineData(-1)]
    public void CaProfile_RecordRating_OutOfRange_Throws(int stars)
    {
        var profile = CaProfile.Create(Guid.NewGuid(), "CA Test");

        var act = () => profile.RecordRating(stars);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void CaProfile_SetActive_False_DeactivatesProfile()
    {
        var profile = CaProfile.Create(Guid.NewGuid(), "CA Test");
        profile.SetActive(false);

        profile.IsActive.Should().BeFalse();
    }

    // ── AppointmentSlot ────────────────────────────────────────────────────────

    [Fact]
    public void AppointmentSlot_Create_ValidRange_ReturnsSuccess()
    {
        var start = DateTime.UtcNow.AddDays(1);
        var end = start.AddHours(1);

        var result = AppointmentSlot.Create(Guid.NewGuid(), start, end);

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsAvailable.Should().BeTrue();
        result.Value.StartUtc.Should().Be(start);
        result.Value.EndUtc.Should().Be(end);
    }

    [Fact]
    public void AppointmentSlot_Create_StartAfterEnd_ReturnsFailure()
    {
        var start = DateTime.UtcNow.AddDays(2);
        var end = DateTime.UtcNow.AddDays(1);

        var result = AppointmentSlot.Create(Guid.NewGuid(), start, end);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AppointmentSlot.InvalidRange");
    }

    [Fact]
    public void AppointmentSlot_Create_StartInPast_ReturnsFailure()
    {
        var start = DateTime.UtcNow.AddMinutes(-5);
        var end = DateTime.UtcNow.AddHours(1);

        var result = AppointmentSlot.Create(Guid.NewGuid(), start, end);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AppointmentSlot.InPast");
    }

    [Fact]
    public void AppointmentSlot_MarkBooked_Available_Succeeds()
    {
        var slot = AppointmentSlot.Create(Guid.NewGuid(), DateTime.UtcNow.AddDays(1), DateTime.UtcNow.AddDays(1).AddHours(1)).Value!;

        var result = slot.MarkBooked();

        result.IsSuccess.Should().BeTrue();
        slot.IsAvailable.Should().BeFalse();
    }

    [Fact]
    public void AppointmentSlot_MarkBooked_AlreadyBooked_ReturnsConflict()
    {
        var slot = AppointmentSlot.Create(Guid.NewGuid(), DateTime.UtcNow.AddDays(1), DateTime.UtcNow.AddDays(1).AddHours(1)).Value!;
        slot.MarkBooked();

        var result = slot.MarkBooked();

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AppointmentSlot.AlreadyBooked");
    }

    [Fact]
    public void AppointmentSlot_Release_AfterBooked_RestoresAvailability()
    {
        var slot = AppointmentSlot.Create(Guid.NewGuid(), DateTime.UtcNow.AddDays(1), DateTime.UtcNow.AddDays(1).AddHours(1)).Value!;
        slot.MarkBooked();

        slot.Release();

        slot.IsAvailable.Should().BeTrue();
    }

    // ── Appointment state machine ──────────────────────────────────────────────

    private static Appointment MakeDraftAppointment()
        => Appointment.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "Test notes");

    [Fact]
    public void Appointment_Create_SetsDefaultDraftStatus()
    {
        var appt = MakeDraftAppointment();

        appt.Status.Should().Be(AppointmentStatus.Draft);
        appt.MeetLink.Should().BeNull();
    }

    [Fact]
    public void Appointment_Confirm_FromDraft_SetsConfirmedAndMeetLink()
    {
        var appt = MakeDraftAppointment();
        var meetLink = "https://meet.google.com/abc-def-ghi";
        var slotStart = DateTime.UtcNow.AddDays(1);

        var result = appt.Confirm(meetLink, slotStart);

        result.IsSuccess.Should().BeTrue();
        appt.Status.Should().Be(AppointmentStatus.Confirmed);
        appt.MeetLink.Should().Be(meetLink);
    }

    [Fact]
    public void Appointment_Confirm_RaisesAppointmentBookedEvent()
    {
        var appt = MakeDraftAppointment();

        appt.Confirm("https://meet.google.com/abc-def-ghi", DateTime.UtcNow.AddDays(1));

        appt.DomainEvents.Should().ContainSingle(e => e is AppointmentBookedEvent);
    }

    [Fact]
    public void Appointment_Confirm_BookedEvent_ContainsCorrectData()
    {
        var orgId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var caId = Guid.NewGuid();
        var slotId = Guid.NewGuid();
        var slotStart = DateTime.UtcNow.AddDays(1);
        var meetLink = "https://meet.google.com/test";

        var appt = Appointment.Create(orgId, userId, caId, slotId);
        appt.Confirm(meetLink, slotStart);

        var ev = appt.DomainEvents.OfType<AppointmentBookedEvent>().Single();
        ev.OrganizationId.Should().Be(orgId);
        ev.BookedByUserId.Should().Be(userId);
        ev.CaProfileId.Should().Be(caId);
        ev.SlotStartUtc.Should().Be(slotStart);
        ev.MeetLink.Should().Be(meetLink);
    }

    [Fact]
    public void Appointment_Confirm_AlreadyConfirmed_ReturnsConflict()
    {
        var appt = MakeDraftAppointment();
        appt.Confirm("https://meet.google.com/first", DateTime.UtcNow.AddDays(1));

        var result = appt.Confirm("https://meet.google.com/second", DateTime.UtcNow.AddDays(1));

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.AlreadyConfirmed");
    }

    // ── Cancel 2-hour rule ─────────────────────────────────────────────────────

    [Fact]
    public void Appointment_Cancel_WhenMoreThan2HoursAway_Succeeds()
    {
        var appt = MakeDraftAppointment();
        var slotStart = DateTime.UtcNow.AddHours(3); // 3h away — safe
        appt.Confirm("https://meet.google.com/test", slotStart);

        var result = appt.Cancel(slotStart);

        result.IsSuccess.Should().BeTrue();
        appt.Status.Should().Be(AppointmentStatus.Cancelled);
    }

    [Fact]
    public void Appointment_Cancel_Within2Hours_ReturnsValidationFailure()
    {
        var appt = MakeDraftAppointment();
        var slotStart = DateTime.UtcNow.AddHours(1); // 1h away — inside window
        appt.Confirm("https://meet.google.com/test", slotStart);

        var result = appt.Cancel(slotStart);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.TooLateToCancel");
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public void Appointment_Cancel_AlreadyCancelled_ReturnsConflict()
    {
        var appt = MakeDraftAppointment();
        var slotStart = DateTime.UtcNow.AddHours(3);
        appt.Confirm("https://meet.google.com/test", slotStart);
        appt.Cancel(slotStart);

        var result = appt.Cancel(slotStart);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.AlreadyClosed");
    }

    [Fact]
    public void Appointment_Cancel_AlreadyCompleted_ReturnsConflict()
    {
        var appt = MakeDraftAppointment();
        var slotStart = DateTime.UtcNow.AddHours(3);
        appt.Confirm("https://meet.google.com/test", slotStart);
        appt.Complete();

        var result = appt.Cancel(slotStart);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.AlreadyClosed");
    }

    // ── Reschedule 2-hour rule ─────────────────────────────────────────────────

    [Fact]
    public void Appointment_Reschedule_WhenMoreThan2HoursAway_Succeeds()
    {
        var appt = MakeDraftAppointment();
        var currentSlotStart = DateTime.UtcNow.AddHours(4);
        var newSlotId = Guid.NewGuid();
        appt.Confirm("https://meet.google.com/old", currentSlotStart);

        var result = appt.Reschedule(newSlotId, currentSlotStart, "https://meet.google.com/new");

        result.IsSuccess.Should().BeTrue();
        appt.SlotId.Should().Be(newSlotId);
        appt.MeetLink.Should().Be("https://meet.google.com/new");
    }

    [Fact]
    public void Appointment_Reschedule_Within2Hours_ReturnsValidationFailure()
    {
        var appt = MakeDraftAppointment();
        var currentSlotStart = DateTime.UtcNow.AddMinutes(30); // 30m away
        appt.Confirm("https://meet.google.com/old", currentSlotStart);

        var result = appt.Reschedule(Guid.NewGuid(), currentSlotStart);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.TooLateToReschedule");
    }

    [Fact]
    public void Appointment_Reschedule_WhenNotConfirmed_ReturnsConflict()
    {
        var appt = MakeDraftAppointment(); // still Draft

        var result = appt.Reschedule(Guid.NewGuid(), DateTime.UtcNow.AddHours(5));

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.NotConfirmed");
    }

    // ── Rate (one per appointment, only after COMPLETED) ──────────────────────

    [Fact]
    public void Appointment_Rate_AfterCompleted_Succeeds()
    {
        var appt = MakeDraftAppointment();
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));
        appt.Complete();

        var result = appt.Rate(5, "Excellent session!");

        result.IsSuccess.Should().BeTrue();
        appt.RatingStars.Should().Be(5);
        appt.RatingComment.Should().Be("Excellent session!");
        appt.RatedAt.Should().NotBeNull();
    }

    [Fact]
    public void Appointment_Rate_NotCompleted_ReturnsValidationFailure()
    {
        var appt = MakeDraftAppointment();
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));
        // Still Confirmed, not Completed

        var result = appt.Rate(4, "Good");

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.NotCompleted");
    }

    [Fact]
    public void Appointment_Rate_AlreadyRated_ReturnsConflict()
    {
        var appt = MakeDraftAppointment();
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));
        appt.Complete();
        appt.Rate(4, "Good");

        var result = appt.Rate(5, "Changed mind");

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.AlreadyRated");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    [InlineData(-1)]
    public void Appointment_Rate_OutOfRange_ReturnsValidationFailure(int stars)
    {
        var appt = MakeDraftAppointment();
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));
        appt.Complete();

        var result = appt.Rate(stars, null);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.InvalidRating");
    }

    // ── Complete / NoShow ──────────────────────────────────────────────────────

    [Fact]
    public void Appointment_Complete_FromConfirmed_Succeeds()
    {
        var appt = MakeDraftAppointment();
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));

        var result = appt.Complete();

        result.IsSuccess.Should().BeTrue();
        appt.Status.Should().Be(AppointmentStatus.Completed);
    }

    [Fact]
    public void Appointment_MarkNoShow_FromConfirmed_Succeeds()
    {
        var appt = MakeDraftAppointment();
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));

        var result = appt.MarkNoShow();

        result.IsSuccess.Should().BeTrue();
        appt.Status.Should().Be(AppointmentStatus.NoShow);
    }

    // ── Validators ─────────────────────────────────────────────────────────────

    [Fact]
    public void BookAppointmentCommandValidator_ValidCommand_Passes()
    {
        var validator = new BookAppointmentCommandValidator();
        var cmd = new BookAppointmentCommand(Guid.NewGuid(), Guid.NewGuid(), "I need GST help.");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void BookAppointmentCommandValidator_EmptyCaProfileId_Fails()
    {
        var validator = new BookAppointmentCommandValidator();
        var cmd = new BookAppointmentCommand(Guid.Empty, Guid.NewGuid());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "CaProfileId");
    }

    [Fact]
    public void CreateSlotCommandValidator_EndBeforeStart_Fails()
    {
        var validator = new CreateSlotCommandValidator();
        var cmd = new CreateSlotCommand(DateTime.UtcNow.AddDays(2), DateTime.UtcNow.AddDays(1));

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "EndUtc");
    }

    [Fact]
    public void CancelAppointmentCommandValidator_ValidCommand_Passes()
    {
        var validator = new CancelAppointmentCommandValidator();
        var cmd = new CancelAppointmentCommand(Guid.NewGuid());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void RateAppointmentCommandValidator_ValidCommand_Passes()
    {
        var validator = new RateAppointmentCommandValidator();
        var cmd = new RateAppointmentCommand(Guid.NewGuid(), 5, "Great!");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void RateAppointmentCommandValidator_StarsBelowRange_Fails()
    {
        var validator = new RateAppointmentCommandValidator();
        var cmd = new RateAppointmentCommand(Guid.NewGuid(), 0, null);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Stars");
    }

    [Fact]
    public void ToggleBookmarkCommandValidator_ValidCommand_Passes()
    {
        var validator = new ToggleBookmarkCommandValidator();
        var cmd = new ToggleBookmarkCommand(Guid.NewGuid(), "Useful context for GST query.");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ToggleBookmarkCommandValidator_EmptyMessageId_Fails()
    {
        var validator = new ToggleBookmarkCommandValidator();
        var cmd = new ToggleBookmarkCommand(Guid.Empty);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "MessageId");
    }
}
