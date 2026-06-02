using System.Diagnostics;
using System.Text.Json;
using DocumentService.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Storage;

namespace DocumentService.Infrastructure.Services.Ocr;

/// <summary>
/// Free, offline OCR via the local <c>tesseract</c> CLI. Default extraction provider for
/// local dev (and any deployment without a cloud AI key). Downloads the uploaded object from
/// the configured <see cref="ICloudStorageService"/>, runs Tesseract to get raw text, then uses
/// <see cref="ReceiptFieldParser"/> to derive structured fields.
///
/// Config (optional): <c>Ocr:TesseractPath</c> overrides the binary path; otherwise common
/// install locations are probed (Homebrew on macOS, /usr/bin on Linux), falling back to PATH.
/// Image inputs only (jpg/png/heic→handled by tesseract/leptonica). PDFs return a low-confidence
/// empty result (rasterising PDFs is out of scope for the free path).
/// </summary>
public sealed class TesseractOcrService(
    ICloudStorageService storage,
    IConfiguration configuration,
    ILogger<TesseractOcrService> logger) : IOcrService
{
    private static readonly string[] CandidatePaths =
        ["/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract", "/usr/bin/tesseract", "tesseract"];

    public async Task<Result<OcrExtractedData>> ExtractAsync(
        string storagePath, string mimeType, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();

        if (mimeType.Contains("pdf", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("Tesseract OCR: PDF input not supported on the free path ({Path}).", storagePath);
            return new OcrExtractedData(0m, new Dictionary<string, string>(), null, (int)sw.ElapsedMilliseconds);
        }

        var ext = mimeType.Contains("png", StringComparison.OrdinalIgnoreCase) ? ".png" : ".jpg";
        // Scratch dir for the image tesseract reads. Defaults to the OS temp dir (correct on real
        // machines); overridable via Ocr:ScratchDir for environments where the temp dir isn't
        // readable by spawned subprocesses (e.g. sandboxed CI/dev harnesses).
        var scratchDir = configuration["Ocr:ScratchDir"] is { Length: > 0 } sd ? sd : Path.GetTempPath();
        Directory.CreateDirectory(scratchDir);
        var tempImage = Path.Combine(scratchDir, $"ocr-{Guid.NewGuid():N}{ext}");

        try
        {
            // Pull the bytes from storage (LocalFileStorageService in dev, GCS otherwise).
            await using (var src = await storage.DownloadAsync(storagePath, ct))
            await using (var dst = File.Create(tempImage))
                await src.CopyToAsync(dst, ct);

            var (ok, text) = await RunTesseractAsync(tempImage, ct);
            if (!ok)
                return new Error("Ocr.TesseractFailed", "Tesseract OCR did not run successfully.");

            var parsed = ReceiptFieldParser.Parse(text);
            logger.LogInformation(
                "Tesseract OCR: extracted {FieldCount} fields (conf {Conf}) from {Path} in {Ms}ms.",
                parsed.Fields.Count, parsed.Confidence, storagePath, sw.ElapsedMilliseconds);

            // raw_response is a jsonb column — serialise as JSON (not plain text).
            var rawJson = JsonSerializer.Serialize(new
            {
                provider = "TESSERACT",
                text = text.Length > 8000 ? text[..8000] : text,
                fields = parsed.Fields,
            });

            return new OcrExtractedData(
                parsed.Confidence,
                parsed.Fields,
                rawJson,
                (int)sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Tesseract OCR failed for {Path}.", storagePath);
            return new Error("Ocr.TesseractError", $"OCR failed: {ex.Message}");
        }
        finally
        {
            try { if (File.Exists(tempImage)) File.Delete(tempImage); } catch { /* best-effort cleanup */ }
        }
    }

    private async Task<(bool ok, string text)> RunTesseractAsync(string imagePath, CancellationToken ct)
    {
        var binary = configuration["Ocr:TesseractPath"]
            ?? CandidatePaths.FirstOrDefault(p => p == "tesseract" || File.Exists(p))
            ?? "tesseract";

        var psi = new ProcessStartInfo
        {
            FileName = binary,
            // `stdout` makes tesseract write recognised text to stdout; --psm 6 = a single uniform block.
            ArgumentList = { imagePath, "stdout", "-l", "eng", "--psm", "6" },
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        try
        {
            using var proc = Process.Start(psi);
            if (proc is null) return (false, string.Empty);
            var stdoutTask = proc.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = proc.StandardError.ReadToEndAsync(ct);
            await proc.WaitForExitAsync(ct);
            var text = await stdoutTask;
            if (proc.ExitCode != 0)
            {
                logger.LogWarning("tesseract exited {Code}: {Err}", proc.ExitCode, await stderrTask);
                return (proc.ExitCode == 0, text);
            }
            return (true, text);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unable to launch tesseract binary '{Binary}'.", binary);
            return (false, string.Empty);
        }
    }
}
