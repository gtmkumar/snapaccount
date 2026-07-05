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
        modelBuilder.ApplyConfigurationsFromAssembly(
            typeof(DocumentDbContext).Assembly,
            type => type.Namespace == "DocumentService.Infrastructure.Persistence.Configurations");
        base.OnModelCreating(modelBuilder);

        // The DB schema (built from database/migrations/*.sql) uses snake_case, SINGULAR
        // table names (document, document_category, ocr_result, …). There are no entity
        // configurations setting ToTable, so EF would otherwise default to the PascalCase
        // DbSet name ("Documents"), which does not exist. Map every entity to the
        // snake_case singular of its CLR type name to match the actual tables.
        // Note: EF sets a default table-name annotation from the DbSet name, so we set
        // unconditionally here. There are no ToTable configs in this service to preserve.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            entityType.SetTableName(ToSnakeCase(entityType.ClrType.Name));
        }

        // jsonb columns — without an explicit column type EF treats these string properties as
        // `text`, and Npgsql then rejects them against the jsonb columns
        // ("column is of type jsonb but expression is of type text").
        modelBuilder.Entity<OcrResult>().Property(o => o.RawResponse).HasColumnType("jsonb");
        modelBuilder.Entity<OcrField>().Property(f => f.BoundingBox).HasColumnType("jsonb");
    }

    /// <summary>Converts a PascalCase identifier to snake_case (e.g. OcrResult -> ocr_result).</summary>
    private static string ToSnakeCase(string name)
    {
        if (string.IsNullOrEmpty(name)) return name;
        var sb = new System.Text.StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                if (i > 0) sb.Append('_');
                sb.Append(char.ToLowerInvariant(c));
            }
            else
            {
                sb.Append(c);
            }
        }
        return sb.ToString();
    }
}
