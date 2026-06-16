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
///
/// A separator is inserted only at a lower→upper boundary, so runs of consecutive capitals
/// (acronyms / brand names) stay intact: <c>OAuth → OAUTH</c>, not <c>O_AUTH</c>. The latter
/// label does not exist in <c>loan.partner_bank_adapter_type</c> (EMAIL/REST/OAUTH); mapping to it
/// makes Npgsql reject the enum at datasource init, which fails <em>every</em> LoanServiceDbContext
/// query with a 500.
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
            // Separate words at a lower→upper boundary only. Consecutive capitals are one
            // word (OAuth → OAUTH), so an uppercase preceded by another uppercase gets no '_'.
            if (i > 0 && char.IsUpper(c) && !char.IsUpper(clrName[i - 1]))
                sb.Append('_');
            sb.Append(char.ToUpperInvariant(c));
        }

        return sb.ToString();
    }
}
