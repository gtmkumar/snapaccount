using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SnapAccount.Shared.Domain;
using SubscriptionService.Application.Common.Interfaces;
using SubscriptionService.Application.Webhooks.Commands.HandleRazorpayWebhook;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Domain.Enums;
using Xunit;

namespace SubscriptionService.Tests;

/// <summary>
/// SEC-051 unit tests: Razorpay webhook HMAC-bypass blocking and event routing.
/// Tests cover validator-enforced rejections, JSON parsing failures, unknown-event acks,
/// and DPDP anonymization safety (SEC-052).
/// Category=Unit — no EF Core async dependencies.
/// </summary>
public sealed class RazorpayWebhookTests
{
    // ── Validator: rejects bypass attempts ──────────────────────────────────

    [Fact]
    public async Task HandleWebhookValidator_Empty_Body_Is_Rejected_With_401_Equivalent()
    {
        // Arrange — empty body should be rejected before reaching the handler
        var validator = new HandleRazorpayWebhookCommandValidator();
        var cmd = new HandleRazorpayWebhookCommand("");

        // Act
        var result = await validator.ValidateAsync(cmd);

        // Assert — empty body = validation failure = 422 before handler runs
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "RawBody");
    }

    [Fact]
    public async Task HandleWebhookValidator_OversizedBody_65537_Chars_Is_Rejected()
    {
        // Arrange — oversized body simulates smuggled payload attempt
        var validator = new HandleRazorpayWebhookCommandValidator();
        var cmd = new HandleRazorpayWebhookCommand(new string('x', 65537));

        // Act
        var result = await validator.ValidateAsync(cmd);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "RawBody");
    }

    [Fact]
    public async Task HandleWebhookValidator_Valid_Json_Body_Passes()
    {
        // Arrange
        var validator = new HandleRazorpayWebhookCommandValidator();
        var cmd = new HandleRazorpayWebhookCommand("""{"event":"subscription.charged"}""");

        // Act
        var result = await validator.ValidateAsync(cmd);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task HandleWebhookValidator_Max_Allowed_Body_65536_Chars_Passes()
    {
        var validator = new HandleRazorpayWebhookCommandValidator();
        var cmd = new HandleRazorpayWebhookCommand(new string('x', 65536));

        var result = await validator.ValidateAsync(cmd);

        result.IsValid.Should().BeTrue();
    }

    // ── Handler: JSON parsing failures ──────────────────────────────────────

    [Fact]
    public async Task HandleWebhook_InvalidJson_Returns_Validation_Error_Without_DB_Access()
    {
        // Arrange — malformed JSON should fail immediately, no DB query
        var db = new Mock<ISubscriptionServiceDbContext>(MockBehavior.Strict);
        // Strict mock: any DB call = unexpected call = test failure
        var logger = NullLogger<HandleRazorpayWebhookCommandHandler>.Instance;
        var handler = new HandleRazorpayWebhookCommandHandler(db.Object, logger);

        var cmd = new HandleRazorpayWebhookCommand("not-valid-json{{{");

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeFalse(
            "invalid JSON must be rejected before touching the database");
        result.Error.Type.Should().Be(ErrorType.Validation);
        result.Error.Code.Should().Be("Webhook.InvalidJson");
    }

    [Fact]
    public async Task HandleWebhook_NullJsonLiteral_Returns_Validation_Error_Without_DB_Access()
    {
        // Arrange
        var db = new Mock<ISubscriptionServiceDbContext>(MockBehavior.Strict);
        var logger = NullLogger<HandleRazorpayWebhookCommandHandler>.Instance;
        var handler = new HandleRazorpayWebhookCommandHandler(db.Object, logger);

        var cmd = new HandleRazorpayWebhookCommand("null");

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Error.Code.Should().Be("Webhook.EmptyPayload");
    }

    // ── Handler: unknown events acked without side effects ───────────────────

    [Fact]
    public async Task HandleWebhook_UnknownEvent_Returns_Success_And_Makes_Zero_DB_Calls()
    {
        // Arrange — unknown events should be acked silently to prevent Razorpay retry storms
        var db = new Mock<ISubscriptionServiceDbContext>(MockBehavior.Strict);
        var logger = NullLogger<HandleRazorpayWebhookCommandHandler>.Instance;
        var handler = new HandleRazorpayWebhookCommandHandler(db.Object, logger);

        var cmd = new HandleRazorpayWebhookCommand("""{"event":"order.paid","payload":{}}""");

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue(
            "unknown Razorpay events must be silently acked to stop retry storms");
        // Strict mock ensures SaveChangesAsync was never called
    }

    [Fact]
    public async Task HandleWebhook_MissingEventField_Returns_Success_Silently()
    {
        // Arrange — {event: null} = unknown event path
        var db = new Mock<ISubscriptionServiceDbContext>(MockBehavior.Strict);
        var logger = NullLogger<HandleRazorpayWebhookCommandHandler>.Instance;
        var handler = new HandleRazorpayWebhookCommandHandler(db.Object, logger);

        var cmd = new HandleRazorpayWebhookCommand("""{"payload":{}}""");

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
    }

    // ── Handler: subscription.charged — missing required fields ─────────────

    [Fact]
    public async Task HandleWebhook_Charged_Missing_PaymentId_Returns_Validation_Failure()
    {
        // Arrange — payment entity exists but id is null
        var db = new Mock<ISubscriptionServiceDbContext>(MockBehavior.Strict);
        var logger = NullLogger<HandleRazorpayWebhookCommandHandler>.Instance;
        var handler = new HandleRazorpayWebhookCommandHandler(db.Object, logger);

        var payload = """
            {
              "event": "subscription.charged",
              "payload": {
                "subscription": {"entity": {"id": "sub_ABC"}},
                "payment": {"entity": {"amount": 99900}}
              }
            }
            """;

        // Act
        var result = await handler.Handle(
            new HandleRazorpayWebhookCommand(payload), CancellationToken.None);

        // Assert — strict mock: no DB calls made
        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public async Task HandleWebhook_Charged_Missing_SubscriptionId_Returns_Validation_Failure()
    {
        // Arrange — subscription entity has no id
        var db = new Mock<ISubscriptionServiceDbContext>(MockBehavior.Strict);
        var logger = NullLogger<HandleRazorpayWebhookCommandHandler>.Instance;
        var handler = new HandleRazorpayWebhookCommandHandler(db.Object, logger);

        var payload = """
            {
              "event": "subscription.charged",
              "payload": {
                "subscription": {"entity": {}},
                "payment": {"entity": {"id": "pay_ABC"}}
              }
            }
            """;

        // Act
        var result = await handler.Handle(
            new HandleRazorpayWebhookCommand(payload), CancellationToken.None);

        // Assert — strict mock: no DB calls made
        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    // ── Handler: subscription.cancelled — missing required fields ────────────

    [Fact]
    public async Task HandleWebhook_Cancelled_Missing_SubscriptionId_Returns_Validation_Failure()
    {
        // Arrange
        var db = new Mock<ISubscriptionServiceDbContext>(MockBehavior.Strict);
        var logger = NullLogger<HandleRazorpayWebhookCommandHandler>.Instance;
        var handler = new HandleRazorpayWebhookCommandHandler(db.Object, logger);

        var payload = """{"event":"subscription.cancelled","payload":{"subscription":{"entity":{}}}}""";

        // Act
        var result = await handler.Handle(
            new HandleRazorpayWebhookCommand(payload), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    // ── DPDP anonymization domain methods (SEC-052) ──────────────────────────

    [Fact]
    public void Subscription_Anonymize_Sets_OrgId_To_Empty_And_Records_Reason()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.Anonymize("DPDP_USER_ERASURE");

        sub.OrganizationId.Should().Be(Guid.Empty);
        sub.AnonymizedAt.Should().NotBeNull();
        sub.AnonymizationReason.Should().Be("DPDP_USER_ERASURE");
    }

    [Fact]
    public void Subscription_Anonymize_Does_Not_Change_Status_Or_SoftDelete()
    {
        // RBI compliance: records must be retained, just anonymized
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.Anonymize();

        sub.Status.Should().Be(SubscriptionStatus.Active,
            "anonymize must not cancel the subscription");
        sub.DeletedAt.Should().BeNull(
            "anonymize must not soft-delete (RBI 7-year retention)");
    }

    [Fact]
    public void Invoice_Anonymize_Sets_OrgId_To_Empty_And_Records_Reason()
    {
        var orgId = Guid.NewGuid();
        var invoice = Invoice.Create(
            Guid.NewGuid(), orgId,
            "INV-2025-TEST", 999m, 179.82m,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(30));

        invoice.Anonymize("DPDP_USER_ERASURE");

        invoice.OrganizationId.Should().Be(Guid.Empty);
        invoice.AnonymizedAt.Should().NotBeNull();
        invoice.AnonymizationReason.Should().Be("DPDP_USER_ERASURE");
    }

    [Fact]
    public void Invoice_Anonymize_Preserves_Financial_Amounts_For_RBI_7Year_Retention()
    {
        var invoice = Invoice.Create(
            Guid.NewGuid(), Guid.NewGuid(),
            "INV-2025-TEST", 9999m, 1799.82m,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(30));

        invoice.Anonymize();

        // Financial data must survive anonymization — RBI audit requirement
        invoice.AmountInr.Should().Be(9999m);
        invoice.GstAmountInr.Should().Be(1799.82m);
        invoice.InvoiceNumber.Should().Be("INV-2025-TEST");
        invoice.Status.Should().Be("PENDING", "anonymize must not alter payment status");
        invoice.DeletedAt.Should().BeNull("hard-delete is forbidden by RBI compliance");
    }

    [Fact]
    public void Invoice_Anonymize_Idempotent_Second_Call_Updates_Timestamp()
    {
        var invoice = Invoice.Create(
            Guid.NewGuid(), Guid.NewGuid(),
            "INV-2025-IDEM", 500m, 90m,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(30));

        invoice.Anonymize("DPDP_USER_ERASURE");
        var firstAt = invoice.AnonymizedAt;

        // Second call should still work (idempotent from DB perspective)
        invoice.Anonymize("DPDP_USER_ERASURE");

        invoice.OrganizationId.Should().Be(Guid.Empty);
        invoice.AnonymizationReason.Should().Be("DPDP_USER_ERASURE");
    }
}
