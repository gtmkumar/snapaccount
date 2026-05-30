using SnapAccount.Shared.Domain;

namespace AuthService.Domain.Entities;

/// <summary>
/// A lookup / reference-data entry used to populate dropdowns across the application.
///
/// Examples: languages, user types, genders, Indian states, countries.
///
/// Uniqueness: (category, code) WHERE deleted_at IS NULL — enforced by a partial
/// index in migration 039.  Soft-delete (deleted_at) frees a code so it can be
/// re-created if needed.
///
/// Hierarchy: a STATE entry carries a <see cref="ParentCode"/> that must match an
/// active COUNTRY code.  Other categories leave <see cref="ParentCode"/> null.
/// </summary>
public class ReferenceData : BaseAuditableEntity
{
    /// <summary>Logical grouping, e.g. LANGUAGE, STATE, COUNTRY.</summary>
    public string Category { get; private set; } = string.Empty;

    /// <summary>Machine-readable code — unique within a category. Immutable after creation.</summary>
    public string Code { get; private set; } = string.Empty;

    /// <summary>Human-readable label shown in dropdowns.</summary>
    public string Name { get; private set; } = string.Empty;

    /// <summary>Parent code, e.g. a COUNTRY code for a STATE entry. Null for top-level entries.</summary>
    public string? ParentCode { get; private set; }

    /// <summary>Whether this entry appears in dropdown lists. False = hidden but not deleted.</summary>
    public bool IsActive { get; private set; } = true;

    /// <summary>Display ordering hint within a category.</summary>
    public int SortOrder { get; private set; }

    private ReferenceData() { }

    /// <summary>Creates a new reference-data entry.</summary>
    public static ReferenceData Create(
        string category,
        string code,
        string name,
        string? parentCode,
        int sortOrder)
        => new()
        {
            Category   = category.Trim().ToUpperInvariant(),
            Code       = code.Trim(),
            Name       = name.Trim(),
            ParentCode = parentCode?.Trim(),
            SortOrder  = sortOrder,
            IsActive   = true,
        };

    /// <summary>
    /// Updates the mutable fields of this entry.
    /// Category and Code are intentionally immutable — changing them would break
    /// existing profile rows that store the old code value.
    /// </summary>
    public void UpdateDetails(string name, string? parentCode, int sortOrder)
    {
        Name       = name.Trim();
        ParentCode = parentCode?.Trim();
        SortOrder  = sortOrder;
    }

    /// <summary>Activates or deactivates this entry for dropdown visibility.</summary>
    public void SetActive(bool active) => IsActive = active;
}

/// <summary>Valid category identifiers for <see cref="ReferenceData"/>.</summary>
public static class ReferenceDataCategory
{
    public const string Language = "LANGUAGE";
    public const string UserType = "USER_TYPE";
    public const string Gender   = "GENDER";
    public const string State    = "STATE";
    public const string Country  = "COUNTRY";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string> { Language, UserType, Gender, State, Country };
}
