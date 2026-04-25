using FluentAssertions;
using LoanService.Domain.Entities;
using LoanService.Domain.Events;
using Xunit;

namespace LoanService.Tests.Domain;

/// <summary>
/// Unit tests for the LoanApplication state machine.
/// Tests all valid transitions and all invalid-transition guard clauses.
/// </summary>
public sealed class LoanApplicationStateMachineTests
{
    // ── Factory helpers ────────────────────────────────────────────────────────

    private static LoanApplication CreateDraft() => new()
    {
        OrgId = Guid.NewGuid(),
        UserId = Guid.NewGuid(),
        LoanProductId = Guid.NewGuid(),
        RequestedAmount = 5_00_000m,
        TenureMonths = 24
    };

    private static LoanApplication CreateAtStatus(LoanApplicationStatus target)
    {
        var app = CreateDraft();
        if (target == LoanApplicationStatus.Draft) return app;

        app.Submit().IsSuccess.Should().BeTrue();
        if (target == LoanApplicationStatus.Submitted) return app;

        app.AssignToBank(Guid.NewGuid()).IsSuccess.Should().BeTrue();
        if (target == LoanApplicationStatus.UnderReview) return app;

        if (target == LoanApplicationStatus.DocsRequested)
        {
            app.RequestDocuments().IsSuccess.Should().BeTrue();
            return app;
        }

        if (target == LoanApplicationStatus.Approved)
        {
            app.Approve("BANK-REF-001").IsSuccess.Should().BeTrue();
            return app;
        }

        if (target == LoanApplicationStatus.Rejected)
        {
            app.Reject("Credit score below threshold").IsSuccess.Should().BeTrue();
            return app;
        }

        if (target == LoanApplicationStatus.Disbursed)
        {
            app.Approve("BANK-REF-001").IsSuccess.Should().BeTrue();
            app.RecordDisbursement(5_00_000m, "DISB-001").IsSuccess.Should().BeTrue();
            return app;
        }

        if (target == LoanApplicationStatus.Closed)
        {
            app.Approve("BANK-REF-001").IsSuccess.Should().BeTrue();
            app.RecordDisbursement(5_00_000m, "DISB-001").IsSuccess.Should().BeTrue();
            app.Close().IsSuccess.Should().BeTrue();
            return app;
        }

        throw new ArgumentOutOfRangeException(nameof(target));
    }

    // ── Submit ─────────────────────────────────────────────────────────────────

    [Fact]
    public void Submit_FromDraft_ShouldSucceedAndSetStatus()
    {
        var app = CreateDraft();
        var result = app.Submit();
        result.IsSuccess.Should().BeTrue();
        app.Status.Should().Be(LoanApplicationStatus.Submitted);
        app.SubmittedAt.Should().NotBeNull();
    }

    [Fact]
    public void Submit_FromDraft_ShouldRaiseLoanApplicationSubmittedEvent()
    {
        var app = CreateDraft();
        app.Submit();
        app.DomainEvents.Should().ContainSingle(e => e.GetType() == typeof(LoanApplicationSubmittedEvent));
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Submitted)]
    [InlineData(LoanApplicationStatus.UnderReview)]
    [InlineData(LoanApplicationStatus.Approved)]
    [InlineData(LoanApplicationStatus.Rejected)]
    [InlineData(LoanApplicationStatus.Disbursed)]
    [InlineData(LoanApplicationStatus.Closed)]
    public void Submit_FromNonDraft_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.Submit();
        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(SnapAccount.Shared.Domain.ErrorType.Conflict);
    }

    // ── AssignToBank ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData(LoanApplicationStatus.Submitted)]
    [InlineData(LoanApplicationStatus.UnderReview)]
    public void AssignToBank_FromSubmittedOrUnderReview_ShouldSucceed(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var bankId = Guid.NewGuid();
        var result = app.AssignToBank(bankId);
        result.IsSuccess.Should().BeTrue();
        app.AssignedBankId.Should().Be(bankId);
        app.Status.Should().Be(LoanApplicationStatus.UnderReview);
    }

    [Fact]
    public void AssignToBank_ShouldRaiseLoanAssignedToBankEvent()
    {
        var app = CreateAtStatus(LoanApplicationStatus.Submitted);
        var bankId = Guid.NewGuid();
        app.AssignToBank(bankId);
        app.DomainEvents.OfType<LoanAssignedToBankEvent>()
            .Should().ContainSingle(e => e.BankId == bankId);
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Draft)]
    [InlineData(LoanApplicationStatus.Approved)]
    [InlineData(LoanApplicationStatus.Rejected)]
    [InlineData(LoanApplicationStatus.Disbursed)]
    public void AssignToBank_FromInvalidStatus_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.AssignToBank(Guid.NewGuid());
        result.IsFailure.Should().BeTrue();
    }

    // ── Approve ────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(LoanApplicationStatus.UnderReview)]
    [InlineData(LoanApplicationStatus.DocsRequested)]
    public void Approve_FromUnderReviewOrDocsRequested_ShouldSucceed(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.Approve("BANK-REF-001");
        result.IsSuccess.Should().BeTrue();
        app.Status.Should().Be(LoanApplicationStatus.Approved);
        app.BankReferenceNo.Should().Be("BANK-REF-001");
    }

    [Fact]
    public void Approve_ShouldRaiseLoanApprovedEvent()
    {
        var app = CreateAtStatus(LoanApplicationStatus.UnderReview);
        app.Approve("BANK-REF-001");
        app.DomainEvents.OfType<LoanApprovedEvent>().Should().ContainSingle();
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Draft)]
    [InlineData(LoanApplicationStatus.Submitted)]
    [InlineData(LoanApplicationStatus.Approved)]
    [InlineData(LoanApplicationStatus.Rejected)]
    [InlineData(LoanApplicationStatus.Disbursed)]
    public void Approve_FromInvalidStatus_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.Approve("BANK-REF-001");
        result.IsFailure.Should().BeTrue();
    }

    // ── Reject ─────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(LoanApplicationStatus.UnderReview)]
    [InlineData(LoanApplicationStatus.DocsRequested)]
    public void Reject_FromUnderReviewOrDocsRequested_ShouldSucceed(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.Reject("Low credit score");
        result.IsSuccess.Should().BeTrue();
        app.Status.Should().Be(LoanApplicationStatus.Rejected);
    }

    [Fact]
    public void Reject_ShouldRaiseLoanRejectedEvent()
    {
        var app = CreateAtStatus(LoanApplicationStatus.UnderReview);
        app.Reject("Low credit score");
        app.DomainEvents.OfType<LoanRejectedEvent>()
            .Should().ContainSingle(e => e.Reason == "Low credit score");
    }

    // ── RequestDocuments ────────────────────────────────────────────────────────

    [Fact]
    public void RequestDocuments_FromUnderReview_ShouldSucceed()
    {
        var app = CreateAtStatus(LoanApplicationStatus.UnderReview);
        var result = app.RequestDocuments();
        result.IsSuccess.Should().BeTrue();
        app.Status.Should().Be(LoanApplicationStatus.DocsRequested);
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Draft)]
    [InlineData(LoanApplicationStatus.Submitted)]
    [InlineData(LoanApplicationStatus.Approved)]
    public void RequestDocuments_FromInvalidStatus_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.RequestDocuments();
        result.IsFailure.Should().BeTrue();
    }

    // ── RecordDisbursement ─────────────────────────────────────────────────────

    [Fact]
    public void RecordDisbursement_FromApproved_ShouldSucceedAndSetFields()
    {
        var app = CreateAtStatus(LoanApplicationStatus.Approved);
        var result = app.RecordDisbursement(5_00_000m, "DISB-REF-001");
        result.IsSuccess.Should().BeTrue();
        app.Status.Should().Be(LoanApplicationStatus.Disbursed);
        app.DisbursedAmount.Should().Be(5_00_000m);
        app.DisbursedAt.Should().NotBeNull();
        app.BankReferenceNo.Should().Be("DISB-REF-001");
    }

    [Fact]
    public void RecordDisbursement_ShouldRaiseLoanDisbursedEvent()
    {
        var app = CreateAtStatus(LoanApplicationStatus.Approved);
        app.RecordDisbursement(5_00_000m, "DISB-REF-001");
        app.DomainEvents.OfType<LoanDisbursedEvent>()
            .Should().ContainSingle(e => e.DisbursedAmount == 5_00_000m);
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Draft)]
    [InlineData(LoanApplicationStatus.Submitted)]
    [InlineData(LoanApplicationStatus.UnderReview)]
    [InlineData(LoanApplicationStatus.Rejected)]
    [InlineData(LoanApplicationStatus.Disbursed)]
    public void RecordDisbursement_FromInvalidStatus_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.RecordDisbursement(5_00_000m, "DISB-REF-001");
        result.IsFailure.Should().BeTrue();
    }

    // ── RecordDisbursementFailed ────────────────────────────────────────────────

    [Fact]
    public void RecordDisbursementFailed_FromApproved_ShouldSucceed()
    {
        var app = CreateAtStatus(LoanApplicationStatus.Approved);
        var result = app.RecordDisbursementFailed("Bank API timeout");
        result.IsSuccess.Should().BeTrue();
        // Status does NOT change — app stays Approved for retry
        app.Status.Should().Be(LoanApplicationStatus.Approved);
    }

    [Fact]
    public void RecordDisbursementFailed_ShouldRaiseLoanDisbursementFailedEvent()
    {
        var app = CreateAtStatus(LoanApplicationStatus.Approved);
        app.RecordDisbursementFailed("Bank API timeout");
        app.DomainEvents.OfType<LoanDisbursementFailedEvent>().Should().ContainSingle();
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Draft)]
    [InlineData(LoanApplicationStatus.Submitted)]
    [InlineData(LoanApplicationStatus.Disbursed)]
    public void RecordDisbursementFailed_FromInvalidStatus_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.RecordDisbursementFailed("reason");
        result.IsFailure.Should().BeTrue();
    }

    // ── RecordDisbursementReversed ──────────────────────────────────────────────

    [Fact]
    public void RecordDisbursementReversed_FromDisbursed_ShouldRevertToApproved()
    {
        var app = CreateAtStatus(LoanApplicationStatus.Disbursed);
        var result = app.RecordDisbursementReversed("Fraud detected");
        result.IsSuccess.Should().BeTrue();
        app.Status.Should().Be(LoanApplicationStatus.Approved);
    }

    [Fact]
    public void RecordDisbursementReversed_ShouldRaiseLoanDisbursementReversedEvent()
    {
        var app = CreateAtStatus(LoanApplicationStatus.Disbursed);
        app.RecordDisbursementReversed("Fraud detected");
        app.DomainEvents.OfType<LoanDisbursementReversedEvent>().Should().ContainSingle();
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Approved)]
    [InlineData(LoanApplicationStatus.UnderReview)]
    public void RecordDisbursementReversed_FromInvalidStatus_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.RecordDisbursementReversed("reason");
        result.IsFailure.Should().BeTrue();
    }

    // ── Close ──────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(LoanApplicationStatus.Disbursed)]
    [InlineData(LoanApplicationStatus.Rejected)]
    public void Close_FromDisbursedOrRejected_ShouldSucceed(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.Close();
        result.IsSuccess.Should().BeTrue();
        app.Status.Should().Be(LoanApplicationStatus.Closed);
    }

    [Theory]
    [InlineData(LoanApplicationStatus.Draft)]
    [InlineData(LoanApplicationStatus.Submitted)]
    [InlineData(LoanApplicationStatus.UnderReview)]
    [InlineData(LoanApplicationStatus.Approved)]
    public void Close_FromInvalidStatus_ShouldFail(LoanApplicationStatus status)
    {
        var app = CreateAtStatus(status);
        var result = app.Close();
        result.IsFailure.Should().BeTrue();
    }
}
