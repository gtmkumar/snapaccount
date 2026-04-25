using DocumentService.Application.Common.Interfaces;
using DocumentService.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using SnapAccount.Shared.Infrastructure.Persistence;

namespace DocumentService.Infrastructure.Persistence;

/// <summary>
/// EF Core DbContext for the <c>document</c> schema.
/// Implements <see cref="IDocumentDbContext"/> so query handlers can project directly
/// via LINQ without loading full aggregates (Jason Taylor pattern).
/// Audit stamping and domain event dispatch are handled by registered
/// <c>ISaveChangesInterceptor</c> instances wired in <see cref="DocumentService.Infrastructure.DependencyInjection"/>.
/// </summary>
public class DocumentDbContext(DbContextOptions<DocumentDbContext> options)
    : BaseDbContext(options), IDocumentDbContext
{
    /// <inheritdoc />
    public DbSet<Document> Documents => Set<Document>();

    /// <inheritdoc />
    public DbSet<DocumentCategory> DocumentCategories => Set<DocumentCategory>();

    /// <inheritdoc />
    public DbSet<DocumentPage> DocumentPages => Set<DocumentPage>();

    /// <inheritdoc />
    public DbSet<OcrResult> OcrResults => Set<OcrResult>();

    /// <inheritdoc />
    public DbSet<OcrField> OcrFields => Set<OcrField>();

    /// <inheritdoc />
    public DbSet<OcrFeedback> OcrFeedbacks => Set<OcrFeedback>();

    /// <inheritdoc />
    public DbSet<DocumentTag> DocumentTags => Set<DocumentTag>();

    /// <inheritdoc />
    public DbSet<DocumentShare> DocumentShares => Set<DocumentShare>();

    /// <inheritdoc />
    public DbSet<DocumentArchive> DocumentArchives => Set<DocumentArchive>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("document");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(DocumentDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
