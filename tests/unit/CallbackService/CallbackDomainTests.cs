using CallbackService.Domain.Entities;
using CallbackService.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace CallbackService.Tests;

/// <summary>
/// Unit tests for the <see cref="Callback"/> aggregate state machine.
/// Phase 6E — validates all allowed and rejected transitions per spec.
/// </summary>
[Trait("Category", "Unit")]
public class CallbackDomainTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid AgentId = Guid.NewGuid();

    // ──────────────────────────────────────────────────────────────
    // Factory
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Create_SetsStatusToPending()
    {
        var cb = MakePending();

        cb.Status.Should().Be(CallbackStatus.Pending);
        cb.UserId.Should().Be(UserId);
        cb.Category.Should().Be(CallbackCategory.Gst);
        cb.Priority.Should().Be(CallbackPriority.High);
    }

    [Fact]
    public void Create_RaisesCallbackRequestedEvent()
    {
        var cb = MakePending();

        cb.DomainEvents.Should().ContainSingle(e =>
            e is CallbackService.Domain.Events.CallbackRequestedEvent);
    }

    // ──────────────────────────────────────────────────────────────
    // Assign — Pending → Assigned
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Assign_FromPending_SetsStatusToAssigned()
    {
        var cb = MakePending();

        cb.Assign(AgentId);

        cb.Status.Should().Be(CallbackStatus.Assigned);
        cb.AssignedAgentId.Should().Be(AgentId);
    }

    [Fact]
    public void Assign_FromPending_RaisesCallbackAssignedEvent()
    {
        var cb = MakePending();
        cb.Assign(AgentId);

        cb.DomainEvents.Should().Contain(e => e is CallbackService.Domain.Events.CallbackAssignedEvent);
    }

    [Fact]
    public void Assign_FromAssigned_ThrowsInvalidOperation()
    {
        var cb = MakePending();
        cb.Assign(AgentId);

        var act = () => cb.Assign(Guid.NewGuid());

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Cannot assign*");
    }

    [Fact]
    public void Assign_FromCompleted_ThrowsInvalidOperation()
    {
        var cb = MakePending();
        cb.Assign(AgentId);
        cb.Confirm(DateTime.UtcNow.AddHours(1));
        cb.Complete("Resolved");

        var act = () => cb.Assign(Guid.NewGuid());

        act.Should().Throw<InvalidOperationException>();
    }

    // ──────────────────────────────────────────────────────────────
    // Confirm — Assigned → Confirmed
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Confirm_FromAssigned_SetsStatusToConfirmed()
    {
        var cb = MakePending();
        cb.Assign(AgentId);
        var scheduledAt = DateTime.UtcNow.AddHours(3);

        cb.Confirm(scheduledAt);

        cb.Status.Should().Be(CallbackStatus.Confirmed);
        cb.ScheduledAt.Should().Be(scheduledAt);
    }

    [Fact]
    public void Confirm_FromPending_ThrowsInvalidOperation()
    {
        var cb = MakePending();
        var act = () => cb.Confirm(DateTime.UtcNow.AddHours(1));

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Cannot confirm*");
    }

    // ──────────────────────────────────────────────────────────────
    // Complete — Confirmed|Assigned → Completed
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Complete_FromConfirmed_SetsStatusToCompleted()
    {
        var cb = MakeConfirmed();

        cb.Complete("All resolved");

        cb.Status.Should().Be(CallbackStatus.Completed);
        cb.CompletedAt.Should().NotBeNull();
        cb.ResolutionSummary.Should().Be("All resolved");
    }

    [Fact]
    public void Complete_FromAssigned_SetsStatusToCompleted()
    {
        var cb = MakePending();
        cb.Assign(AgentId);

        cb.Complete(null);

        cb.Status.Should().Be(CallbackStatus.Completed);
    }

    [Fact]
    public void Complete_FromPending_ThrowsInvalidOperation()
    {
        var cb = MakePending();

        var act = () => cb.Complete("Summary");

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Cannot complete*");
    }

    [Fact]
    public void Complete_FromCancelled_ThrowsInvalidOperation()
    {
        var cb = MakePending();
        cb.Cancel("No longer needed");

        var act = () => cb.Complete("Summary");

        act.Should().Throw<InvalidOperationException>();
    }

    // ──────────────────────────────────────────────────────────────
    // Escalate — any non-terminal → Escalated
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Escalate_FromPending_SetsStatusToEscalated()
    {
        var cb = MakePending();

        cb.Escalate("Complex GST query needs senior CA");

        cb.Status.Should().Be(CallbackStatus.Escalated);
        cb.EscalationReason.Should().Be("Complex GST query needs senior CA");
    }

    [Fact]
    public void Escalate_FromAssigned_SetsStatusToEscalated()
    {
        var cb = MakePending();
        cb.Assign(AgentId);

        cb.Escalate("Needs CA level expertise");

        cb.Status.Should().Be(CallbackStatus.Escalated);
    }

    [Fact]
    public void Escalate_FromCompleted_ThrowsInvalidOperation()
    {
        var cb = MakeConfirmed();
        cb.Complete("Resolved");

        var act = () => cb.Escalate("Too late");

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Cannot escalate*");
    }

    [Fact]
    public void Escalate_FromCancelled_ThrowsInvalidOperation()
    {
        var cb = MakePending();
        cb.Cancel("User withdrew");

        var act = () => cb.Escalate("Try again");

        act.Should().Throw<InvalidOperationException>();
    }

    // ──────────────────────────────────────────────────────────────
    // Cancel — any non-Completed → Cancelled
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Cancel_FromPending_SetsStatusToCancelled()
    {
        var cb = MakePending();

        cb.Cancel("Customer cancelled");

        cb.Status.Should().Be(CallbackStatus.Cancelled);
        cb.CancellationReason.Should().Be("Customer cancelled");
    }

    [Fact]
    public void Cancel_FromConfirmed_SetsStatusToCancelled()
    {
        var cb = MakeConfirmed();

        cb.Cancel("Rescheduled by user");

        cb.Status.Should().Be(CallbackStatus.Cancelled);
    }

    [Fact]
    public void Cancel_FromCompleted_ThrowsInvalidOperation()
    {
        var cb = MakeConfirmed();
        cb.Complete(null);

        var act = () => cb.Cancel("Cannot cancel completed");

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Cannot cancel a completed*");
    }

    // ──────────────────────────────────────────────────────────────
    // Reschedule
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void Reschedule_FromPending_UpdatesWindow()
    {
        var cb = MakePending();
        var start = DateTime.UtcNow.AddHours(4);
        var end = DateTime.UtcNow.AddHours(5);

        cb.Reschedule(start, end);

        cb.PreferredWindowStart.Should().Be(start);
        cb.PreferredWindowEnd.Should().Be(end);
        cb.RescheduleCount.Should().Be(1);
    }

    [Fact]
    public void Reschedule_FromConfirmed_ReturnsToAssignedAndClearsScheduledAt()
    {
        var cb = MakeConfirmed();

        cb.Reschedule(DateTime.UtcNow.AddHours(6), DateTime.UtcNow.AddHours(7));

        cb.Status.Should().Be(CallbackStatus.Assigned);
        cb.ScheduledAt.Should().BeNull();
    }

    [Fact]
    public void Reschedule_FromCancelled_ThrowsInvalidOperation()
    {
        var cb = MakePending();
        cb.Cancel("Done");

        var act = () => cb.Reschedule(DateTime.UtcNow.AddHours(1), DateTime.UtcNow.AddHours(2));

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Cannot reschedule*");
    }

    // ──────────────────────────────────────────────────────────────
    // Add note
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void AddNote_AppendsNoteToCollection()
    {
        var cb = MakePending();

        cb.AddNote(AgentId, "Call placed, user answered", isInternal: false);

        cb.Notes.Should().HaveCount(1);
        cb.Notes[0].Content.Should().Be("Call placed, user answered");
        cb.Notes[0].AuthorId.Should().Be(AgentId);
        cb.Notes[0].IsInternal.Should().BeFalse();
    }

    [Fact]
    public void AddNote_MultipleNotes_AllAppended()
    {
        var cb = MakePending();
        cb.AddNote(AgentId, "First note here", false);
        cb.AddNote(AgentId, "Second note here", true);

        cb.Notes.Should().HaveCount(2);
    }

    // ──────────────────────────────────────────────────────────────
    // Validators
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void RequestCallbackCommandValidator_InvalidPhoneFormat_IsInvalid()
    {
        var validator = new Application.Callbacks.Commands.RequestCallback.RequestCallbackCommandValidator();
        var cmd = new Application.Callbacks.Commands.RequestCallback.RequestCallbackCommand(
            UserId, OrgId, "9876543210", // missing +91 prefix
            CallbackCategory.Gst, CallbackPriority.Normal, null, null, null);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("+91XXXXXXXXXX"));
    }

    [Fact]
    public void RequestCallbackCommandValidator_ValidCommand_IsValid()
    {
        var validator = new Application.Callbacks.Commands.RequestCallback.RequestCallbackCommandValidator();
        var cmd = new Application.Callbacks.Commands.RequestCallback.RequestCallbackCommand(
            UserId, OrgId, "+919876543210",
            CallbackCategory.Itr, CallbackPriority.High, "ITR refund query", null, null);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void RequestCallbackCommandValidator_PreferredWindowEndBeforeStart_IsInvalid()
    {
        var validator = new Application.Callbacks.Commands.RequestCallback.RequestCallbackCommandValidator();
        var start = DateTime.UtcNow.AddHours(3);
        var end = DateTime.UtcNow.AddHours(1);  // end before start
        var cmd = new Application.Callbacks.Commands.RequestCallback.RequestCallbackCommand(
            UserId, OrgId, "+919876543210",
            CallbackCategory.Gst, CallbackPriority.Normal, null, start, end);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("after start"));
    }

    [Fact]
    public void CompleteCallbackCommandValidator_EmptyCallbackId_IsInvalid()
    {
        var validator = new Application.Callbacks.Commands.CompleteCallback.CompleteCallbackCommandValidator();
        var cmd = new Application.Callbacks.Commands.CompleteCallback.CompleteCallbackCommand(
            Guid.Empty, null);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
    }

    // ──────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────

    private static Callback MakePending() =>
        Callback.Create(UserId, OrgId, "+919876543210",
            CallbackCategory.Gst, CallbackPriority.High,
            "GSTR-3B late fee query", null, null);

    private static Callback MakeConfirmed()
    {
        var cb = MakePending();
        cb.Assign(AgentId);
        cb.Confirm(DateTime.UtcNow.AddHours(2));
        return cb;
    }
}
