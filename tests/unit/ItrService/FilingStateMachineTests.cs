using ItrService.Domain.Entities;
using ItrService.Domain.Events;
using SnapAccount.Shared.Domain;

namespace ItrService.Tests;

/// <summary>
/// Unit tests for <see cref="Filing"/> domain entity state machine.
/// Phase 6D.
/// </summary>
[Trait("Category", "Unit")]
public sealed class FilingStateMachineTests
{
    private static Filing CreateFiling(string regime = "NEW")
        => Filing.Create(Guid.NewGuid(), "AY2025-26", "ITR-1", regime);

    // ── Initial State ────────────────────────────────────────────────────────

    [Fact]
    public void Create_StatusIsDraft()
    {
        var filing = CreateFiling();
        filing.Status.Should().Be("DRAFT");
        filing.TaxSlabVersionId.Should().BeNull();
        filing.ComputationJsonb.Should().BeNull();
    }

    // ── PinComputation ───────────────────────────────────────────────────────

    [Fact]
    public void PinComputation_StoresAllFields()
    {
        var filing = CreateFiling();
        var slabVersionId = Guid.NewGuid();
        filing.PinComputation(slabVersionId, "{}", "abc123");

        filing.TaxSlabVersionId.Should().Be(slabVersionId);
        filing.ComputationJsonb.Should().Be("{}");
        filing.ComputationHash.Should().Be("abc123");
    }

    [Fact]
    public void PinComputation_RaisesTaxComputationCompletedEvent()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash1");
        filing.DomainEvents.Should().ContainSingle(e => e is TaxComputationCompletedEvent);
    }

    // ── Submit for CA Review ─────────────────────────────────────────────────

    [Fact]
    public void SubmitForCaReview_WithoutComputation_Fails()
    {
        var filing = CreateFiling();
        var result = filing.SubmitForCaReview();
        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Contain("NoComputation");
    }

    [Fact]
    public void SubmitForCaReview_AfterPinning_Succeeds()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash");
        var result = filing.SubmitForCaReview();
        result.IsSuccess.Should().BeTrue();
        filing.Status.Should().Be("UNDER_CA_REVIEW");
    }

    [Fact]
    public void SubmitForCaReview_AlreadyUnderReview_Fails()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash");
        filing.SubmitForCaReview();
        var result = filing.SubmitForCaReview();
        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Contain("InvalidState");
    }

    // ── CA Approve ───────────────────────────────────────────────────────────

    [Fact]
    public void ApproveByCa_FromUnderCaReview_Succeeds()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash");
        filing.SubmitForCaReview();
        var caId = Guid.NewGuid();
        var result = filing.ApproveByCa(caId);
        result.IsSuccess.Should().BeTrue();
        filing.Status.Should().Be("USER_APPROVED");
        filing.ReviewedByCaId.Should().Be(caId);
    }

    [Fact]
    public void ApproveByCa_FromDraft_Fails()
    {
        var filing = CreateFiling();
        var result = filing.ApproveByCa(Guid.NewGuid());
        result.IsFailure.Should().BeTrue();
    }

    // ── CA Reject ────────────────────────────────────────────────────────────

    [Fact]
    public void RejectByCa_FromUnderCaReview_SetsRejectedStatus()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash");
        filing.SubmitForCaReview();
        var caId = Guid.NewGuid();
        var result = filing.RejectByCa(caId, "Incorrect income details.");
        result.IsSuccess.Should().BeTrue();
        filing.Status.Should().Be("REJECTED_BY_CA");
        filing.CaRejectionReason.Should().Be("Incorrect income details.");
    }

    // ── Mark Filed ───────────────────────────────────────────────────────────

    [Fact]
    public void MarkFiled_FromUserApproved_Succeeds()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash");
        filing.SubmitForCaReview();
        filing.ApproveByCa(Guid.NewGuid());
        var result = filing.MarkFiled("ACK-2025-001");
        result.IsSuccess.Should().BeTrue();
        filing.Status.Should().Be("FILED");
        filing.AcknowledgementNumber.Should().Be("ACK-2025-001");
        filing.FiledAt.Should().NotBeNull();
    }

    [Fact]
    public void MarkFiled_RaisesFilingFiledEvent()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash");
        filing.SubmitForCaReview();
        filing.ApproveByCa(Guid.NewGuid());
        filing.MarkFiled("ACK-2025-001");
        filing.DomainEvents.Should().Contain(e => e is FilingFiledEvent);
    }

    // ── E-Verify ─────────────────────────────────────────────────────────────

    [Fact]
    public void MarkEVerified_FromFiled_Succeeds()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), "{}", "hash");
        filing.SubmitForCaReview();
        filing.ApproveByCa(Guid.NewGuid());
        filing.MarkFiled("ACK-001");
        var result = filing.MarkEVerified("EVC");
        result.IsSuccess.Should().BeTrue();
        filing.Status.Should().Be("E_VERIFIED");
        filing.EVerificationMethod.Should().Be("EVC");
    }

    [Fact]
    public void MarkEVerified_NotFromFiled_Fails()
    {
        var filing = CreateFiling();
        var result = filing.MarkEVerified("EVC");
        result.IsFailure.Should().BeTrue();
    }

    // ── DPDP Anonymization ───────────────────────────────────────────────────

    [Fact]
    public void Anonymize_NullsComputationJsonb()
    {
        var filing = CreateFiling();
        filing.PinComputation(Guid.NewGuid(), """{"income":1200000}""", "hash");
        filing.Anonymize("DPDP_RIGHT_TO_ERASURE");
        filing.ComputationJsonb.Should().BeNull();
        filing.AnonymizationReason.Should().Be("DPDP_RIGHT_TO_ERASURE");
        filing.AnonymizedAt.Should().NotBeNull();
    }
}
