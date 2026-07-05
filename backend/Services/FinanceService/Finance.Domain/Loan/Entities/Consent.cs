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

    /// <summary>
    /// GAP-040 / P6-HANDOFF-25: Locale of the consent text shown to the user
    /// (e.g. "en", "hi"). Must match the <see cref="ConsentCatalogEntry.Locale"/> column
    /// so the DPDP audit trail ties back to the exact language version the user reviewed.
    /// Defaults to "en" for backward compatibility with pre-existing records.
    /// </summary>
    public string ConsentLocale { get; init; } = "en";

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

    // ── DG-LOAN-06: F4.2 DPDP / RBI audit fields ─────────────────────────────

    /// <summary>
    /// DG-LOAN-06: Masked device identifier recorded at consent time for DPDP audit.
    /// F4.2 requires consent to capture: timestamp, IP address, device ID, list of banks.
    /// Format: first-8 + "..." + last-4 of raw device id (or raw value if &lt;= 12 chars).
    /// NULL when the client does not supply a device id.
    /// </summary>
    public string? DeviceId { get; set; }

    /// <summary>
    /// DG-LOAN-06: Array of partner-bank UUIDs with whom application data was or will be
    /// shared as a result of this <see cref="ConsentType.DataShareWithBank"/> consent.
    /// NULL for other consent types or when bank assignment is not yet known at sign time.
    /// Persisted as JSONB in loan.consents.shared_with_bank_ids.
    /// </summary>
    public Guid[]? SharedWithBankIds { get; set; }

    // ── DG-LOAN-04: DPDP Act 2023 s.6 — Consent Revocation ──────────────────

    /// <summary>
    /// UTC timestamp when the data principal revoked this consent.
    /// NULL = consent is still active.
    /// Revocation is APPEND-ONLY: the original signed record (SignatureHash, SignedAt,
    /// UserId, IpAddress, UserAgent) is never modified.
    /// A revoked <see cref="ConsentType.DataShareWithBank"/> or
    /// <see cref="ConsentType.DisbursementMandate"/> consent MUST block further bank
    /// data-sharing and disbursement (enforced in application layer).
    /// </summary>
    public DateTime? RevokedAt { get; private set; }

    /// <summary>Optional reason supplied by the data principal at revocation time.</summary>
    public string? RevocationReason { get; private set; }

    /// <summary>Whether this consent has been revoked by the data principal.</summary>
    public bool IsRevoked => RevokedAt.HasValue;

    /// <summary>
    /// Records the revocation of this consent per DPDP Act 2023 s.6.
    /// Idempotent: subsequent calls on an already-revoked consent are no-ops.
    /// </summary>
    /// <param name="reason">Optional plain-language reason for the revocation.</param>
    public void Revoke(string? reason = null)
    {
        if (IsRevoked) return;
        RevokedAt = DateTime.UtcNow;
        RevocationReason = reason?.Trim();
    }
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
