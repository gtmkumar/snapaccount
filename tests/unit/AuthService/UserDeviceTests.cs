using AuthService.Domain.Entities;
using FluentAssertions;
using SnapAccount.Shared.Domain;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Tests for the User aggregate — specifically the device-binding rules.
/// Project brief §1.3: max 2 active devices per account.
/// The User.AddDevice / RemoveDevice methods are the domain boundary.
/// </summary>
public class UserDeviceTests
{
    private static User CreateUser()
    {
        return new User { PhoneNumber = "9876543210" };
    }

    private static Result AddDevice(User user, string deviceId)
        => user.AddDevice(
            deviceId,
            $"Device-{deviceId}",
            "ANDROID",
            "14",
            "1.0.0",
            $"fcm-{deviceId}");

    // ──────────────────────────────────────────────────────────────
    // Adding first and second device
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void AddDevice_FirstDevice_Succeeds()
    {
        var user = CreateUser();

        var result = AddDevice(user, "device-001");

        result.IsSuccess.Should().BeTrue("adding the first device must succeed");
        user.Devices.Count.Should().Be(1);
    }

    [Fact]
    public void AddDevice_SecondDevice_Succeeds()
    {
        var user = CreateUser();
        AddDevice(user, "device-001");

        var result = AddDevice(user, "device-002");

        result.IsSuccess.Should().BeTrue("adding a second device must succeed (max is 2)");
        user.Devices.Count.Should().Be(2);
    }

    // ──────────────────────────────────────────────────────────────
    // Adding third device — must fail
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void AddDevice_ThirdDevice_FailsWithDomainError()
    {
        var user = CreateUser();
        AddDevice(user, "device-001");
        AddDevice(user, "device-002");

        var result = AddDevice(user, "device-003");

        result.IsFailure.Should().BeTrue("adding a 3rd device must fail — max 2 allowed");
        result.Error.Code.Should().Be("User.MaxDevicesReached",
            "error code must clearly indicate the device cap was hit");
    }

    // ──────────────────────────────────────────────────────────────
    // Remove a device then add a new one
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void RemoveDevice_ThenAddNew_Succeeds()
    {
        var user = CreateUser();
        AddDevice(user, "device-001");
        AddDevice(user, "device-002");

        // Remove one device
        var deviceToRemove = user.Devices.First();
        var removeResult = user.RemoveDevice(deviceToRemove.Id);
        removeResult.IsSuccess.Should().BeTrue("removing an existing device must succeed");

        // Now we should be able to add a third device
        var addResult = AddDevice(user, "device-003");
        addResult.IsSuccess.Should().BeTrue("after removing a device, a new one can be added");

        // Only 1 device should be active (soft-deleted devices are still in the collection)
        var activeDevices = user.Devices.Count(d => d.IsActive && d.DeletedAt == null);
        activeDevices.Should().Be(2, "two devices should be active after remove + add");
    }

    [Fact]
    public void RemoveDevice_NonExistentDeviceId_Fails()
    {
        var user = CreateUser();
        AddDevice(user, "device-001");

        var fakeId = Guid.NewGuid();
        var result = user.RemoveDevice(fakeId);

        result.IsFailure.Should().BeTrue("removing a non-existent device must fail");
        result.Error.Code.Should().Contain("NotFound");
    }

    // ──────────────────────────────────────────────────────────────
    // Duplicate device binding
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void AddDevice_DuplicateDeviceId_Fails()
    {
        var user = CreateUser();
        AddDevice(user, "device-001");

        var result = AddDevice(user, "device-001"); // same ID again

        result.IsFailure.Should().BeTrue("binding the same device twice must be rejected");
        result.Error.Code.Should().Be("User.DeviceAlreadyBound");
    }

    // ──────────────────────────────────────────────────────────────
    // Domain events
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void AddDevice_RaisesDeviceAddedDomainEvent()
    {
        var user = CreateUser();
        user.ClearDomainEvents(); // clear registration event

        AddDevice(user, "device-001");

        user.DomainEvents.Should().ContainSingle(e => e.GetType().Name == "DeviceAddedEvent",
            "adding a device must publish a DeviceAddedEvent");
    }
}
