using AuthService.Application.Devices.Queries.GetMyApprovalStatus;
using AuthService.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for GetMyApprovalStatusQuery — GAP-047 mobile residual.
/// Validates:
/// - ApprovalStatusStrings constants mirror DeviceApprovalStatus enum values (no drift).
/// - DeviceApprovalRequest.IsActive logic (used by the handler to compute EXPIRED-by-clock).
/// - Query validator (no params — always valid).
/// Category=Unit — no external dependencies.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GetMyApprovalStatusTests
{
    // ── Validator ──────────────────────────────────────────────────────────────

    [Fact]
    public void GetMyApprovalStatusQueryValidator_IsAlwaysValid()
    {
        var validator = new GetMyApprovalStatusQueryValidator();
        var result = validator.Validate(new GetMyApprovalStatusQuery());

        result.IsValid.Should().BeTrue("query has no parameters to validate");
    }

    // ── ApprovalStatusStrings constants ───────────────────────────────────────

    [Fact]
    public void ApprovalStatusStrings_Pending_MatchesExpectedValue()
        => ApprovalStatusStrings.Pending.Should().Be("PENDING");

    [Fact]
    public void ApprovalStatusStrings_Approved_MatchesExpectedValue()
        => ApprovalStatusStrings.Approved.Should().Be("APPROVED");

    [Fact]
    public void ApprovalStatusStrings_Denied_MatchesExpectedValue()
        => ApprovalStatusStrings.Denied.Should().Be("DENIED");

    [Fact]
    public void ApprovalStatusStrings_Expired_MatchesExpectedValue()
        => ApprovalStatusStrings.Expired.Should().Be("EXPIRED");

    [Fact]
    public void ApprovalStatusStrings_Unknown_MatchesExpectedValue()
        => ApprovalStatusStrings.Unknown.Should().Be("UNKNOWN");

    // ── DeviceApprovalRequest.IsActive — underpins handler EXPIRED-by-clock ──

    [Fact]
    public void DeviceApprovalRequest_IsActive_TrueForFreshRequest()
    {
        var req = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "device-id", "My Phone", "ANDROID",
            expiryMinutes: 10);

        req.IsActive.Should().BeTrue("a freshly created pending request is active");
        req.Status.Should().Be(DeviceApprovalStatus.Pending);
    }

    [Fact]
    public void DeviceApprovalRequest_IsActive_FalseAfterExpiry()
    {
        // Create with an already-elapsed expiry window
        var req = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "device-id", "My Phone", "ANDROID",
            expiryMinutes: 0); // 0-minute expiry → already expired

        // IsActive checks DateTime.UtcNow < ExpiresAt — with 0 min this is false
        req.IsActive.Should().BeFalse("0-minute expiry means already expired");
    }

    [Fact]
    public void DeviceApprovalRequest_IsActive_FalseAfterApproval()
    {
        var req = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "device-id", "My Phone", "ANDROID",
            expiryMinutes: 10);

        var approveResult = req.Approve(Guid.NewGuid());

        approveResult.IsSuccess.Should().BeTrue();
        req.IsActive.Should().BeFalse("approved request is no longer active");
        req.Status.Should().Be(DeviceApprovalStatus.Approved);
    }

    [Fact]
    public void DeviceApprovalRequest_IsActive_FalseAfterDenial()
    {
        var req = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "device-id", "My Phone", "ANDROID",
            expiryMinutes: 10);

        var denyResult = req.Deny(Guid.NewGuid(), reason: "Unrecognised device");

        denyResult.IsSuccess.Should().BeTrue();
        req.IsActive.Should().BeFalse("denied request is no longer active");
        req.Status.Should().Be(DeviceApprovalStatus.Denied);
    }

    // ── MyApprovalStatusResponse record shape ─────────────────────────────────

    [Fact]
    public void MyApprovalStatusResponse_CanBeConstructed()
    {
        var now = DateTime.UtcNow;
        var response = new MyApprovalStatusResponse(
            ApprovalRequestId: Guid.NewGuid(),
            Status:            ApprovalStatusStrings.Pending,
            DecidedAt:         null,
            ExpiresAt:         now.AddMinutes(10),
            Mode:              "NOTIFY_ONLY");

        response.Status.Should().Be("PENDING");
        response.DecidedAt.Should().BeNull();
        response.Mode.Should().Be("NOTIFY_ONLY");
    }

    [Fact]
    public void MyApprovalStatusResponse_Unknown_HasNullRequestId()
    {
        var response = new MyApprovalStatusResponse(
            ApprovalRequestId: null,
            Status:            ApprovalStatusStrings.Unknown,
            DecidedAt:         null,
            ExpiresAt:         null,
            Mode:              "ENFORCE");

        response.ApprovalRequestId.Should().BeNull("UNKNOWN status means no request found");
        response.Mode.Should().Be("ENFORCE");
    }

    [Theory]
    [InlineData("ENFORCE")]
    [InlineData("NOTIFY_ONLY")]
    public void MyApprovalStatusResponse_AcceptsBothModes(string mode)
    {
        var response = new MyApprovalStatusResponse(null, "UNKNOWN", null, null, mode);
        response.Mode.Should().Be(mode);
    }
}
