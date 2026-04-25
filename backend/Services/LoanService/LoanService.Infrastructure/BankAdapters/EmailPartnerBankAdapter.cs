using LoanService.Application.Common.Interfaces;
using LoanService.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net.Http.Headers;
using System.Text.Json;

namespace LoanService.Infrastructure.BankAdapters;

/// <summary>
/// Partner bank adapter that submits loan application packages via email (SendGrid).
/// Attaches the PDF and sends to the bank's contact email.
/// Tracks the SendGrid message_id in the status log.
/// </summary>
public sealed class EmailPartnerBankAdapter(
    ILoanServiceDbContext db,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<EmailPartnerBankAdapter> logger) : IPartnerBankAdapter
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

        if (bank == null || string.IsNullOrEmpty(bank.ContactEmail))
        {
            logger.LogError("EmailPartnerBankAdapter: Bank {BankId} not found or has no contact email.", bankId);
            return BankSubmissionResult.Failure("Bank not found or contact email missing.");
        }

        var sendGridApiKey = configuration["SendGrid:ApiKey"];
        if (string.IsNullOrEmpty(sendGridApiKey))
        {
            logger.LogWarning("EmailPartnerBankAdapter: SendGrid API key not configured. Using mock response.");
            var mockRef = $"MOCK-{Guid.NewGuid():N}";
            return BankSubmissionResult.Success(mockRef, $"mock-msgid-{mockRef}");
        }

        try
        {
            var client = httpClientFactory.CreateClient("SendGrid");
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", sendGridApiKey);

            // Build SendGrid API payload
            var fromEmail = configuration["SendGrid:FromEmail"] ?? "noreply@snapaccount.in";
            var fromName = configuration["SendGrid:FromName"] ?? "SnapAccount";

            // Read PDF bytes from stream
            using var ms = new MemoryStream();
            await packagePdf.CopyToAsync(ms, ct);
            var pdfBase64 = Convert.ToBase64String(ms.ToArray());

            var payload = new
            {
                personalizations = new[]
                {
                    new { to = new[] { new { email = bank.ContactEmail, name = bank.Name } } }
                },
                from = new { email = fromEmail, name = fromName },
                subject = $"Loan Application Package — SnapAccount — AppID: {applicationId}",
                content = new[]
                {
                    new
                    {
                        type = "text/html",
                        value = $"""
                            <p>Dear {bank.Name} Team,</p>
                            <p>Please find attached the loan application package for Application ID: {applicationId}.</p>
                            <p><strong>Disclaimer:</strong> Prepared by SnapAccount from user-provided data.
                            Not a CA certification. Final lending decision rests with the partner bank.</p>
                            <p>Regards,<br/>SnapAccount Team</p>
                            """
                    }
                },
                attachments = new[]
                {
                    new
                    {
                        content = pdfBase64,
                        type = "application/pdf",
                        filename = $"loan-application-{applicationId}.pdf",
                        disposition = "attachment"
                    }
                }
            };

            var json = JsonSerializer.Serialize(payload);
            using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            var response = await client.PostAsync("https://api.sendgrid.com/v3/mail/send", content, ct);

            if (response.IsSuccessStatusCode)
            {
                // SendGrid returns X-Message-Id header
                var messageId = response.Headers.TryGetValues("X-Message-Id", out var vals)
                    ? vals.FirstOrDefault() ?? Guid.NewGuid().ToString()
                    : Guid.NewGuid().ToString();

                var bankRef = $"EMAIL-{DateTime.UtcNow:yyyyMMdd}-{applicationId.ToString()[..8].ToUpper()}";
                logger.LogInformation(
                    "EmailPartnerBankAdapter: Submitted application {AppId} to {Bank}. MessageId: {MsgId}",
                    applicationId, bank.Name, messageId);

                return BankSubmissionResult.Success(bankRef, messageId);
            }

            var errorBody = await response.Content.ReadAsStringAsync(ct);
            logger.LogError(
                "EmailPartnerBankAdapter: SendGrid returned {Status} for app {AppId}. Body: {Body}",
                response.StatusCode, applicationId, errorBody);
            return BankSubmissionResult.Failure($"SendGrid error: {response.StatusCode}");
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "EmailPartnerBankAdapter: Exception submitting application {AppId} to bank {BankId}",
                applicationId, bankId);
            return BankSubmissionResult.Failure($"Email submission failed: {ex.Message}");
        }
    }
}
