using LoanService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LoanService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the loan schema database context.
/// Query handlers use this for direct LINQ projections (Jason Taylor pattern).
/// All write handlers use this for entity tracking and SaveChangesAsync.
/// </summary>
public interface ILoanServiceDbContext
{
    DbSet<LoanApplication> LoanApplications { get; }
    DbSet<LoanProduct> LoanProducts { get; }
    DbSet<Consent> Consents { get; }
    DbSet<PartnerBank> PartnerBanks { get; }
    DbSet<ApplicationDocument> ApplicationDocuments { get; }
    DbSet<ApplicationStatusLog> ApplicationStatusLogs { get; }
    DbSet<LoanPdfPackage> LoanPdfPackages { get; }

    /// <summary>P6-HANDOFF-33: Webhook idempotency keys for deduplication (30-day TTL).</summary>
    DbSet<WebhookIdempotencyKey> WebhookIdempotencyKeys { get; }

    /// <summary>P6-HANDOFF-25 / SEC-050: Versioned consent text catalog.</summary>
    DbSet<ConsentCatalogEntry> ConsentCatalog { get; }

    /// <summary>GAP-021: RBI Key Facts Statements (immutable, HMAC-signed).</summary>
    DbSet<KeyFactsStatement> KeyFactsStatements { get; }

    /// <summary>Persists changes to the loan schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
