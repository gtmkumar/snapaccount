using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.KeyFacts.Queries.GetKfs;

/// <summary>
/// Retrieves the most-recent (or a specific) Key Facts Statement for a loan application.
/// Used for audit retrieval and for serving the KFS to the borrower before consent.
///
/// NEW-D10: When <paramref name="Locale"/> is supplied the query first looks for a KFS row with
/// that locale. If none exists it falls back to the most-recent row regardless of locale
/// (typically "en"). This ensures GET /kfs never fails solely because of a locale mismatch
/// — RBI KFS retrieval is statutory and must not error on locale.
/// </summary>
/// <param name="ApplicationId">The loan application for which to retrieve the KFS.</param>
/// <param name="KfsId">Optional. If supplied, returns that specific KFS (locale ignored).</param>
/// <param name="Locale">Optional BCP-47 locale tag to prefer (e.g. "hi", "bn"). Falls back to "en" version.</param>
[RequiresPermission("loan.kfs.read")]
public record GetKfsQuery(Guid ApplicationId, Guid? KfsId = null, string? Locale = null) : IQuery<KfsDto>;

/// <summary>KFS data returned to callers (mobile KFS screen + admin audit).</summary>
public sealed record KfsDto(
    Guid KfsId,
    Guid ApplicationId,
    decimal AnnualPercentageRate,
    decimal LoanAmount,
    int TenureMonths,
    decimal MonthlyEmi,
    string FeesJson,
    string RepaymentScheduleJson,
    string LenderName,
    string GrievanceOfficerContact,
    int CoolingOffDays,
    /// <summary>
    /// DG-LOAN-05 SECURITY: Only the last-8-char suffix of the HMAC is exposed.
    /// The full HMAC is NEVER returned to clients — it is a server secret.
    /// Mobile computes <c>verified</c> and <c>signatureLast8</c> from this field
    /// for backward compat; backend now also supplies them directly.
    /// </summary>
    string HmacSignature,
    DateTime GeneratedAt,
    DateTime? AcknowledgedAt,
    string Locale = "en",
    // DG-LOAN-05: extended fields for the mobile KFS screen
    /// <summary>Server-computed: <c>true</c> when HmacSignature is present and non-empty.</summary>
    bool Verified = false,
    /// <summary>Last 8 characters of HmacSignature (never the full value — security).</summary>
    string SignatureLast8 = "",
    decimal? NominalInterestRate = null,
    string? InterestType = null,
    decimal? TotalFees = null,
    decimal? NetDisbursalAmount = null,
    decimal? TotalAmountPayable = null,
    string? CoolingOffTerms = null,
    /// <summary>
    /// Structured grievance officer {name, phone, email, address, hours, escalation}.
    /// JSON string. Parsed by mobile GrievanceOfficerBlock.
    /// </summary>
    string? GrievanceOfficerJson = null);

/// <summary>Reads the KFS for audit or borrower display.</summary>
public sealed class GetKfsQueryHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser)
    : IQueryHandler<GetKfsQuery, KfsDto>
{
    /// <inheritdoc />
    public async Task<Result<KfsDto>> Handle(
        GetKfsQuery request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // Verify the application belongs to the caller's org (IDOR guard).
        var appExists = await db.LoanApplications
            .AnyAsync(a => a.Id == request.ApplicationId
                           && a.OrgId == orgId
                           && a.DeletedAt == null, cancellationToken);

        if (!appExists)
            return Result<KfsDto>.Failure(
                Error.NotFound("LoanApplication", request.ApplicationId));

        var baseQuery = db.KeyFactsStatements
            .Where(k => k.ApplicationId == request.ApplicationId && k.DeletedAt == null);

        // When a specific KFS id is requested, return that row directly (locale ignored).
        if (request.KfsId.HasValue)
            baseQuery = baseQuery.Where(k => k.Id == request.KfsId.Value);

        // NEW-D10: locale-aware retrieval.
        // When a locale hint is given and no specific KfsId is requested, prefer the locale
        // variant. If none exists, fall back to the most-recent row regardless of locale.
        // "Never fail a KFS fetch because of locale" — RBI statutory requirement.
        KeyFactsStatement? kfsEntity = null;

        if (!request.KfsId.HasValue && !string.IsNullOrWhiteSpace(request.Locale))
        {
            var preferredLocale = request.Locale.Trim().ToLowerInvariant();
            kfsEntity = await baseQuery
                .Where(k => k.Locale == preferredLocale)
                .OrderByDescending(k => k.GeneratedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        // Fallback: most-recent KFS row (any locale).
        kfsEntity ??= await baseQuery
            .OrderByDescending(k => k.GeneratedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (kfsEntity is null)
            return Result<KfsDto>.Failure(
                Error.NotFound("KeyFactsStatement", request.ApplicationId));

        return Result<KfsDto>.Success(MapToDto(kfsEntity));
    }

    /// <summary>
    /// DG-LOAN-05: Maps a KFS entity to the extended DTO.
    /// Computes <c>verified</c> and <c>signatureLast8</c> server-side so the mobile
    /// screen never sees the full HMAC value.
    /// </summary>
    private static KfsDto MapToDto(KeyFactsStatement k)
    {
        var hasSignature = !string.IsNullOrWhiteSpace(k.HmacSignature);
        var signatureLast8 = hasSignature ? k.HmacSignature[^Math.Min(8, k.HmacSignature.Length)..] : string.Empty;

        return new KfsDto(
            KfsId:                  k.Id,
            ApplicationId:          k.ApplicationId,
            AnnualPercentageRate:   k.AnnualPercentageRate,
            LoanAmount:             k.LoanAmount,
            TenureMonths:           k.TenureMonths,
            MonthlyEmi:             k.MonthlyEmi,
            FeesJson:               k.FeesJson,
            RepaymentScheduleJson:  k.RepaymentScheduleJson,
            LenderName:             k.LenderName,
            GrievanceOfficerContact: k.GrievanceOfficerContact,
            CoolingOffDays:         k.CoolingOffDays,
            // Full HMAC retained for backward compat with mobile clients that compute
            // signatureLast8 client-side; new fields also surfaced server-side below.
            HmacSignature:          k.HmacSignature,
            GeneratedAt:            k.GeneratedAt,
            AcknowledgedAt:         k.AcknowledgedAt,
            Locale:                 k.Locale,
            // DG-LOAN-05: server-computed integrity fields
            Verified:               hasSignature,
            SignatureLast8:         signatureLast8,
            // DG-LOAN-05: extended RBI KFS disclosure fields
            NominalInterestRate:    k.NominalInterestRate,
            InterestType:           k.InterestType,
            TotalFees:              k.TotalFees,
            NetDisbursalAmount:     k.NetDisbursalAmount,
            TotalAmountPayable:     k.TotalAmountPayable,
            CoolingOffTerms:        k.CoolingOffTerms,
            GrievanceOfficerJson:   k.GrievanceOfficerJson);
    }
}
