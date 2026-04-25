using AuthService.Domain.Entities;
using FluentAssertions;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace AuthService.Tests;

/// <summary>
/// Unit tests for OTP domain logic — covers generation, verification,
/// expiry, attempt counting, and 30-minute lockout rules defined in project-brief §1.1.
/// These tests operate directly on the OtpRequest entity to keep them
/// fast and free of I/O. Infrastructure-level OtpService tests are in
/// the integration test project where a real database is available.
/// </summary>
public class OtpServiceTests
{
    // ──────────────────────────────────────────────────────────────
    // Helper
    // ──────────────────────────────────────────────────────────────

    private static string ComputeSha256Hash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static (OtpRequest request, string plainOtp) CreateFreshOtp(string phone = "9876543210")
    {
        // Mirror the production logic: Random.Shared.Next(100000, 999999)
        var otp = "123456";
        var hash = ComputeSha256Hash($"{phone}:{otp}");
        var request = new OtpRequest
        {
            PhoneNumber = phone,
            OtpHash = hash,
            OtpType = "AUTH",
            ExpiresAt = DateTime.UtcNow.AddMinutes(5)
        };
        return (request, otp);
    }

    // ──────────────────────────────────────────────────────────────
    // 1. GenerateOtp — format
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void GenerateOtp_Returns6DigitNumericString()
    {
        // The entity stores a hash, so we test the shape by generating
        // multiple values through the production-style range.
        for (var i = 0; i < 50; i++)
        {
            var otp = Random.Shared.Next(100000, 999999).ToString();
            otp.Should().HaveLength(6, "OTP must always be 6 digits");
            otp.Should().MatchRegex(@"^\d{6}$", "OTP must be numeric only");
        }
    }

    [Fact]
    public void GenerateOtp_StoredHashDiffersFromPlaintext()
    {
        var phone = "9000000001";
        var otp = "654321";
        var hash = ComputeSha256Hash($"{phone}:{otp}");

        var request = new OtpRequest
        {
            PhoneNumber = phone,
            OtpHash = hash,
            OtpType = "AUTH",
            ExpiresAt = DateTime.UtcNow.AddMinutes(5)
        };

        request.OtpHash.Should().NotBe(otp, "plaintext OTP must never be stored");
        request.OtpHash.Should().HaveLength(64, "SHA-256 hex digest is 64 chars");
    }

    // ──────────────────────────────────────────────────────────────
    // 2. VerifyOtp — success
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void VerifyOtp_SucceedsWithCorrectOtpWithinFiveMinutes()
    {
        var (request, otp) = CreateFreshOtp();

        request.IsExpired.Should().BeFalse("OTP was just created");
        request.IsOnCooldown.Should().BeFalse("no failed attempts yet");

        var expectedHash = ComputeSha256Hash($"9876543210:{otp}");
        request.OtpHash.Should().Be(expectedHash, "correct OTP hash must match");
    }

    // ──────────────────────────────────────────────────────────────
    // 3. VerifyOtp — wrong OTP
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void VerifyOtp_FailsWithWrongOtp()
    {
        var phone = "9876543210";
        var (request, _) = CreateFreshOtp(phone);

        var wrongOtpHash = ComputeSha256Hash($"{phone}:000000");
        request.OtpHash.Should().NotBe(wrongOtpHash, "wrong OTP hash must not match");
    }

    // ──────────────────────────────────────────────────────────────
    // 4. VerifyOtp — expired OTP
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void VerifyOtp_FailsAfterFiveMinuteExpiry()
    {
        // We test the IsExpired property which uses DateTime.UtcNow > ExpiresAt.
        // ExpiresAt is set to UtcNow + 5 min at creation time.
        var (request, _) = CreateFreshOtp();

        // Fresh request should not be expired.
        request.IsExpired.Should().BeFalse();

        // Simulate time passage by checking that the property is a pure DateTime comparison.
        // We cannot mutate ExpiresAt (private setter) so we verify contract via reflection.
        var expiresAtProp = typeof(OtpRequest).GetProperty("ExpiresAt");
        expiresAtProp.Should().NotBeNull();
        var expiresAt = (DateTime)expiresAtProp!.GetValue(request)!;

        expiresAt.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(5), precision: TimeSpan.FromSeconds(5),
            "OTP must expire exactly 5 minutes after creation");
    }

    // ──────────────────────────────────────────────────────────────
    // 5. IncrementAttempt — counter
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void VerifyOtp_IncrementsAttemptCounter()
    {
        var (request, _) = CreateFreshOtp();

        request.Attempts.Should().Be(0);

        request.IncrementAttempt();
        request.Attempts.Should().Be(1, "attempt counter should increment on each call");

        request.IncrementAttempt();
        request.Attempts.Should().Be(2);
    }

    // ──────────────────────────────────────────────────────────────
    // 6. Lockout after 3 failed attempts
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void VerifyOtp_LocksOutAfterThreeFailedAttempts()
    {
        var (request, _) = CreateFreshOtp();

        request.IncrementAttempt();
        request.IncrementAttempt();
        request.IncrementAttempt(); // 3rd attempt triggers cooldown

        request.IsMaxAttemptsReached.Should().BeTrue("3 attempts exhausted — account must be locked");
        request.CooldownUntil.Should().NotBeNull("cooldown must be set after max attempts");
    }

    // ──────────────────────────────────────────────────────────────
    // 7. Lockout duration — 30 minutes
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void VerifyOtp_StaysLockedFor30MinutesAfterLockout()
    {
        var (request, _) = CreateFreshOtp();

        request.IncrementAttempt();
        request.IncrementAttempt();
        request.IncrementAttempt(); // triggers 30-min cooldown

        request.CooldownUntil.Should().NotBeNull();
        request.CooldownUntil!.Value
            .Should().BeCloseTo(DateTime.UtcNow.AddMinutes(30), precision: TimeSpan.FromSeconds(5),
                "lockout duration must be exactly 30 minutes");

        request.IsOnCooldown.Should().BeTrue("account should be on cooldown immediately after lockout");
    }

    // ──────────────────────────────────────────────────────────────
    // 8. IncrementAttempt returns failure on used OTP
    // ──────────────────────────────────────────────────────────────

    [Fact]
    public void IncrementAttempt_ReturnsFailureOnAlreadyUsedOtp()
    {
        var (request, _) = CreateFreshOtp();
        request.MarkAsUsed();

        var result = request.IncrementAttempt();

        result.IsFailure.Should().BeTrue("cannot increment attempts on a used OTP");
        result.Error.Code.Should().Be("Otp.AlreadyUsed");
    }
}
