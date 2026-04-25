using FluentAssertions;
using LoanService.Domain.ValueObjects;
using System.Security.Cryptography;
using Xunit;

namespace LoanService.Tests.Domain;

/// <summary>
/// Unit tests for ConsentSignature value object.
/// Covers P6-HANDOFF-26 HMAC-SHA256 signature contract.
/// </summary>
public sealed class ConsentSignatureTests
{
    private static readonly byte[] _testKey = RandomNumberGenerator.GetBytes(32);

    [Fact]
    public void Compute_ShouldReturn32ByteHash()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var sig = ConsentSignature.Compute(userId, appId, "v1.0", DateTime.UtcNow, _testKey);
        sig.Hash.Should().HaveCount(32);
    }

    [Fact]
    public void Compute_SamInputs_ShouldProduceSameHash()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);

        var sig1 = ConsentSignature.Compute(userId, appId, "v1.2.0", signedAt, _testKey);
        var sig2 = ConsentSignature.Compute(userId, appId, "v1.2.0", signedAt, _testKey);

        sig1.Hash.Should().Equal(sig2.Hash);
    }

    [Fact]
    public void Compute_DifferentUsers_ShouldProduceDifferentHashes()
    {
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);

        var sig1 = ConsentSignature.Compute(Guid.NewGuid(), appId, "v1.0", signedAt, _testKey);
        var sig2 = ConsentSignature.Compute(Guid.NewGuid(), appId, "v1.0", signedAt, _testKey);

        sig1.Hash.Should().NotEqual(sig2.Hash);
    }

    [Fact]
    public void Compute_DifferentVersions_ShouldProduceDifferentHashes()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);

        var sig1 = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);
        var sig2 = ConsentSignature.Compute(userId, appId, "v2.0", signedAt, _testKey);

        sig1.Hash.Should().NotEqual(sig2.Hash);
    }

    [Fact]
    public void Compute_DifferentKeys_ShouldProduceDifferentHashes()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);
        var otherKey = RandomNumberGenerator.GetBytes(32);

        var sig1 = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);
        var sig2 = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, otherKey);

        sig1.Hash.Should().NotEqual(sig2.Hash);
    }

    [Fact]
    public void Verify_CorrectInputs_ShouldReturnTrue()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);
        var sig = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);

        var isValid = ConsentSignature.Verify(sig.Hash, userId, appId, "v1.0", signedAt, _testKey);

        isValid.Should().BeTrue();
    }

    [Fact]
    public void Verify_TamperedHash_ShouldReturnFalse()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);
        var sig = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);

        var tampered = (byte[])sig.Hash.Clone();
        tampered[0] ^= 0xFF; // Flip bits in first byte

        var isValid = ConsentSignature.Verify(tampered, userId, appId, "v1.0", signedAt, _testKey);
        isValid.Should().BeFalse();
    }

    [Fact]
    public void Verify_WrongVersion_ShouldReturnFalse()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);
        var sig = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);

        var isValid = ConsentSignature.Verify(sig.Hash, userId, appId, "v2.0", signedAt, _testKey);
        isValid.Should().BeFalse();
    }

    [Fact]
    public void Verify_WrongKey_ShouldReturnFalse()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);
        var sig = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);

        var wrongKey = RandomNumberGenerator.GetBytes(32);
        var isValid = ConsentSignature.Verify(sig.Hash, userId, appId, "v1.0", signedAt, wrongKey);
        isValid.Should().BeFalse();
    }

    [Fact]
    public void ConsentSignature_ValueObjectEquality_ShouldWorkOnHash()
    {
        var userId = Guid.NewGuid();
        var appId = Guid.NewGuid();
        var signedAt = new DateTime(2026, 4, 1, 10, 0, 0, DateTimeKind.Utc);

        var sig1 = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);
        var sig2 = ConsentSignature.Compute(userId, appId, "v1.0", signedAt, _testKey);

        sig1.Should().Be(sig2);
    }
}
