using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using DocumentService.Application.Interfaces;
using Microsoft.Extensions.Logging;
using SnapAccount.Shared.Domain;
using SnapAccount.Shared.Infrastructure.Storage;

namespace DocumentService.Infrastructure.Services.Ocr;

/// <summary>
/// OCR/extraction via the Google AI Studio Gemini API (free tier). Sends the document image
/// inline and asks Gemini to return structured JSON fields. The API key + model are supplied by
/// the resolver (from the platform AI config); this class is created per-request, not via DI.
/// </summary>
public sealed class GeminiOcrService(
    HttpClient http,
    ICloudStorageService storage,
    string apiKey,
    string model,
    ILogger logger) : IOcrService
{
    private const string Prompt =
        "You are an OCR extraction engine for Indian business bills/invoices/receipts. " +
        "Extract these fields from the document image and return ONLY a compact JSON object " +
        "(no markdown, no prose) with string values: " +
        "{\"vendor_name\":\"\",\"amount\":\"\",\"document_date\":\"YYYY-MM-DD\",\"gstin\":\"\"," +
        "\"invoice_number\":\"\",\"gst_rate\":\"\"}. " +
        "amount = grand total as a plain number. Omit a field (empty string) if not present.";

    public async Task<Result<OcrExtractedData>> ExtractAsync(string storagePath, string mimeType, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            if (string.IsNullOrEmpty(apiKey))
                return new Error("Ocr.GeminiNoKey", "No Gemini API key configured.");

            byte[] imageBytes;
            await using (var src = await storage.DownloadAsync(storagePath, ct))
            using (var ms = new MemoryStream())
            {
                await src.CopyToAsync(ms, ct);
                imageBytes = ms.ToArray();
            }

            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
            var payload = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new object[]
                        {
                            new { text = Prompt },
                            new { inline_data = new { mime_type = mimeType, data = Convert.ToBase64String(imageBytes) } },
                        },
                    },
                },
                generationConfig = new { temperature = 0.0, responseMimeType = "application/json" },
            };

            using var resp = await http.PostAsJsonAsync(url, payload, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync(ct);
                logger.LogWarning("Gemini OCR HTTP {Code}: {Err}", (int)resp.StatusCode, err.Length > 300 ? err[..300] : err);
                return new Error("Ocr.GeminiHttp", $"Gemini returned {(int)resp.StatusCode}.");
            }

            var json = await resp.Content.ReadAsStringAsync(ct);
            var text = ExtractText(json);
            if (string.IsNullOrWhiteSpace(text))
                return new Error("Ocr.GeminiEmpty", "Gemini returned no content.");

            var fields = ParseFields(text);
            // Confidence proxy: fraction of the 6 expected fields populated.
            var hits = new[] { "vendor_name", "amount", "document_date", "gstin", "invoice_number", "gst_rate" }
                .Count(k => fields.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v));
            var confidence = Math.Round((decimal)hits / 6m, 2);

            var (inTok, outTok) = ExtractTokenUsage(json);
            var raw = JsonSerializer.Serialize(new { provider = "GEMINI", model, fields });
            return new OcrExtractedData(confidence, fields, raw, (int)sw.ElapsedMilliseconds, inTok, outTok);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Gemini OCR failed.");
            return new Error("Ocr.GeminiError", $"Gemini OCR failed: {ex.Message}");
        }
    }

    private static string? ExtractText(string responseJson)
    {
        using var doc = JsonDocument.Parse(responseJson);
        return doc.RootElement
            .GetProperty("candidates")[0]
            .GetProperty("content")
            .GetProperty("parts")[0]
            .GetProperty("text")
            .GetString();
    }

    private static (int input, int output) ExtractTokenUsage(string responseJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(responseJson);
            if (doc.RootElement.TryGetProperty("usageMetadata", out var um))
            {
                var inTok = um.TryGetProperty("promptTokenCount", out var p) ? p.GetInt32() : 0;
                var outTok = um.TryGetProperty("candidatesTokenCount", out var c) ? c.GetInt32() : 0;
                return (inTok, outTok);
            }
        }
        catch { /* no usage metadata */ }
        return (0, 0);
    }

    private static Dictionary<string, string> ParseFields(string modelText)
    {
        var result = new Dictionary<string, string>();
        try
        {
            // Gemini returns JSON (responseMimeType=application/json); strip any stray fencing.
            var s = modelText.Trim();
            if (s.StartsWith("```")) s = s.Trim('`').Replace("json", "", StringComparison.OrdinalIgnoreCase).Trim();
            using var doc = JsonDocument.Parse(s);
            foreach (var p in doc.RootElement.EnumerateObject())
            {
                var val = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : p.Value.ToString();
                if (!string.IsNullOrWhiteSpace(val)) result[p.Name] = val!;
            }
        }
        catch { /* non-JSON response — leave fields empty */ }
        return result;
    }
}
