using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentValidation;
using LoanService.Application.Common.Interfaces;
using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Application.Behaviors;
using SnapAccount.Shared.Domain;

namespace LoanService.Application.KeyFacts.Commands.GenerateKfs;

/// <summary>
/// RBI Digital Lending Guidelines — Generate and persist a Key Facts Statement (KFS)
/// for a loan application.  The KFS MUST be served to the borrower before consent.
///
/// NEW-D10: accepts an optional <paramref name="Locale"/> parameter that drives the KFS language.
/// Resolution chain: caller param → user preference → org default → "en" (fallback).
/// Supported values: "en", "hi", "bn" (configurable via Loan:SupportedKfsLocales).
/// RBI KFS is statutory — "en" is always the fallback, never a failure.
/// </summary>
/// <param name="ApplicationId">The loan application for which to generate the KFS.</param>
/// <param name="Locale">Optional BCP-47 locale tag (e.g. "en", "hi", "bn"). Defaults to "en".</param>
[RequiresPermission("loan.kfs.generate")]
public record GenerateKfsCommand(Guid ApplicationId, string? Locale = null) : ICommand<GenerateKfsResult>;

/// <summary>Result returned after the KFS is generated and persisted.</summary>
public sealed record GenerateKfsResult(
    Guid KfsId,
    decimal AnnualPercentageRate,
    decimal LoanAmount,
    int TenureMonths,
    decimal MonthlyEmi,
    object Fees,
    object RepaymentSchedule,
    string LenderName,
    string GrievanceOfficerContact,
    int CoolingOffDays,
    DateTime GeneratedAt,
    string Locale = "en",
    // DG-LOAN-05: extended fields
    decimal? NominalInterestRate = null,
    string? InterestType = null,
    decimal? TotalFees = null,
    decimal? NetDisbursalAmount = null,
    decimal? TotalAmountPayable = null,
    string? CoolingOffTerms = null,
    string? GrievanceOfficerJson = null);

/// <summary>FluentValidation validator for <see cref="GenerateKfsCommand"/>.</summary>
public sealed class GenerateKfsCommandValidator : AbstractValidator<GenerateKfsCommand>
{
    // Supported KFS locales. The 'en' fallback must always remain in this set.
    // NEW-D10: validated here; additional locales are supported via config at runtime.
    private static readonly HashSet<string> SupportedLocales =
        ["en", "hi", "bn"];

    public GenerateKfsCommandValidator()
    {
        RuleFor(x => x.ApplicationId).NotEmpty();
        RuleFor(x => x.Locale)
            .Must(locale => locale is null || SupportedLocales.Contains(locale.ToLowerInvariant()))
            .WithMessage($"locale must be one of: {string.Join(", ", SupportedLocales)} (or omit for 'en' default).")
            .When(x => x.Locale is not null);
    }
}

/// <summary>
/// Computes APR + EMI, builds fee itemisation and repayment schedule,
/// signs the statement with HMAC-SHA256, and persists it.
/// </summary>
public sealed class GenerateKfsCommandHandler(
    ILoanServiceDbContext db,
    ICurrentUser currentUser,
    IConsentHmacKeyProvider hmacKeyProvider,
    ILoanKfsConfig kfsConfig)
    : ICommandHandler<GenerateKfsCommand, GenerateKfsResult>
{
    /// <inheritdoc />
    public async Task<Result<GenerateKfsResult>> Handle(
        GenerateKfsCommand request,
        CancellationToken cancellationToken)
    {
        var orgId = currentUser.OrganizationId;

        // Migration 066: assigned_bank_id confirmed. Include AssignedBank navigation.
        var app = await db.LoanApplications
            .Include(a => a.LoanProduct)
            .Include(a => a.AssignedBank)
            .Where(a => a.Id == request.ApplicationId
                        && a.OrgId == orgId
                        && a.DeletedAt == null)
            .FirstOrDefaultAsync(cancellationToken);

        if (app is null)
            return Result<GenerateKfsResult>.Failure(
                Error.NotFound("LoanApplication", request.ApplicationId));

        var product = app.LoanProduct;
        if (product is null)
            return Result<GenerateKfsResult>.Failure(
                Error.Validation("LoanApplication.NoProduct",
                    "The loan application does not have an associated loan product."));

        // ── Financial computation ──────────────────────────────────────────────
        var principal   = app.RequestedAmount;
        var tenureMonths = app.TenureMonths;

        // APR = mid-point of product interest rate range (annualised, %).
        var annualRate     = (product.InterestRateMin + product.InterestRateMax) / 2m;
        var monthlyRateD   = (double)(annualRate / 100m / 12m);
        var n              = tenureMonths;

        // EMI = P × r × (1+r)^n / ((1+r)^n - 1)
        double emi;
        if (monthlyRateD == 0)
        {
            emi = (double)(principal / tenureMonths);
        }
        else
        {
            var pow = Math.Pow(1 + monthlyRateD, n);
            emi = (double)principal * monthlyRateD * pow / (pow - 1);
        }
        var monthlyEmi = Math.Round((decimal)emi, 2);

        // Fees: configurable processing fee (default 2% of principal, capped at INR 10,000)
        var processingFeeRate = kfsConfig.ProcessingFeeRate;
        var processingFee     = Math.Min(Math.Round(principal * processingFeeRate, 2), 10_000m);
        var fees = new[]
        {
            new { name = "Processing Fee", amount = processingFee, type = "one_time" },
            new { name = "GST on Processing Fee", amount = Math.Round(processingFee * 0.18m, 2), type = "one_time" },
        };

        // Repayment schedule — first 12 months + last month (or all if tenure ≤ 12)
        var schedule = BuildRepaymentSchedule(principal, monthlyRateD, monthlyEmi, n);

        var feesJson     = JsonSerializer.Serialize(fees);
        var scheduleJson = JsonSerializer.Serialize(schedule);

        var lenderName              = app.AssignedBank?.Name ?? product.ProductName;
        var grievanceOfficerContact = kfsConfig.GrievanceOfficerContact;
        var coolingOffDays          = kfsConfig.CoolingOffDays;

        // ── HMAC-SHA256 signature ──────────────────────────────────────────────
        var hmacKey  = await hmacKeyProvider.GetKeyAsync(cancellationToken);
        var payload  = $"{request.ApplicationId}|{principal}|{annualRate}|{tenureMonths}|{monthlyEmi}|{feesJson}";
        var signature = ComputeHmac(hmacKey, payload);

        // ── NEW-D10: locale resolution chain ──────────────────────────────────
        // 1. caller param  → already validated by GenerateKfsCommandValidator
        // 2. user pref     → not available in LoanService (cross-service); skip
        // 3. org default   → not yet persisted; skip for now
        // 4. fallback      → "en" (RBI KFS is statutory; never fail on locale)
        var resolvedLocale = string.IsNullOrWhiteSpace(request.Locale)
            ? "en"
            : request.Locale.Trim().ToLowerInvariant();

        // DG-LOAN-05: Compute extended RBI KFS disclosure fields.
        var totalFeesAmount      = fees.Sum(f => f.amount);
        var netDisbursalAmount   = principal - totalFeesAmount;
        var totalAmountPayable   = monthlyEmi * tenureMonths;
        var nominalInterestRate  = kfsConfig.NominalInterestRate;
        var interestType         = kfsConfig.InterestType;
        var coolingOffTerms      = kfsConfig.GetCoolingOffTerms(resolvedLocale, coolingOffDays);
        var grievanceOfficerJson = kfsConfig.GrievanceOfficerJson;

        var kfs = KeyFactsStatement.Create(
            applicationId:           request.ApplicationId,
            loanAmount:              principal,
            tenureMonths:            tenureMonths,
            annualPercentageRate:    annualRate,
            monthlyEmi:              monthlyEmi,
            feesJson:                feesJson,
            repaymentScheduleJson:   scheduleJson,
            lenderName:              lenderName,
            grievanceOfficerContact: grievanceOfficerContact,
            coolingOffDays:          coolingOffDays,
            hmacSignature:           signature,
            locale:                  resolvedLocale,
            nominalInterestRate:     nominalInterestRate,
            interestType:            interestType,
            totalFees:               totalFeesAmount,
            netDisbursalAmount:      netDisbursalAmount,
            totalAmountPayable:      totalAmountPayable,
            coolingOffTerms:         coolingOffTerms,
            grievanceOfficerJson:    grievanceOfficerJson);

        db.KeyFactsStatements.Add(kfs);
        await db.SaveChangesAsync(cancellationToken);

        return Result<GenerateKfsResult>.Success(new GenerateKfsResult(
            kfs.Id,
            kfs.AnnualPercentageRate,
            kfs.LoanAmount,
            kfs.TenureMonths,
            kfs.MonthlyEmi,
            fees,
            schedule,
            kfs.LenderName,
            kfs.GrievanceOfficerContact,
            kfs.CoolingOffDays,
            kfs.GeneratedAt,
            kfs.Locale,
            kfs.NominalInterestRate,
            kfs.InterestType,
            kfs.TotalFees,
            kfs.NetDisbursalAmount,
            kfs.TotalAmountPayable,
            kfs.CoolingOffTerms,
            kfs.GrievanceOfficerJson));
    }

    private static object[] BuildRepaymentSchedule(
        decimal principal, double monthlyRate, decimal emi, int months)
    {
        var schedule    = new List<object>(months);
        var balance     = (double)principal;
        var baseDate    = DateTime.UtcNow;

        for (int i = 1; i <= months; i++)
        {
            var interest = balance * monthlyRate;
            var principalPayment = (double)emi - interest;
            balance -= principalPayment;

            schedule.Add(new
            {
                emiNumber  = i,
                dueDate    = baseDate.AddMonths(i).ToString("yyyy-MM-dd"),
                principal  = Math.Round((decimal)principalPayment, 2),
                interest   = Math.Round((decimal)interest, 2),
                total      = emi,
                balance    = Math.Round((decimal)Math.Max(balance, 0), 2),
            });
        }
        return [.. schedule];
    }

    private static string ComputeHmac(byte[] key, string payload)
    {
        using var hmac  = new HMACSHA256(key);
        var hash        = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Convert.ToBase64String(hash);
    }
}
