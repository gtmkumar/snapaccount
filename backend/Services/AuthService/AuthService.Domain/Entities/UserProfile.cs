using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

public class UserProfile : BaseAuditableEntity
{
    public Guid UserId { get; init; }
    public string UserType { get; init; } = "BUSINESS_OWNER"; // BUSINESS_OWNER, EMPLOYEE, STAFF
    public string? PanNumber { get; set; }
    public string? AadhaarLast4 { get; set; } // Last 4 digits only — UIDAI compliance
    public DateOnly? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? Pincode { get; set; }
    public string Country { get; private set; } = "India";
    public string? ProfilePhotoUrl { get; set; }
    public string KycStatus { get; private set; } = "PENDING"; // PENDING, IN_PROGRESS, VERIFIED, REJECTED
    public DateTime? KycVerifiedAt { get; private set; }

    public void VerifyKyc()
    {
        KycStatus = "VERIFIED";
        KycVerifiedAt = DateTime.UtcNow;
    }

    public void RejectKyc() => KycStatus = "REJECTED";
}
