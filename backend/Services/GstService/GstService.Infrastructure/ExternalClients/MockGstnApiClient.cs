using GstService.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace GstService.Infrastructure.ExternalClients;

/// <summary>
/// Mock GSTN API client — used when <c>GST_PRODUCTION_APIS_ENABLED</c> is not "true".
/// Returns deterministic responses suitable for development and testing.
/// </summary>
public sealed class MockGstnApiClient(ILogger<MockGstnApiClient> logger) : IGstnApiClient
{
    /// <inheritdoc />
    public Task<GstnApiResult> GetGstr2AAsync(string gstin, int year, int month, CancellationToken ct = default)
    {
        logger.LogInformation("[MOCK] GetGstr2A gstin={Gstin} period={Year}-{Month}", gstin, year, month);
        return Task.FromResult(new GstnApiResult(
            IsSuccess: true,
            Arn: null,
            RedactedResponseJson: """{"data":[],"gstin":"{gstin}","status":"NO_DATA"}""".Replace("{gstin}", gstin),
            ErrorMessage: null));
    }

    /// <inheritdoc />
    public Task<GstnApiResult> FileNilReturnAsync(string gstin, string returnType, int year, int month, CancellationToken ct = default)
    {
        var mockArn = $"AA{DateTime.UtcNow:yyyyMMddHHmmss}MOCK";
        logger.LogInformation("[MOCK] FileNilReturn gstin={Gstin} returnType={ReturnType} arn={Arn}", gstin, returnType, mockArn);
        return Task.FromResult(new GstnApiResult(
            IsSuccess: true,
            Arn: mockArn,
            RedactedResponseJson: $$$"""{"arn":"{{{mockArn}}}","status":"CNF","errorcd":"","message":"Nil Return Filed"}""",
            ErrorMessage: null));
    }
}
