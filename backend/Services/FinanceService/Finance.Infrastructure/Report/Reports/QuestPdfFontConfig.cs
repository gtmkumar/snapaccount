using QuestPDF.Drawing;

namespace ReportService.Infrastructure.Reports;

/// <summary>
/// NEW-D17: Registers the bundled Latin + Indic <c>.ttf</c> fonts with QuestPDF so loan
/// packages, chat-thread exports and financial reports render Hindi (Devanagari) and
/// Bengali text instead of fallback tofu glyphs.
///
/// The fonts are fetched into <c>/app/fonts</c> at Docker image build time
/// (see <c>backend/Dockerfile</c>) — they were being copied into the image but never
/// registered with QuestPDF, so they sat unused. For a local <c>dotnet run</c> set
/// <c>QUESTPDF_FONTS_PATH</c> or drop the <c>.ttf</c> files under <c>{BaseDirectory}/fonts</c>.
///
/// Once registered, QuestPDF 2024.3+ performs <b>automatic glyph fallback</b> across all
/// registered fonts, so no per-document <c>Fallback</c>/<c>FontFamily</c> wiring is needed —
/// Devanagari/Bengali codepoints resolve to the Noto fonts automatically.
/// </summary>
public static class QuestPdfFontConfig
{
    private static readonly object Gate = new();
    private static bool _registered;

    /// <summary>QuestPDF family name of the bundled Devanagari (Hindi) font, from its name table.</summary>
    public const string DevanagariFamily = "Noto Sans Devanagari";

    /// <summary>QuestPDF family name of the bundled Bengali font.</summary>
    public const string BengaliFamily = "Noto Sans Bengali";

    /// <summary>
    /// Registers every <c>*.ttf</c> found under the resolved fonts directory. Idempotent
    /// (registers at most once per process) and never throws — a missing directory only
    /// means Indic glyphs fall back to tofu, which is acceptable in local dev.
    /// </summary>
    /// <param name="configuredPath">Optional path from configuration (<c>QuestPdf:FontsPath</c>).</param>
    /// <returns>Number of font files registered.</returns>
    public static int RegisterBundledFonts(string? configuredPath = null)
    {
        lock (Gate)
        {
            if (_registered)
                return 0;

            var dir = ResolveFontsDirectory(configuredPath);
            var count = 0;
            try
            {
                if (dir is not null)
                {
                    foreach (var ttf in Directory.EnumerateFiles(dir, "*.ttf", SearchOption.AllDirectories))
                    {
                        using var stream = File.OpenRead(ttf);
                        FontManager.RegisterFont(stream);
                        count++;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(
                    $"[QuestPdfFontConfig] Error registering fonts from '{dir}': {ex.Message}");
            }

            if (count == 0)
                Console.Error.WriteLine(
                    $"[QuestPdfFontConfig] No .ttf fonts registered (searched '{dir ?? "<none found>"}'). " +
                    "Indic (Hindi/Bengali) PDF text will render with fallback glyphs. " +
                    "Bundle fonts at /app/fonts or set QUESTPDF_FONTS_PATH.");

            _registered = true;
            return count;
        }
    }

    /// <summary>Returns the first existing fonts directory among env / config / image / local candidates.</summary>
    private static string? ResolveFontsDirectory(string? configuredPath)
    {
        var candidates = new[]
        {
            Environment.GetEnvironmentVariable("QUESTPDF_FONTS_PATH"),
            configuredPath,
            "/app/fonts",
            Path.Combine(AppContext.BaseDirectory, "fonts"),
        };

        return candidates.FirstOrDefault(p => !string.IsNullOrWhiteSpace(p) && Directory.Exists(p));
    }
}
