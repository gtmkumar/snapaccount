namespace AccountingService.Domain.Entities;

/// <summary>Identifies how a ledger entry was created.</summary>
public enum PostingSource
{
    /// <summary>Created by Google Document AI OCR pipeline.</summary>
    Ocr,
    /// <summary>Created by a human user through the UI.</summary>
    Manual,
    /// <summary>Created via bulk CSV/Excel import.</summary>
    Import,
    /// <summary>Created by system automation (e.g. FY close, reversal).</summary>
    System
}
