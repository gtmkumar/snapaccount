using System;
using System.Security.Cryptography;
using System.Text;
using AuthService.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

// IHostEnvironment.IsDevelopment() is an extension from Microsoft.Extensions.Hosting.
// The mock sets EnvironmentName; the extension reads that property.

namespace AuthService.Tests;

/// <summary>
/// Unit tests for <see cref="AesAiKeyProtector"/> — SEC-AI-02 H-01 GCM migration.
/// Tests cover:
/// <list type="bullet">
///   <item>GCM round-trip (new default path)</item>
///   <item>Tamper detection (flipped ciphertext byte must throw, not silently decrypt)</item>
///   <item>Legacy CBC read-back (backward compatibility with existing stored keys)</item>
///   <item>Fail-fast in non-Development when key is absent (M-05)</item>
///   <item>Dev fallback allowed in Development environment</item>
/// </list>
/// </summary>
[Trait("Category", "Unit")]
public sealed class AesAiKeyProtectorTests
{
    // 32 bytes, base64-encoded — safe test key.
    private const string TestKeyBase64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    private static AesAiKeyProtector BuildProtector(
        string? keyBase64 = TestKeyBase64,
        bool isDevelopment = false)
    {
        var configData = new System.Collections.Generic.Dictionary<string, string?>();
        if (keyBase64 is not null)
            configData["Ai:KeyEncryptionKey"] = keyBase64;

        var config = new ConfigurationBuilder().AddInMemoryCollection(configData).Build();

        // IHostEnvironment.IsDevelopment() is an extension method (HostEnvironmentEnvExtensions)
        // that reads EnvironmentName. Mock the property directly; the extension uses it internally.
        var envMock = new Mock<IHostEnvironment>();
        envMock.Setup(e => e.EnvironmentName)
            .Returns(isDevelopment ? Environments.Development : Environments.Production);

        return new AesAiKeyProtector(config, envMock.Object, NullLogger<AesAiKeyProtector>.Instance);
    }

    // ── Round-trip ─────────────────────────────────────────────────────────────

    [Fact]
    public void Encrypt_ThenDecrypt_ReturnsOriginalPlaintext()
    {
        var protector = BuildProtector();
        const string original = "sk-gemini-test-api-key-12345";

        var encrypted = protector.Encrypt(original);
        var decrypted = protector.Decrypt(encrypted);

        decrypted.Should().Be(original);
    }

    [Fact]
    public void Encrypt_SameInput_ProducesDifferentCiphertexts_DueToRandomNonce()
    {
        // GCM uses a random 12-byte nonce per encryption — same plaintext ≠ same ciphertext.
        var protector = BuildProtector();
        const string plaintext = "test-api-key";

        var cipher1 = protector.Encrypt(plaintext);
        var cipher2 = protector.Encrypt(plaintext);

        cipher1.Should().NotBe(cipher2,
            "GCM nonces are random; identical plaintext must produce distinct ciphertexts");
    }

    [Fact]
    public void Encrypt_OutputStartsWithGcmVersionByte()
    {
        // v2 (GCM) format: Base64( 0x02 || Nonce(12) || Tag(16) || Ciphertext )
        var protector = BuildProtector();
        var encrypted = protector.Encrypt("api-key");
        var bytes = Convert.FromBase64String(encrypted);

        bytes[0].Should().Be(0x02, "GCM version byte must be 0x02");
        bytes.Length.Should().BeGreaterThan(1 + 12 + 16,
            "minimum GCM payload: 1 (version) + 12 (nonce) + 16 (tag) + ≥1 (ciphertext)");
    }

    // ── Tamper detection ───────────────────────────────────────────────────────

    [Fact]
    public void Decrypt_TamperedCiphertext_ThrowsCryptographicException()
    {
        // SEC-AI-02 H-01: GCM authentication tag must detect any ciphertext modification.
        var protector = BuildProtector();
        var encrypted = protector.Encrypt("sensitive-api-key");
        var bytes = Convert.FromBase64String(encrypted);

        // Flip one byte in the ciphertext portion (after version(1) + nonce(12) + tag(16)).
        var tamperIndex = 1 + 12 + 16; // first ciphertext byte
        bytes[tamperIndex] ^= 0xFF;
        var tampered = Convert.ToBase64String(bytes);

        var act = () => protector.Decrypt(tampered);
        act.Should().Throw<CryptographicException>(
            "GCM authentication tag verification must fail on any ciphertext modification");
    }

    [Fact]
    public void Decrypt_TamperedTag_ThrowsCryptographicException()
    {
        // Flip one byte in the authentication tag.
        var protector = BuildProtector();
        var encrypted = protector.Encrypt("api-key-tamper-tag-test");
        var bytes = Convert.FromBase64String(encrypted);

        // Tag starts at offset 1 + 12 = 13.
        bytes[13] ^= 0xAB;
        var tampered = Convert.ToBase64String(bytes);

        var act = () => protector.Decrypt(tampered);
        act.Should().Throw<CryptographicException>();
    }

    // ── Legacy CBC backward compatibility ──────────────────────────────────────

    [Fact]
    public void Decrypt_LegacyCbcCiphertext_DecryptsSuccessfully()
    {
        // SEC-AI-02 H-01: legacy CBC ciphertexts (v1 format) must still decrypt so
        // existing stored keys (pre-GCM migration) continue to work.
        var protector = BuildProtector();

        // Produce a CBC ciphertext using the same key.
        var legacyCiphertext = ProduceLegacyCbcCiphertext("legacy-api-key", TestKeyBase64);

        var decrypted = protector.Decrypt(legacyCiphertext);
        decrypted.Should().Be("legacy-api-key");
    }

    // ── Fail-fast (M-05) ──────────────────────────────────────────────────────

    [Fact]
    public void Constructor_NonDevelopment_NoKey_ThrowsInvalidOperationException()
    {
        // SEC-AI-02 M-05: missing key in non-Dev must throw at startup, not fall back silently.
        var config = new ConfigurationBuilder().Build(); // empty — no key
        var envMock = new Mock<IHostEnvironment>();
        envMock.Setup(e => e.EnvironmentName).Returns(Environments.Production);

        var act = () => new AesAiKeyProtector(config, envMock.Object,
            NullLogger<AesAiKeyProtector>.Instance);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*non-Development*");
    }

    [Fact]
    public void Constructor_Development_NoKey_UsesDevFallback_DoesNotThrow()
    {
        // Dev-only fallback is acceptable.
        var config = new ConfigurationBuilder().Build();
        var envMock = new Mock<IHostEnvironment>();
        envMock.Setup(e => e.EnvironmentName).Returns(Environments.Development);

        var act = () => new AesAiKeyProtector(config, envMock.Object,
            NullLogger<AesAiKeyProtector>.Instance);

        act.Should().NotThrow();
    }

    [Fact]
    public void Constructor_InvalidKeyLength_ThrowsInvalidOperationException()
    {
        // Key must be exactly 32 bytes when provided.
        var shortKey = Convert.ToBase64String(new byte[16]); // 16 bytes, not 32
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new System.Collections.Generic.Dictionary<string, string?>
            {
                ["Ai:KeyEncryptionKey"] = shortKey
            })
            .Build();
        var envMock = new Mock<IHostEnvironment>();
        envMock.Setup(e => e.EnvironmentName).Returns(Environments.Production);

        var act = () => new AesAiKeyProtector(config, envMock.Object,
            NullLogger<AesAiKeyProtector>.Instance);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*256-bit*");
    }

    // ── Helper ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Produces a legacy AES-256-CBC ciphertext (v1 format) for backward-compatibility tests.
    /// Format: Base64( IV(16) || Ciphertext ).
    /// </summary>
    private static string ProduceLegacyCbcCiphertext(string plaintext, string keyBase64)
    {
        var key = Convert.FromBase64String(keyBase64);
        using var aes = Aes.Create();
        aes.Key = key;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;
        aes.GenerateIV();

        using var enc = aes.CreateEncryptor();
        var plain = Encoding.UTF8.GetBytes(plaintext);
        var cipher = enc.TransformFinalBlock(plain, 0, plain.Length);

        var result = new byte[aes.IV.Length + cipher.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipher, 0, result, aes.IV.Length, cipher.Length);
        return Convert.ToBase64String(result);
    }
}
