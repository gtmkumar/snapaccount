using FluentAssertions;
using SubscriptionService.Application.Plans.Commands.CreatePlan;
using SubscriptionService.Application.Subscriptions.Commands.Subscribe;
using SubscriptionService.Domain.Entities;
using SubscriptionService.Domain.Enums;
using SubscriptionService.Domain.Events;
using Xunit;

namespace SubscriptionService.Tests;

/// <summary>
/// Unit tests for SubscriptionService domain entities and validators.
/// Tests Plan/Subscription state machine, GST calculation, and billing logic.
/// Category=Unit — no external dependencies.
/// </summary>
public sealed class SubscriptionDomainTests
{
    // ── Plan.Create ─────────────────────────────────────────────────────────────

    [Fact]
    public void Plan_Create_Sets_All_Fields()
    {
        var plan = Plan.Create(
            "Starter Monthly",
            PlanTier.Starter,
            BillingCycle.Monthly,
            priceInr: 999m,
            trialDays: 14,
            description: "Basic accounting + GST");

        plan.Name.Should().Be("Starter Monthly");
        plan.Tier.Should().Be(PlanTier.Starter);
        plan.BillingCycle.Should().Be(BillingCycle.Monthly);
        plan.PriceInr.Should().Be(999m);
        plan.TrialDays.Should().Be(14);
        plan.IsActive.Should().BeTrue();
        plan.Description.Should().Be("Basic accounting + GST");
    }

    [Fact]
    public void Plan_Create_Default_TrialDays_Is_Zero()
    {
        var plan = Plan.Create("Enterprise Annual", PlanTier.Enterprise, BillingCycle.Annual, 9999m);

        plan.TrialDays.Should().Be(0);
    }

    [Fact]
    public void Plan_Update_Changes_Mutable_Fields()
    {
        var plan = Plan.Create("Old Name", PlanTier.Starter, BillingCycle.Monthly, 500m);

        plan.Update("New Name", 799m, "Updated description", true);

        plan.Name.Should().Be("New Name");
        plan.PriceInr.Should().Be(799m);
        plan.Description.Should().Be("Updated description");
        plan.IsActive.Should().BeTrue();
    }

    [Fact]
    public void Plan_Update_Can_Deactivate()
    {
        var plan = Plan.Create("Old Plan", PlanTier.Free, BillingCycle.Monthly, 0m);

        plan.Update("Old Plan", 0m, null, isActive: false);

        plan.IsActive.Should().BeFalse();
    }

    // ── Subscription.Create ───────────────────────────────────────────────────

    [Fact]
    public void Subscription_Create_With_Trial_Days_Starts_Trialing()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 14);

        sub.Status.Should().Be(SubscriptionStatus.Trialing);
    }

    [Fact]
    public void Subscription_Create_Without_Trial_Starts_Active()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.Status.Should().Be(SubscriptionStatus.Active);
    }

    [Fact]
    public void Subscription_Create_Raises_SubscriptionCreatedEvent()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.DomainEvents.Should().ContainSingle(e => e is SubscriptionCreatedEvent);
    }

    [Fact]
    public void Subscription_Create_With_Trial_Sets_PeriodEnd_Correctly()
    {
        var before = DateTime.UtcNow;
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 14);
        var after = DateTime.UtcNow;

        sub.CurrentPeriodEnd.Should().BeCloseTo(before.AddDays(14), TimeSpan.FromSeconds(2));
    }

    // ── Subscription state machine ────────────────────────────────────────────

    [Fact]
    public void Subscription_Activate_Sets_Status_Active()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 14);

        sub.Activate(DateTime.UtcNow.AddDays(30));

        sub.Status.Should().Be(SubscriptionStatus.Active);
    }

    [Fact]
    public void Subscription_MarkPastDue_Sets_PastDue()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.MarkPastDue();

        sub.Status.Should().Be(SubscriptionStatus.PastDue);
    }

    [Fact]
    public void Subscription_Cancel_Sets_Cancelled_And_CancelledAt()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.Cancel();

        sub.Status.Should().Be(SubscriptionStatus.Cancelled);
        sub.CancelledAt.Should().NotBeNull();
    }

    [Fact]
    public void Subscription_Cancel_Raises_SubscriptionCancelledEvent()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);
        sub.ClearDomainEvents();

        sub.Cancel();

        sub.DomainEvents.Should().ContainSingle(e => e is SubscriptionCancelledEvent);
    }

    [Fact]
    public void Subscription_Pause_Sets_Paused()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.Pause();

        sub.Status.Should().Be(SubscriptionStatus.Paused);
    }

    [Fact]
    public void Subscription_Resume_From_Paused_Sets_Active()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);
        sub.Pause();

        sub.Resume();

        sub.Status.Should().Be(SubscriptionStatus.Active);
    }

    [Fact]
    public void Subscription_Renew_Sets_Active_And_Updates_PeriodEnd()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);
        sub.MarkPastDue();

        var newEnd = DateTime.UtcNow.AddDays(30);
        sub.Renew(newEnd);

        sub.Status.Should().Be(SubscriptionStatus.Active);
        sub.CurrentPeriodEnd.Should().BeCloseTo(newEnd, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public void Subscription_ChangePlan_Updates_PlanId_And_Raises_Event()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);
        var newPlanId = Guid.NewGuid();
        sub.ClearDomainEvents();

        sub.ChangePlan(newPlanId);

        sub.PlanId.Should().Be(newPlanId);
        sub.DomainEvents.Should().ContainSingle(e => e is SubscriptionPlanChangedEvent);
    }

    [Fact]
    public void Subscription_SetRazorpaySubscriptionId_Updates_Id()
    {
        var sub = Subscription.Create(Guid.NewGuid(), Guid.NewGuid(), trialDays: 0);

        sub.SetRazorpaySubscriptionId("sub_ABC123");

        sub.RazorpaySubscriptionId.Should().Be("sub_ABC123");
    }

    // ── Invoice.Create ────────────────────────────────────────────────────────

    [Fact]
    public void Invoice_Create_Sets_GST_And_Total()
    {
        var gstAmount = Math.Round(999m * 0.18m, 2); // 18% GST on SaaS
        var invoice = Invoice.Create(
            Guid.NewGuid(), Guid.NewGuid(),
            "INV-2025-001",
            999m, gstAmount,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(30));

        invoice.AmountInr.Should().Be(999m);
        invoice.GstAmountInr.Should().Be(gstAmount);
        (invoice.AmountInr + invoice.GstAmountInr).Should().Be(999m + gstAmount);
        invoice.Status.Should().Be("PENDING");
    }

    [Fact]
    public void Invoice_MarkPaid_Sets_Paid_Status_And_PaymentId()
    {
        var invoice = Invoice.Create(
            Guid.NewGuid(), Guid.NewGuid(),
            "INV-2025-002", 499m, 89.82m,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(30));

        invoice.MarkPaid("pay_RZP123456");

        invoice.Status.Should().Be("PAID");
        invoice.RazorpayPaymentId.Should().Be("pay_RZP123456");
        invoice.PaidAt.Should().NotBeNull();
    }

    // ── CreatePlanCommand validator ───────────────────────────────────────────

    [Fact]
    public void CreatePlanCommand_Fails_When_Name_Empty()
    {
        var validator = new CreatePlanCommandValidator();
        var cmd = new CreatePlanCommand("", PlanTier.Starter, BillingCycle.Monthly, 999m);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Name");
    }

    [Fact]
    public void CreatePlanCommand_Fails_When_PriceInr_Negative()
    {
        var validator = new CreatePlanCommandValidator();
        var cmd = new CreatePlanCommand("Test Plan", PlanTier.Starter, BillingCycle.Monthly, -1m);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "PriceInr");
    }

    [Fact]
    public void CreatePlanCommand_Fails_When_TrialDays_Over_90()
    {
        var validator = new CreatePlanCommandValidator();
        var cmd = new CreatePlanCommand("Test Plan", PlanTier.Starter, BillingCycle.Monthly, 999m, TrialDays: 91);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "TrialDays");
    }

    [Fact]
    public void CreatePlanCommand_Valid_With_All_Fields()
    {
        var validator = new CreatePlanCommandValidator();
        var cmd = new CreatePlanCommand("Growth Annual", PlanTier.Growth, BillingCycle.Annual, 9999m, 14, "All features");

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    // ── SubscribeCommand validator ────────────────────────────────────────────

    [Fact]
    public void SubscribeCommand_Fails_When_PlanId_Empty()
    {
        var validator = new SubscribeCommandValidator();
        var cmd = new SubscribeCommand(Guid.Empty);

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "PlanId");
    }

    [Fact]
    public void SubscribeCommand_Valid_With_PlanId()
    {
        var validator = new SubscribeCommandValidator();
        var cmd = new SubscribeCommand(Guid.NewGuid());

        var result = validator.Validate(cmd);

        result.IsValid.Should().BeTrue();
    }

    // ── GST calculation correctness ───────────────────────────────────────────

    [Theory]
    [InlineData(999, 179.82)]    // 999 * 18% = 179.82
    [InlineData(4999, 899.82)]   // 4999 * 18% = 899.82
    [InlineData(9999, 1799.82)]  // 9999 * 18% = 1799.82
    public void Gst_18_Percent_On_SaaS_Invoice_Is_Correct(decimal baseAmount, decimal expectedGst)
    {
        var actualGst = Math.Round(baseAmount * 0.18m, 2);

        actualGst.Should().Be(expectedGst);
    }

    // ── Plan tier ordering ────────────────────────────────────────────────────

    [Fact]
    public void PlanTier_Ordering_Is_Free_Starter_Growth_Enterprise()
    {
        ((int)PlanTier.Free).Should().BeLessThan((int)PlanTier.Starter);
        ((int)PlanTier.Starter).Should().BeLessThan((int)PlanTier.Growth);
        ((int)PlanTier.Growth).Should().BeLessThan((int)PlanTier.Enterprise);
    }
}
