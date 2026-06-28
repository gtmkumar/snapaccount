using System.Text.Json;
using LoanService.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace LoanService.Infrastructure.Services;

/// <summary>
/// Reads KFS configuration from <c>appsettings.json</c> / environment variables.
/// Config keys: <c>Loan:ProcessingFeeRate</c>, <c>Loan:GrievanceOfficerContact</c>,
/// <c>Loan:CoolingOffDays</c>, <c>Loan:GrievanceOfficerJson</c>,
/// <c>Loan:NominalInterestRate</c>, <c>Loan:InterestType</c>.
///
/// DG-LOAN-05: Extended to expose structured grievance officer JSON, nominal
/// interest rate, interest type, and locale-aware cooling-off terms for the
/// mobile KFS screen.
/// </summary>
public sealed class LoanKfsConfig(IConfiguration configuration) : ILoanKfsConfig
{
    public decimal ProcessingFeeRate =>
        configuration.GetValue<decimal>("Loan:ProcessingFeeRate", 0.02m);

    public string GrievanceOfficerContact =>
        configuration.GetValue<string>("Loan:GrievanceOfficerContact")
        ?? "Grievance Officer | grievance@snapaccount.in | +91-1800-XXX-XXXX";

    public int CoolingOffDays =>
        configuration.GetValue<int>("Loan:CoolingOffDays", 3);

    // ── DG-LOAN-05 extensions ──────────────────────────────────────────────────

    /// <summary>
    /// Structured grievance officer JSON.
    /// Config key: Loan:GrievanceOfficerJson (full JSON string).
    /// Falls back to a serialized object derived from GrievanceOfficerContact.
    /// </summary>
    public string GrievanceOfficerJson
    {
        get
        {
            var configured = configuration.GetValue<string>("Loan:GrievanceOfficerJson");
            if (!string.IsNullOrWhiteSpace(configured)) return configured;

            // Derive a minimal structured object from the flat string (dev fallback).
            var flat = GrievanceOfficerContact;
            var parts = flat.Split('|', StringSplitOptions.TrimEntries);
            var obj = new
            {
                name        = parts.Length > 0 ? parts[0] : "Grievance Officer",
                email       = parts.Length > 1 ? parts[1] : "grievance@snapaccount.in",
                phone       = parts.Length > 2 ? parts[2] : "+91-1800-XXX-XXXX",
                address     = "SnapAccount Technologies Pvt. Ltd., India",
                hours       = "Mon–Fri 10:00–18:00 IST",
                escalation  = "If unresolved in 30 days, escalate to RBI CMS (cms.rbi.org.in)",
            };
            return JsonSerializer.Serialize(obj);
        }
    }

    public decimal NominalInterestRate =>
        configuration.GetValue<decimal>("Loan:NominalInterestRate", 14.00m);

    public string InterestType =>
        configuration.GetValue<string>("Loan:InterestType") ?? "REDUCING_BALANCE";

    /// <summary>
    /// Returns locale-specific cooling-off plain-language text.
    /// Reads from config keys Loan:CoolingOffTerms:{locale} (e.g. Loan:CoolingOffTerms:hi).
    /// Falls back to English if the locale variant is not configured.
    /// </summary>
    public string GetCoolingOffTerms(string locale, int coolingOffDays)
    {
        var configuredLocale = configuration.GetValue<string>($"Loan:CoolingOffTerms:{locale}");
        if (!string.IsNullOrWhiteSpace(configuredLocale))
            return configuredLocale.Replace("{days}", coolingOffDays.ToString());

        // English fallback (RBI statutory — always available).
        var en = configuration.GetValue<string>("Loan:CoolingOffTerms:en");
        if (!string.IsNullOrWhiteSpace(en))
            return en.Replace("{days}", coolingOffDays.ToString());

        return $"You may exit this loan within {coolingOffDays} days of disbursal by repaying " +
               "the principal + proportionate APR for the days used, with no prepayment penalty.";
    }
}

