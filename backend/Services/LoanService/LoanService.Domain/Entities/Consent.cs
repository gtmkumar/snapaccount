using SnapAccount.Shared.Domain;

namespace LoanService.Domain.Entities;

/// <summary>
/// Records a user's digital consent for a loan application.
///
/// P6-HANDOFF-26: signature_hash = HMAC-SHA256(
///   user_id ‖ '|' ‖ app_id ‖ '|' ‖ consent_text_version ‖ '|' ‖ signed_at_iso8601,
///   server_key_from_secret_manager)
///
/// DB trigger BLOCKS hard-delete on this table (compliance/DPDP).
/// 7-year retention enforced by application layer and GCS lifecycle policy.
/// </summary>
public class Consent : BaseAuditableEntity
{
    /// <summary>FK to loan.applications.</summary>
    public Guid ApplicationId { get; init; }

    /// <summary>Type of consent obtained.</summary>
    public ConsentType ConsentType { get; init; }

    /// <summary>Version identifier of the consent text shown to the user.</summary>
    public string ConsentTextVersion { get; init; } = string.Empty;

    /// <summary>UTC timestamp when the user signed the consent.</summary>
    public DateTime SignedAt { get; init; }

    /// <summary>IP address of the user at signing (nullable for DPDP anonymisation).</summary>
    public string? IpAddress { get; set; }

    /// <summary>User agent string at signing (nullable for DPDP anonymisation).</summary>
    public string? UserAgent { get; set; }

    /// <summary>
    /// HMAC-SHA256 signature computed as:
    ///   HMAC-SHA256(user_id + "|" + app_id + "|" + consent_text_version + "|" + signed_at_iso8601, server_key)
    /// Must be exactly 32 bytes. Checked by DB constraint.
    /// </summary>
    public byte[] SignatureHash { get; init; } = Array.Empty<byte>();

    /// <summary>User who gave consent (nullable for DPDP anonymisation).</summary>
    public Guid? UserId { get; set; }

    /// <summary>DPDP anonymisation timestamp.</summary>
    public DateTime? AnonymizedAt { get; set; }

    /// <summary>DPDP anonymisation reason.</summary>
    public string? AnonymizationReason { get; set; }
}

/// <summary>Types of consent required for a loan application.</summary>
public enum ConsentType
{
    /// <summary>Permission to run a credit bureau (CIBIL/Experian) enquiry.</summary>
    CreditBureau,
    /// <summary>Permission to share application data with the partner bank.</summary>
    DataShareWithBank,
    /// <summary>ECS/NACH disbursement mandate.</summary>
    DisbursementMandate
}
