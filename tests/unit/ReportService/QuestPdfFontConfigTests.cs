// Unit tests: NEW-D17 — QuestPDF bundled-font registration must be safe and idempotent.
//
// The registration runs once at Finance startup (AddReportInfrastructure). It must never
// throw when the fonts directory is absent (local dev / CI without /app/fonts) — a missing
// directory only means Indic glyphs fall back, which is acceptable outside the container.

using FluentAssertions;
using ReportService.Infrastructure.Reports;
using Xunit;

namespace ReportService.Tests;

[Trait("Category", "Unit")]
public sealed class QuestPdfFontConfigTests
{
    [Fact]
    public void RegisterBundledFonts_NullPath_DoesNotThrow()
    {
        var act = () => QuestPdfFontConfig.RegisterBundledFonts(null);
        act.Should().NotThrow("startup font registration must be fail-safe");
    }

    [Fact]
    public void RegisterBundledFonts_MissingDirectory_ReturnsNonNegative_AndIsIdempotent()
    {
        // Nonexistent configured path + no QUESTPDF_FONTS_PATH + no /app/fonts in the test
        // environment → registration is a safe no-op rather than an exception.
        var first = QuestPdfFontConfig.RegisterBundledFonts("/no/such/snapaccount-fonts-dir");
        var second = QuestPdfFontConfig.RegisterBundledFonts("/no/such/snapaccount-fonts-dir");

        first.Should().BeGreaterThanOrEqualTo(0);
        second.Should().Be(0, "registration is idempotent — at most one pass per process");
    }

    [Fact]
    public void RegisteredFamilyNames_AreTheExpectedNotoFamilies()
    {
        // Pins the family names the Dockerfile-bundled Noto fonts register under; QuestPDF's
        // automatic glyph fallback draws Devanagari/Bengali from exactly these families.
        QuestPdfFontConfig.DevanagariFamily.Should().Be("Noto Sans Devanagari");
        QuestPdfFontConfig.BengaliFamily.Should().Be("Noto Sans Bengali");
    }
}
