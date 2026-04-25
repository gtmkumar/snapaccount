using DocumentService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace DocumentService.Application.Common.Interfaces;

/// <summary>
/// Application-layer abstraction over the document schema database context.
/// Query handlers depend on this interface for direct LINQ projection without
/// loading full aggregates (Jason Taylor pattern).
/// Write-side command handlers use <c>IDocumentRepository</c> for aggregate
/// lifecycle management and transactional consistency.
/// The concrete <c>DocumentDbContext</c> in Infrastructure implements this interface.
/// </summary>
public interface IDocumentDbContext
{
    /// <summary>Documents in <c>document.documents</c>.</summary>
    DbSet<Document> Documents { get; }

    /// <summary>Document categories in <c>document.document_categories</c>.</summary>
    DbSet<DocumentCategory> DocumentCategories { get; }

    /// <summary>Document pages (multi-page PDF support) in <c>document.document_pages</c>.</summary>
    DbSet<DocumentPage> DocumentPages { get; }

    /// <summary>OCR results in <c>document.ocr_results</c>.</summary>
    DbSet<OcrResult> OcrResults { get; }

    /// <summary>Structured OCR fields in <c>document.ocr_fields</c>.</summary>
    DbSet<OcrField> OcrFields { get; }

    /// <summary>User OCR accuracy feedback in <c>document.ocr_feedbacks</c>.</summary>
    DbSet<OcrFeedback> OcrFeedbacks { get; }

    /// <summary>Document tags in <c>document.document_tags</c>.</summary>
    DbSet<DocumentTag> DocumentTags { get; }

    /// <summary>Document share records in <c>document.document_shares</c>.</summary>
    DbSet<DocumentShare> DocumentShares { get; }

    /// <summary>Document archive records in <c>document.document_archives</c>.</summary>
    DbSet<DocumentArchive> DocumentArchives { get; }

    /// <summary>Persists changes to the document schema.</summary>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
