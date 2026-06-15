using Microsoft.Extensions.Configuration;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace AuthService.Application.Config.Queries.GetPrivacyContact;

/// <summary>
/// Returns DPDP-mandated DPO / privacy-contact details from server configuration.
/// <para>
/// Config keys read from <c>appsettings.json</c> (or env-override via GCP Secret Manager):
/// <code>
///   Privacy:Contact:Name     — DPO full name or role title
///   Privacy:Contact:Email    — DPDP contact email (DPDP Act 2023, Section 8(7))
///   Privacy:Contact:Address  — Postal address for data-principal grievances
/// </code>
/// </para>
/// <para>
/// Design decisions:
/// <list type="bullet">
///   <item><description>No <c>[RequiresPermission]</c> attribute — this endpoint is public to authenticated users
///         (DPDP Act requires data fiduciaries to disclose DPO contact details to data principals).</description></item>
///   <item><description>Never fails startup — empty fields allowed while TL-10 (DPO appointment) is pending.</description></item>
///   <item><description>Development returns sensible placeholder values so local dev works without secret config.</description></item>
/// </list>
/// </para>
/// </summary>
public record GetPrivacyContactQuery : IQuery<PrivacyContactDto>;

/// <summary>DPO / privacy-contact information returned by <c>GET /auth/config/privacy-contact</c>.</summary>
/// <param name="Name">Full name or role title of the Data Protection Officer (may be empty if TL-10 pending).</param>
/// <param name="Email">Email address for DPDP grievance / data-principal requests.</param>
/// <param name="Address">Postal address of the registered grievance / DPO office.</param>
public record PrivacyContactDto(
    string Name,
    string Email,
    string Address);

/// <summary>
/// Reads <c>Privacy:Contact:*</c> keys from <see cref="IConfiguration"/>.
/// When the environment is <c>Development</c> (detected via <c>ASPNETCORE_ENVIRONMENT</c>),
/// substitutes placeholder values so frontends can render the screen without secrets.
/// </summary>
public sealed class GetPrivacyContactQueryHandler(IConfiguration configuration)
    : IQueryHandler<GetPrivacyContactQuery, PrivacyContactDto>
{
    /// <inheritdoc />
    public Task<Result<PrivacyContactDto>> Handle(
        GetPrivacyContactQuery request,
        CancellationToken cancellationToken)
    {
        var isDevelopment = string.Equals(
            configuration["ASPNETCORE_ENVIRONMENT"],
            "Development",
            StringComparison.OrdinalIgnoreCase);

        var name    = configuration["Privacy:Contact:Name"]    ?? string.Empty;
        var email   = configuration["Privacy:Contact:Email"]   ?? string.Empty;
        var address = configuration["Privacy:Contact:Address"] ?? string.Empty;

        // In Development, substitute placeholder values when config keys are absent.
        // This ensures the frontend can render the DPO-contact screen without production secrets.
        if (isDevelopment)
        {
            if (string.IsNullOrWhiteSpace(name))
                name = "[DPO appointment pending — see TL-10]";
            if (string.IsNullOrWhiteSpace(email))
                email = "privacy@snapaccount.in";
            if (string.IsNullOrWhiteSpace(address))
                address = "SnapAccount Technologies Pvt. Ltd., Bengaluru, Karnataka 560001";
        }

        return Task.FromResult(
            Result<PrivacyContactDto>.Success(new PrivacyContactDto(name, email, address)));
    }
}
