using SnapAccount.Shared.Domain;
using System.Security.Cryptography;
using System.Text;

namespace LoanService.Domain.ValueObjects;

/// <summary>
/// Value object that computes and holds the HMAC-SHA256 consent signature.
///
/// Signature payload format (P6-HANDOFF-26):
///   {user_id}|{app_id}|{consent_text_version}|{signed_at_iso8601}
///
/// Example:
///   "550e8400-e29b-41d4-a716-446655440000|7f9c4e32-...|v1.2.0|2026-04-25T10:15:00.000Z"
///
/// The HMAC key is loaded from GCP Secret Manager (secret name: loan-consent-hmac-key).
/// The resulting hash is 32 bytes — enforced by a DB CHECK constraint.
/// </summary>
public sealed class ConsentSignature : ValueObject
{
    /// <summary>Raw 32-byte HMAC-SHA256 signature.</summary>
    public byte[] Hash { get; }

    private ConsentSignature(byte[] hash) => Hash = hash;

    /// <summary>
    /// Computes the consent signature.
    /// Payload: {userId}|{applicationId}|{consentTextVersion}|{signedAt:O}
    /// </summary>
    public static ConsentSignature Compute(
        Guid userId,
        Guid applicationId,
        string consentTextVersion,
        DateTime signedAt,
        byte[] hmacKey)
    {
        var payload = $"{userId}|{applicationId}|{consentTextVersion}|{signedAt:O}";
        var bytes = Encoding.UTF8.GetBytes(payload);
        var hash = HMACSHA256.HashData(hmacKey, bytes);
        // HMAC-SHA256 always produces 32 bytes
        return new ConsentSignature(hash);
    }

    /// <summary>
    /// Verifies a signature against expected values.
    /// Uses <see cref="CryptographicOperations.FixedTimeEquals"/> to prevent timing attacks.
    /// </summary>
    public static bool Verify(
        byte[] signature,
        Guid userId,
        Guid applicationId,
        string consentTextVersion,
        DateTime signedAt,
        byte[] hmacKey)
    {
        var expected = Compute(userId, applicationId, consentTextVersion, signedAt, hmacKey);
        return CryptographicOperations.FixedTimeEquals(signature, expected.Hash);
    }

    /// <inheritdoc />
    protected override IEnumerable<object> GetEqualityComponents()
    {
        foreach (var b in Hash) yield return b;
    }
}
