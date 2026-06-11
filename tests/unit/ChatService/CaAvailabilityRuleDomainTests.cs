using ChatService.Application.Appointments.Commands.CancelByCa;
using ChatService.Application.Appointments.Commands.CreateAvailabilityRule;
using ChatService.Application.Appointments.Commands.DeleteAvailabilityRule;
using ChatService.Application.Appointments.Commands.GenerateSlotsFromRules;
using ChatService.Application.Appointments.Queries.ListCaProfiles;
using ChatService.Application.Appointments.Queries.ListAvailabilityRules;
using ChatService.Domain.Entities;
using ChatService.Domain.Events;
using FluentAssertions;
using SnapAccount.Shared.Domain;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Unit tests for Wave 7A addendum features:
///   1. CA profiles list query validator
///   2. CA-initiated cancel (Appointment.CancelByCa domain method + event)
///   3. CaAvailabilityRule domain entity (Create, Update, Deactivate)
///   4. Availability rule command/query validators
///   5. AppointmentSlot.CreateFromRule factory
///
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class CaAvailabilityRuleDomainTests
{
    // ── 1. ListCaProfilesQuery validator ─────────────────────────────────────

    [Fact]
    public void ListCaProfilesQueryValidator_ValidQuery_Passes()
    {
        var validator = new ListCaProfilesQueryValidator();
        var query = new ListCaProfilesQuery(ActiveOnly: true, Page: 1, PageSize: 20);

        var result = validator.Validate(query);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ListCaProfilesQueryValidator_PageZero_Fails()
    {
        var validator = new ListCaProfilesQueryValidator();
        var query = new ListCaProfilesQuery(Page: 0, PageSize: 20);

        var result = validator.Validate(query);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Page");
    }

    [Fact]
    public void ListCaProfilesQueryValidator_PageSizeTooLarge_Fails()
    {
        var validator = new ListCaProfilesQueryValidator();
        var query = new ListCaProfilesQuery(Page: 1, PageSize: 101);

        var result = validator.Validate(query);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "PageSize");
    }

    // ── 2. Appointment.CancelByCa domain method ───────────────────────────────

    [Fact]
    public void Appointment_CancelByCa_FromConfirmed_Succeeds()
    {
        var appt = Appointment.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddMinutes(30)); // within 2h rule

        // CA can cancel anytime — no 2h rule
        var result = appt.CancelByCa("CA has a medical emergency");

        result.IsSuccess.Should().BeTrue();
        appt.Status.Should().Be(ChatService.Domain.Enums.AppointmentStatus.Cancelled);
        appt.CancelledByCa.Should().BeTrue();
        appt.CaCancellationReason.Should().Be("CA has a medical emergency");
    }

    [Fact]
    public void Appointment_CancelByCa_RaisesAppointmentCancelledByCaEvent()
    {
        var orgId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var caId = Guid.NewGuid();
        var appt = Appointment.Create(orgId, userId, caId, Guid.NewGuid());
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));

        appt.CancelByCa("Scheduling conflict");

        appt.DomainEvents.Should().ContainSingle(e => e is AppointmentCancelledByCaEvent);
        var ev = appt.DomainEvents.OfType<AppointmentCancelledByCaEvent>().Single();
        ev.OrganizationId.Should().Be(orgId);
        ev.BookedByUserId.Should().Be(userId);
        ev.CaProfileId.Should().Be(caId);
        ev.CancellationReason.Should().Be("Scheduling conflict");
    }

    [Fact]
    public void Appointment_CancelByCa_EmptyReason_ReturnsValidationFailure()
    {
        var appt = Appointment.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));

        var result = appt.CancelByCa("   ");

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.CancellationReasonRequired");
    }

    [Fact]
    public void Appointment_CancelByCa_AlreadyCompleted_ReturnsConflict()
    {
        var appt = Appointment.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        appt.Confirm("https://meet.google.com/test", DateTime.UtcNow.AddDays(1));
        appt.Complete();

        var result = appt.CancelByCa("Any reason");

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.AlreadyClosed");
    }

    [Fact]
    public void Appointment_CancelByCa_AlreadyCancelled_ReturnsConflict()
    {
        var appt = Appointment.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var slotStart = DateTime.UtcNow.AddHours(3);
        appt.Confirm("https://meet.google.com/test", slotStart);
        appt.Cancel(slotStart); // user cancel

        var result = appt.CancelByCa("Any reason");

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("Appointment.AlreadyClosed");
    }

    // ── 3. CaAvailabilityRule domain entity ───────────────────────────────────

    [Fact]
    public void CaAvailabilityRule_Create_ValidInputs_ReturnsSuccess()
    {
        var result = CaAvailabilityRule.Create(
            Guid.NewGuid(),
            weekday: 1, // Monday
            startTimeIst: TimeSpan.FromHours(9),
            endTimeIst: TimeSpan.FromHours(17),
            slotDurationMinutes: 60,
            effectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow),
            effectiveTo: null);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Weekday.Should().Be(1);
        result.Value.SlotDurationMinutes.Should().Be(60);
        result.Value.IsActive.Should().BeTrue();
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(7)]
    public void CaAvailabilityRule_Create_InvalidWeekday_ReturnsFailure(int weekday)
    {
        var result = CaAvailabilityRule.Create(
            Guid.NewGuid(), weekday,
            TimeSpan.FromHours(9), TimeSpan.FromHours(17), 60,
            DateOnly.FromDateTime(DateTime.UtcNow));

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AvailabilityRule.InvalidWeekday");
    }

    [Fact]
    public void CaAvailabilityRule_Create_EndBeforeStart_ReturnsFailure()
    {
        var result = CaAvailabilityRule.Create(
            Guid.NewGuid(), weekday: 1,
            startTimeIst: TimeSpan.FromHours(17),
            endTimeIst: TimeSpan.FromHours(9), // end < start
            slotDurationMinutes: 60,
            effectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow));

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AvailabilityRule.InvalidTimeRange");
    }

    [Theory]
    [InlineData(14)]  // below minimum 15
    [InlineData(481)] // above maximum 480
    public void CaAvailabilityRule_Create_InvalidSlotDuration_ReturnsFailure(int duration)
    {
        var result = CaAvailabilityRule.Create(
            Guid.NewGuid(), weekday: 1,
            TimeSpan.FromHours(9), TimeSpan.FromHours(17),
            slotDurationMinutes: duration,
            effectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow));

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AvailabilityRule.InvalidSlotDuration");
    }

    [Fact]
    public void CaAvailabilityRule_Create_SlotExceedsWindow_ReturnsFailure()
    {
        // Window = 9:00–9:30 (30 min), slot = 60 min
        var result = CaAvailabilityRule.Create(
            Guid.NewGuid(), weekday: 1,
            startTimeIst: TimeSpan.FromHours(9),
            endTimeIst: TimeSpan.FromHours(9.5),
            slotDurationMinutes: 60,
            effectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow));

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AvailabilityRule.SlotExceedsWindow");
    }

    [Fact]
    public void CaAvailabilityRule_Create_EffectiveToBeforeFrom_ReturnsFailure()
    {
        var from = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10));
        var to = DateOnly.FromDateTime(DateTime.UtcNow);

        var result = CaAvailabilityRule.Create(
            Guid.NewGuid(), weekday: 1,
            TimeSpan.FromHours(9), TimeSpan.FromHours(17), 60,
            effectiveFrom: from, effectiveTo: to);

        result.IsSuccess.Should().BeFalse();
        result.Error!.Code.Should().Be("AvailabilityRule.InvalidEffectiveRange");
    }

    [Fact]
    public void CaAvailabilityRule_Deactivate_SetsIsActiveFalse()
    {
        var rule = CaAvailabilityRule.Create(
            Guid.NewGuid(), 1, TimeSpan.FromHours(9), TimeSpan.FromHours(17), 60,
            DateOnly.FromDateTime(DateTime.UtcNow)).Value!;

        rule.Deactivate();

        rule.IsActive.Should().BeFalse();
    }

    [Fact]
    public void CaAvailabilityRule_Update_ValidInputs_Succeeds()
    {
        var rule = CaAvailabilityRule.Create(
            Guid.NewGuid(), 1, TimeSpan.FromHours(9), TimeSpan.FromHours(17), 60,
            DateOnly.FromDateTime(DateTime.UtcNow)).Value!;

        var result = rule.Update(
            weekday: 3, // Wednesday
            startTimeIst: TimeSpan.FromHours(10),
            endTimeIst: TimeSpan.FromHours(18),
            slotDurationMinutes: 90,
            effectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow),
            effectiveTo: null);

        result.IsSuccess.Should().BeTrue();
        rule.Weekday.Should().Be(3);
        rule.SlotDurationMinutes.Should().Be(90);
    }

    // ── 4. Command/Query validators ────────────────────────────────────────────

    [Fact]
    public void CancelByCaCommandValidator_ValidCommand_Passes()
    {
        var validator = new CancelByCaCommandValidator();
        var cmd = new CancelByCaCommand(Guid.NewGuid(), "Schedule conflict");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CancelByCaCommandValidator_EmptyReason_Fails()
    {
        var validator = new CancelByCaCommandValidator();
        var cmd = new CancelByCaCommand(Guid.NewGuid(), "");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Reason");
    }

    [Fact]
    public void CreateAvailabilityRuleCommandValidator_ValidCommand_Passes()
    {
        var validator = new CreateAvailabilityRuleCommandValidator();
        var cmd = new CreateAvailabilityRuleCommand(
            Weekday: 1,
            StartTimeIst: TimeSpan.FromHours(9),
            EndTimeIst: TimeSpan.FromHours(17),
            SlotDurationMinutes: 60,
            EffectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow));

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CreateAvailabilityRuleCommandValidator_EndBeforeStart_Fails()
    {
        var validator = new CreateAvailabilityRuleCommandValidator();
        var cmd = new CreateAvailabilityRuleCommand(
            Weekday: 1,
            StartTimeIst: TimeSpan.FromHours(17),
            EndTimeIst: TimeSpan.FromHours(9), // invalid
            SlotDurationMinutes: 60,
            EffectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow));

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "EndTimeIst");
    }

    [Fact]
    public void CreateAvailabilityRuleCommandValidator_WeekdaySeven_Fails()
    {
        var validator = new CreateAvailabilityRuleCommandValidator();
        var cmd = new CreateAvailabilityRuleCommand(
            Weekday: 7, // invalid
            StartTimeIst: TimeSpan.FromHours(9),
            EndTimeIst: TimeSpan.FromHours(17),
            SlotDurationMinutes: 60,
            EffectiveFrom: DateOnly.FromDateTime(DateTime.UtcNow));

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Weekday");
    }

    [Fact]
    public void DeleteAvailabilityRuleCommandValidator_ValidCommand_Passes()
    {
        var validator = new DeleteAvailabilityRuleCommandValidator();
        var cmd = new DeleteAvailabilityRuleCommand(Guid.NewGuid());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void DeleteAvailabilityRuleCommandValidator_EmptyId_Fails()
    {
        var validator = new DeleteAvailabilityRuleCommandValidator();
        var cmd = new DeleteAvailabilityRuleCommand(Guid.Empty);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "RuleId");
    }

    [Fact]
    public void GenerateSlotsFromRulesCommandValidator_ValidCommand_Passes()
    {
        var validator = new GenerateSlotsFromRulesCommandValidator();
        var cmd = new GenerateSlotsFromRulesCommand(WeeksAhead: 4);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(53)]
    public void GenerateSlotsFromRulesCommandValidator_InvalidWeeksAhead_Fails(int weeks)
    {
        var validator = new GenerateSlotsFromRulesCommandValidator();
        var cmd = new GenerateSlotsFromRulesCommand(WeeksAhead: weeks);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "WeeksAhead");
    }

    // ── 5. AppointmentSlot.CreateFromRule factory ─────────────────────────────

    [Fact]
    public void AppointmentSlot_CreateFromRule_SetsCorrectFields()
    {
        var caProfileId = Guid.NewGuid();
        var start = DateTime.UtcNow.AddDays(1);
        var end = start.AddHours(1);

        var slot = AppointmentSlot.CreateFromRule(caProfileId, start, end);

        slot.CaProfileId.Should().Be(caProfileId);
        slot.StartUtc.Should().Be(start);
        slot.EndUtc.Should().Be(end);
        slot.IsAvailable.Should().BeTrue();
    }
}
