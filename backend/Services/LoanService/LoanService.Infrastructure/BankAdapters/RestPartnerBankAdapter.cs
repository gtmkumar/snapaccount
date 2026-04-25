using LoanService.Application.Common.Interfaces;
using LoanService.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LoanService.Infrastructure.BankAdapters;

/// <summary>
/// Partner bank adapter that submits via generic REST POST with OAuth2 client-credentials.
/// Signs the payload with HMAC-SHA256 using the bank's shared secret.
/// API config (base URL, client_id, client_secret) is decrypted from the database via ICredentialEncryptionService.
/// </summary>
public sealed class RestPartnerBankAdapter(
    ILoanServiceDbContext db,
    IHttpClientFactory httpClientFactory,
    ICredentialEncryptionService credentialEncryption,
    ILogger<RestPartnerBankAdapter> logger) : IPartnerBankAdapter
{
    /// <inheritdoc />
    public async Task<BankSubmissionResult> SubmitApplicationAsync(
        Guid applicationId,
        Guid bankId,
        Stream packagePdf,
        CancellationToken ct)
    {
        var bank = await db.PartnerBanks
            .Where(b => b.Id == bankId && b.DeletedAt == null)
            .FirstOrDefaultAsync(ct);

        if (bank is null || bank.ApiConfigEncrypted is null || bank.ApiConfigKeyRef is null)
        {
            logger.LogError(
                "RestPartnerBankAdapter: Bank {BankId} missing API config encryption or key ref.", bankId);
            return BankSubmissionResult.Failure("Bank REST configuration is incomplete.");
        }

        try
        {
            // P6-HANDOFF-27: Decrypt API config using ICredentialEncryptionService
            var configJson = await credentialEncryption.DecryptAsync(
                bank.ApiConfigEncrypted, bank.ApiConfigKeyRef, ct);

            using var configDoc = JsonDocument.Parse(configJson);
            var baseUrl = configDoc.RootElement.GetProperty("base_url").GetString()!;
            var clientId = configDoc.RootElement.GetProperty("client_id").GetString()!;
            var clientSecret = configDoc.RootElement.GetProperty("client_secret").GetString()!;

            var client = httpClientFactory.CreateClient("RestBankAdapter");

            // Step 1: OAuth2 client-credentials token
            var token = await GetOAuthTokenAsync(client, baseUrl, clientId, clientSecret, ct);
            if (token == null)
                return BankSubmissionResult.Failure("OAuth2 token acquisition failed.");

            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            // Step 2: Read PDF bytes
            using var ms = new MemoryStream();
            await packagePdf.CopyToAsync(ms, ct);
            var pdfBytes = ms.ToArray();

            // Step 3: Build submission payload
            var payload = JsonSerializer.Serialize(new
            {
                applicationId = applicationId.ToString(),
                submittedAt = DateTime.UtcNow.ToString("O"),
                source = "SnapAccount"
            });
            var payloadBytes = Encoding.UTF8.GetBytes(payload);

            // Step 4: HMAC-SHA256 sign the payload with webhook secret
            byte[]? webhookSecret = null;
            if (!string.IsNullOrEmpty(bank.WebhookSecretRef))
                webhookSecret = await credentialEncryption.GetWebhookSecretAsync(bank.WebhookSecretRef, ct);

            string? signature = null;
            if (webhookSecret != null)
                signature = Convert.ToHexString(HMACSHA256.HashData(webhookSecret, payloadBytes)).ToLowerInvariant();

            // Step 5: POST multipart form with PDF + JSON
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent(payload, Encoding.UTF8, "application/json"), "metadata");
            form.Add(new ByteArrayContent(pdfBytes), "document", $"loan-{applicationId}.pdf");

            var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/loan-applications")
            {
                Content = form
            };
            if (signature != null)
                request.Headers.Add("X-Signature", signature);
            request.Headers.Add("X-Source", "SnapAccount");

            var response = await client.SendAsync(request, ct);

            if (response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(ct);
                using var respDoc = JsonDocument.Parse(body);
                var bankRef = respDoc.RootElement.TryGetProperty("referenceNo", out var rf)
                    ? rf.GetString() ?? $"REST-{applicationId.ToString()[..8].ToUpper()}"
                    : $"REST-{applicationId.ToString()[..8].ToUpper()}";

                logger.LogInformation(
                    "RestPartnerBankAdapter: Submitted app {AppId} to bank {BankId}. Ref: {Ref}",
                    applicationId, bankId, bankRef);
                return BankSubmissionResult.Success(bankRef);
            }

            var err = await response.Content.ReadAsStringAsync(ct);
            logger.LogError(
                "RestPartnerBankAdapter: Bank {BankId} returned {Status} for app {AppId}. Body: {Body}",
                bankId, response.StatusCode, applicationId, err);
            return BankSubmissionResult.Failure($"Bank API error: {response.StatusCode}");
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "RestPartnerBankAdapter: Exception for app {AppId} bank {BankId}", applicationId, bankId);
            return BankSubmissionResult.Failure($"REST submission failed: {ex.Message}");
        }
    }

    private static async Task<string?> GetOAuthTokenAsync(
        HttpClient client, string baseUrl, string clientId, string clientSecret, CancellationToken ct)
    {
        using var form = new FormUrlEncodedContent(
        [
            new KeyValuePair<string, string>("grant_type", "client_credentials"),
            new KeyValuePair<string, string>("client_id", clientId),
            new KeyValuePair<string, string>("client_secret", clientSecret)
        ]);

        var response = await client.PostAsync($"{baseUrl}/oauth/token", form, ct);
        if (!response.IsSuccessStatusCode) return null;

        var body = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.TryGetProperty("access_token", out var at)
            ? at.GetString()
            : null;
    }
}
