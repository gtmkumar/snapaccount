using Npgsql;

namespace LoanService.Infrastructure.Persistence;

/// <summary>
/// Maps CLR enum member names (PascalCase) to PostgreSQL enum labels in UPPER_SNAKE_CASE.
/// e.g. <c>UnderReview → UNDER_REVIEW</c>, <c>DocsRequested → DOCS_REQUESTED</c>, <c>Draft → DRAFT</c>.
///
/// Required because <c>loan.application_status_v2</c> is a native PostgreSQL enum whose labels are
/// UPPER_SNAKE (DRAFT/SUBMITTED/UNDER_REVIEW/…), while the domain enum
/// <see cref="Domain.Entities.LoanApplicationStatus"/> uses idiomatic C# PascalCase. The default
/// Npgsql snake-case translator would produce lower-case labels, so we supply this one to
/// <c>MapEnum</c> in <c>DependencyInjection</c>.
/// </summary>
public sealed class UpperSnakeCaseNameTranslator : INpgsqlNameTranslator
{
    /// <summary>Type names are passed through unchanged (the PG type name is supplied explicitly).</summary>
    public string TranslateTypeName(string clrName) => clrName;

    /// <inheritdoc />
    public string TranslateMemberName(string clrName)
    {
        if (string.IsNullOrEmpty(clrName))
            return clrName;

        var sb = new System.Text.StringBuilder(clrName.Length + 4);
        for (var i = 0; i < clrName.Length; i++)
        {
            var c = clrName[i];
            if (i > 0 && char.IsUpper(c))
                sb.Append('_');
            sb.Append(char.ToUpperInvariant(c));
        }

        return sb.ToString();
    }
}
