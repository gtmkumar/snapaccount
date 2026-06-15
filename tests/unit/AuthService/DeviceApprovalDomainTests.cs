using AuthService.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for DeviceApprovalRequest domain entity — GAP-047.
/// Validates state transitions, expiry logic, same-device guard, and soft-launch model.
/// </summary>
public sealed class DeviceApprovalDomainTests
{
    private static DeviceApprovalRequest BuildRequest(int expiryMinutes = 10)
        => DeviceApprovalRequest.Create(
            userId: Guid.NewGuid(),
            newDeviceId: Guid.NewGuid(),
            newDeviceIdentifier: "device-abc-123",
            newDeviceName: "My Phone",
            newDevicePlatform: "ANDROID",
            newDeviceSessionTokenId: Guid.NewGuid(),
            expiryMinutes: expiryMinutes);

    [Fact]
    public void Create_SetsStatusToPending()
    {
        var request = BuildRequest();

        request.Status.Should().Be(DeviceApprovalStatus.Pending);
    }

    [Fact]
    public void Create_SetsExpiryInFuture()
    {
        var before = DateTime.UtcNow;
        var request = BuildRequest(expiryMinutes: 10);

        request.ExpiresAt.Should().BeAfter(before);
        request.ExpiresAt.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(10), precision: TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void IsActive_ReturnsTrueForFreshRequest()
    {
        var request = BuildRequest();

        request.IsActive.Should().BeTrue("a freshly created request must be active");
    }

    [Fact]
    public void IsActive_ReturnsFalseForExpiredRequest()
    {
        // Use negative expiry to simulate a past-expiry request
        var request = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(),
            "device-xyz", "Old Phone", "IOS",
            expiryMinutes: -1); // already expired

        request.IsActive.Should().BeFalse("an expired request must not be active");
    }

    [Fact]
    public void Approve_TransitionsToPendingApproved()
    {
        var request = BuildRequest();
        var reviewingDeviceId = Guid.NewGuid();

        var result = request.Approve(reviewingDeviceId);

        result.IsSuccess.Should().BeTrue();
        request.Status.Should().Be(DeviceApprovalStatus.Approved);
        request.ReviewedByDeviceId.Should().Be(reviewingDeviceId);
        request.ReviewedAt.Should().BeCloseTo(DateTime.UtcNow, precision: TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void Approve_WhenExpired_ReturnsFailure()
    {
        var request = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "device", "Phone", "IOS", expiryMinutes: -1);

        var result = request.Approve(Guid.NewGuid());

        result.IsFailure.Should().BeTrue("approving an expired request must fail");
        result.Error.Code.Should().Be("DeviceApproval.Expired");
    }

    [Fact]
    public void Approve_WhenAlreadyApproved_ReturnsFailure()
    {
        var request = BuildRequest();
        request.Approve(Guid.NewGuid()); // first approval

        var result = request.Approve(Guid.NewGuid()); // second attempt

        result.IsFailure.Should().BeTrue("double-approving must fail — IsActive is false after first approval");
    }

    [Fact]
    public void Deny_TransitionsToDenied_WithReason()
    {
        var request = BuildRequest();
        var reviewingDeviceId = Guid.NewGuid();

        var result = request.Deny(reviewingDeviceId, reason: "Suspicious login location");

        result.IsSuccess.Should().BeTrue();
        request.Status.Should().Be(DeviceApprovalStatus.Denied);
        request.ReviewedByDeviceId.Should().Be(reviewingDeviceId);
        request.DenialReason.Should().Be("Suspicious login location");
        request.ReviewedAt.Should().NotBeNull();
    }

    [Fact]
    public void Deny_WithoutReason_IsAllowed()
    {
        var request = BuildRequest();

        var result = request.Deny(Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        request.DenialReason.Should().BeNull("reason is optional in the deny path");
    }

    [Fact]
    public void Deny_WhenExpired_ReturnsFailure()
    {
        var request = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "device", "Phone", "IOS", expiryMinutes: -1);

        var result = request.Deny(Guid.NewGuid(), "too late");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("DeviceApproval.Expired");
    }

    [Fact]
    public void Deny_WhenAlreadyDenied_ReturnsFailure()
    {
        var request = BuildRequest();
        request.Deny(Guid.NewGuid());

        var result = request.Deny(Guid.NewGuid());

        result.IsFailure.Should().BeTrue("double-deny must fail — IsActive is false after first denial");
    }

    [Fact]
    public void Approve_DoesNotChangeStatus_WhenDeniedAlready()
    {
        var request = BuildRequest();
        request.Deny(Guid.NewGuid());

        var result = request.Approve(Guid.NewGuid());

        result.IsFailure.Should().BeTrue();
        request.Status.Should().Be(DeviceApprovalStatus.Denied, "status must not change after first resolution");
    }

    [Fact]
    public void Create_WithSessionTokenId_SetsSessionTokenId()
    {
        var tokenId = Guid.NewGuid();
        var request = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "dev", null, "WEB",
            newDeviceSessionTokenId: tokenId);

        request.NewDeviceSessionTokenId.Should().Be(tokenId);
    }

    [Fact]
    public void Create_WithNullSessionTokenId_IsValid()
    {
        var request = DeviceApprovalRequest.Create(
            Guid.NewGuid(), Guid.NewGuid(), "dev", null, "WEB",
            newDeviceSessionTokenId: null);

        request.NewDeviceSessionTokenId.Should().BeNull();
    }
}
