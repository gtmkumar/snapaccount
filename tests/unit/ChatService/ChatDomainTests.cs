using ChatService.Application.Threads.Commands.SendMessage;
using ChatService.Application.Threads.Commands.StartThread;
using ChatService.Domain.Entities;
using ChatService.Domain.Enums;
using ChatService.Domain.Events;
using FluentAssertions;
using SnapAccount.Shared.Domain;
using Xunit;

namespace ChatService.Tests;

/// <summary>
/// Unit tests for ChatService domain entities and command validators.
/// Tests aggregate state machine, domain events, idempotency, and DPDP compliance.
/// Category=Unit — no external dependencies.
/// </summary>
public sealed class ChatDomainTests
{
    // ── ChatThread.Open ────────────────────────────────────────────────────────

    [Fact]
    public void Open_Creates_Thread_With_Open_Status()
    {
        var orgId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var thread = ChatThread.Open(orgId, userId, ThreadCategory.GENERAL, "Test subject");

        thread.OrganizationId.Should().Be(orgId);
        thread.InitiatedByUserId.Should().Be(userId);
        thread.Category.Should().Be(ThreadCategory.GENERAL);
        thread.Status.Should().Be(ThreadStatus.Open);
        thread.Subject.Should().Be("Test subject");
    }

    [Fact]
    public void Open_Adds_Initiator_As_User_Participant()
    {
        var userId = Guid.NewGuid();
        var thread = ChatThread.Open(Guid.NewGuid(), userId, ThreadCategory.GST);

        thread.Participants.Should().HaveCount(1);
        thread.Participants[0].UserId.Should().Be(userId);
        thread.Participants[0].Role.Should().Be(ParticipantRole.User);
    }

    [Fact]
    public void Open_Raises_ThreadOpenedEvent()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GST);

        thread.DomainEvents.Should().ContainSingle(e => e is ThreadOpenedEvent);
    }

    // ── ChatThread.Assign ──────────────────────────────────────────────────────

    [Fact]
    public void Assign_Sets_AssignedToUserId_And_Adds_Agent_Participant()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.LOAN);
        var agentId = Guid.NewGuid();

        thread.Assign(agentId, ParticipantRole.Agent);

        thread.AssignedToUserId.Should().Be(agentId);
        thread.Participants.Should().Contain(p => p.UserId == agentId && p.Role == ParticipantRole.Agent);
    }

    [Fact]
    public void Assign_Does_Not_Duplicate_Existing_Participant()
    {
        var agentId = Guid.NewGuid();
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.LOAN);
        thread.Assign(agentId, ParticipantRole.Agent);

        thread.Assign(agentId, ParticipantRole.Agent);

        thread.Participants.Count(p => p.UserId == agentId && p.DeletedAt == null).Should().Be(1);
    }

    [Fact]
    public void Assign_Raises_ThreadAssignedEvent()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.LOAN);
        thread.ClearDomainEvents();

        thread.Assign(Guid.NewGuid(), ParticipantRole.Agent);

        thread.DomainEvents.Should().ContainSingle(e => e is ThreadAssignedEvent);
    }

    // ── ChatThread.Resolve ─────────────────────────────────────────────────────

    [Fact]
    public void Resolve_Sets_Status_Resolved_And_Records_Timestamp()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.BILLING);

        var result = thread.Resolve(Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        thread.Status.Should().Be(ThreadStatus.Resolved);
        thread.ResolvedAt.Should().NotBeNull();
    }

    [Fact]
    public void Resolve_Records_ResolvedByUserId()
    {
        var resolvedBy = Guid.NewGuid();
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.BILLING);

        thread.Resolve(resolvedBy);

        thread.ResolvedByUserId.Should().Be(resolvedBy);
    }

    [Fact]
    public void Resolve_Already_Resolved_Returns_Conflict()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.BILLING);
        thread.Resolve(Guid.NewGuid());

        var result = thread.Resolve(Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public void Resolve_Raises_ThreadResolvedEvent()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.BILLING);
        thread.ClearDomainEvents();

        thread.Resolve(Guid.NewGuid());

        thread.DomainEvents.Should().ContainSingle(e => e is ThreadResolvedEvent);
    }

    // ── ChatThread.Escalate ───────────────────────────────────────────────────

    [Fact]
    public void Escalate_Sets_Status_Escalated_And_Timestamp()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.ITR);

        var result = thread.Escalate(Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        thread.Status.Should().Be(ThreadStatus.Escalated);
        thread.EscalatedAt.Should().NotBeNull();
    }

    [Fact]
    public void Escalate_Already_Escalated_Returns_Conflict()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.ITR);
        thread.Escalate(Guid.NewGuid());

        var result = thread.Escalate(Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public void Escalate_Raises_ThreadEscalatedEvent()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.ITR);
        thread.ClearDomainEvents();

        thread.Escalate(Guid.NewGuid());

        thread.DomainEvents.Should().ContainSingle(e => e is ThreadEscalatedEvent);
    }

    // ── ChatThread.Reopen ─────────────────────────────────────────────────────

    [Fact]
    public void Reopen_Resolved_Thread_Sets_Open_And_Clears_ResolvedAt()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GENERAL);
        thread.Resolve(Guid.NewGuid());

        var result = thread.Reopen();

        result.IsSuccess.Should().BeTrue();
        thread.Status.Should().Be(ThreadStatus.Open);
        thread.ResolvedAt.Should().BeNull();
    }

    [Fact]
    public void Reopen_Escalated_Thread_Sets_Open()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GENERAL);
        thread.Escalate(Guid.NewGuid());

        var result = thread.Reopen();

        result.IsSuccess.Should().BeTrue();
        thread.Status.Should().Be(ThreadStatus.Open);
    }

    [Fact]
    public void Reopen_Open_Thread_Returns_Conflict()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GENERAL);

        var result = thread.Reopen();

        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    // ── ChatThread state transitions on messages ───────────────────────────────

    [Fact]
    public void OnAgentMessageSent_Transitions_Open_To_PendingUser()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GST);

        thread.OnAgentMessageSent();

        thread.Status.Should().Be(ThreadStatus.PendingUser);
    }

    [Fact]
    public void OnAgentMessageSent_NoOp_When_Not_Open()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GST);
        thread.Resolve(Guid.NewGuid());

        thread.OnAgentMessageSent();

        thread.Status.Should().Be(ThreadStatus.Resolved); // unchanged
    }

    [Fact]
    public void OnUserMessageSent_Transitions_PendingUser_To_Open()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GST);
        thread.OnAgentMessageSent();

        thread.OnUserMessageSent();

        thread.Status.Should().Be(ThreadStatus.Open);
    }

    [Fact]
    public void SetCategory_Updates_Category()
    {
        var thread = ChatThread.Open(Guid.NewGuid(), Guid.NewGuid(), ThreadCategory.GENERAL);

        thread.SetCategory(ThreadCategory.GST);

        thread.Category.Should().Be(ThreadCategory.GST);
    }

    // ── ChatMessage ────────────────────────────────────────────────────────────

    [Fact]
    public void ChatMessage_Create_Sets_All_Fields()
    {
        var threadId = Guid.NewGuid();
        var senderId = Guid.NewGuid();

        var message = ChatMessage.Create(threadId, senderId,
            "Hello, I need help with my GST return.",
            attachmentsJson: null,
            clientMessageId: "offline-abc-123");

        message.ThreadId.Should().Be(threadId);
        message.SenderUserId.Should().Be(senderId);
        message.Body.Should().Be("Hello, I need help with my GST return.");
        message.ClientMessageId.Should().Be("offline-abc-123");
        message.AnonymizedAt.Should().BeNull();
    }

    [Fact]
    public void ChatMessage_Create_Raises_MessageSentEvent()
    {
        var message = ChatMessage.Create(Guid.NewGuid(), Guid.NewGuid(), "Test message");

        message.DomainEvents.Should().ContainSingle(e => e is MessageSentEvent);
    }

    [Fact]
    public void ChatMessage_AnonymizeSender_Nulls_SenderUserId()
    {
        var message = ChatMessage.Create(Guid.NewGuid(), Guid.NewGuid(), "body");

        message.AnonymizeSender("DPDP_USER_ERASURE");

        message.SenderUserId.Should().BeNull();
    }

    [Fact]
    public void ChatMessage_AnonymizeSender_Sets_Timestamp_And_Reason()
    {
        var message = ChatMessage.Create(Guid.NewGuid(), Guid.NewGuid(), "body");

        message.AnonymizeSender("DPDP_USER_ERASURE");

        message.AnonymizedAt.Should().NotBeNull();
        message.AnonymizationReason.Should().Be("DPDP_USER_ERASURE");
    }

    [Fact]
    public void ChatMessage_AnonymizeSender_Retains_Body()
    {
        var body = "My GSTIN is 27AAPFU0939F1ZV";
        var message = ChatMessage.Create(Guid.NewGuid(), Guid.NewGuid(), body);

        message.AnonymizeSender();

        // DPDP: message content preserved; only sender identity anonymized
        message.Body.Should().Be(body);
    }

    [Fact]
    public void ChatMessage_AnonymizeSender_Default_Reason_Is_DPDP()
    {
        var message = ChatMessage.Create(Guid.NewGuid(), Guid.NewGuid(), "body");

        message.AnonymizeSender();

        message.AnonymizationReason.Should().Be("DPDP_USER_ERASURE");
    }

    // ── ThreadParticipant ──────────────────────────────────────────────────────

    [Fact]
    public void ThreadParticipant_Create_Sets_Fields()
    {
        var threadId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var participant = ThreadParticipant.Create(threadId, userId, ParticipantRole.CA);

        participant.ThreadId.Should().Be(threadId);
        participant.UserId.Should().Be(userId);
        participant.Role.Should().Be(ParticipantRole.CA);
        participant.DeletedAt.Should().BeNull();
    }

    [Fact]
    public void ThreadParticipant_SoftDelete_Sets_DeletedAt()
    {
        var participant = ThreadParticipant.Create(Guid.NewGuid(), Guid.NewGuid(), ParticipantRole.User);

        participant.SoftDelete();

        participant.DeletedAt.Should().NotBeNull();
    }

    // ── StartThreadCommand validator ───────────────────────────────────────────

    [Fact]
    public void StartThreadCommand_Fails_When_InitialMessage_Empty()
    {
        var validator = new StartThreadCommandValidator();
        var cmd = new StartThreadCommand(ThreadCategory.GENERAL, "Subject", "");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "InitialMessage");
    }

    [Fact]
    public void StartThreadCommand_Valid_With_Category_And_Message()
    {
        var validator = new StartThreadCommandValidator();
        var cmd = new StartThreadCommand(ThreadCategory.GST, null, "I need help filing GSTR-1");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    // ── SendMessageCommand validator ───────────────────────────────────────────

    [Fact]
    public void SendMessageCommand_Fails_When_Body_Empty()
    {
        var validator = new SendMessageCommandValidator();
        var cmd = new SendMessageCommand(Guid.NewGuid(), "");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Body");
    }

    [Fact]
    public void SendMessageCommand_Fails_When_ThreadId_Empty()
    {
        var validator = new SendMessageCommandValidator();
        var cmd = new SendMessageCommand(Guid.Empty, "Hello");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "ThreadId");
    }

    [Fact]
    public void SendMessageCommand_Valid_With_ThreadId_And_Body()
    {
        var validator = new SendMessageCommandValidator();
        var cmd = new SendMessageCommand(Guid.NewGuid(), "What is the status of my ITR filing?");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }
}
