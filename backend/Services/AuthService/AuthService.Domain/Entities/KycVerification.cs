using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// KYC verification record for a user (auth.kyc_verification).
/// Covers PAN and Aadhaar verification attempts.
/// Reference number is either the PAN (XXXXX9999X) or a MASKED Aadhaar (XXXX-XXXX-1234).
/// Full Aadhaar is NEVER stored (DPDP Act 2023 compliance).
/// </summary>
public class KycVerification : BaseAuditableEntity
{
    /// <summary>Foreign key to auth.user.</summary>
    public Guid UserId { get; init; }

    /// <summary>KYC kind: "PAN" or "AADHAAR".</summary>
    public string Kind { get; init; } = string.Empty;

    /// <summary>PAN number (XXXXX9999X) or MASKED Aadhaar (XXXX-XXXX-1234). Never full Aadhaar.</summary>
    public string ReferenceNumber { get; set; } = string.Empty;

    /// <summary>Verification status: "PENDING", "VERIFIED", or "FAILED".</summary>
    public string Status { get; set; } = KycStatus.Pending;

    /// <summary>KYC provider name, e.g. "mock", "uidai", "nsdl".</summary>
    public string? Provider { get; set; }

    /// <summary>Provider-side reference / transaction id.</summary>
    public string? ProviderRef { get; set; }

    /// <summary>UTC timestamp when status transitions to VERIFIED.</summary>
    public DateTime? VerifiedAt { get; set; }
}

/// <summary>
/// Allowed document/KYC kinds.
/// Maps to the DB partial unique index <c>ux_kyc_verification_user_kind</c>
/// (one active record per user per kind).
/// </summary>
public static class KycKind
{
    public const string Pan = "PAN";
    public const string Aadhaar = "AADHAAR";
    public const string Gstin = "GSTIN";
    public const string Tan = "TAN";

    /// <summary>All valid kind strings (for validation).</summary>
    public static readonly IReadOnlySet<string> All =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { Pan, Aadhaar, Gstin, Tan };

    /// <summary>
    /// Parses a route segment (e.g. "pan", "aadhaar") to the canonical uppercase constant.
    /// Returns null when the segment is not a recognised kind.
    /// </summary>
    public static string? Parse(string segment) =>
        segment.ToUpperInvariant() switch
        {
            "PAN"     => Pan,
            "AADHAAR" => Aadhaar,
            "GSTIN"   => Gstin,
            "TAN"     => Tan,
            _         => null
        };
}

/// <summary>Allowed KYC/document statuses.</summary>
public static class KycStatus
{
    /// <summary>
    /// Record saved but no verification attempted.
    /// Used when <c>GovernmentVerificationEnabled = false</c>.
    /// </summary>
    public const string Saved = "SAVED";

    /// <summary>OTP sent / verification in progress.</summary>
    public const string Pending = "PENDING";

    /// <summary>Government verification succeeded.</summary>
    public const string Verified = "VERIFIED";

    /// <summary>OTP incorrect or provider returned failure (record kept, retry allowed).</summary>
    public const string Failed = "FAILED";
}
