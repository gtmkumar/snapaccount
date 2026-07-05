using GstService.Application.Common.Interfaces;
using GstService.Application.Interfaces;
using GstService.Domain.Entities;
using SnapAccount.Shared.Application;
using SnapAccount.Shared.Domain;

namespace GstService.Application.EWayBills.Commands.CreateEWayBill;

/// <summary>
/// Creates an E-Way Bill via the NIC EWB portal.
/// Mandatory for goods movement exceeding INR 50,000.
/// Stores EWB record in gst.e_way_bills (canonical table per P6-HANDOFF-13).
/// P6-HANDOFF-15: Payloads stored with auth tokens redacted.
/// Phase 6B: replaces the NotImplementedException stub.
/// </summary>
public sealed class CreateEWayBillCommandHandler(
    IGstDbContext dbContext,
    IEwbClient ewbClient) : ICommandHandler<CreateEWayBillCommand, CreateEWayBillResponse>
{
    /// <inheritdoc />
    public async Task<Result<CreateEWayBillResponse>> Handle(
        CreateEWayBillCommand request,
        CancellationToken cancellationToken)
    {
        var ewbPayload = new EwbPayload(
            SupplyType: request.SupplyType,
            SubSupplyType: null,
            TotalValue: request.TotalValue,
            SupplierGstin: null, // populated from invoice if linked
            BuyerGstin: null,
            FromPlace: request.FromPlace,
            FromPincode: null,
            ToPlace: request.ToPlace,
            ToPincode: null,
            TransporterId: null,
            VehicleNumber: request.VehicleNumber,
            VehicleType: "R",
            DistanceKm: null);

        var ewbResult = await ewbClient.GenerateEwbAsync(ewbPayload, cancellationToken);

        if (!ewbResult.IsSuccess || ewbResult.EwbNumber is null)
            return new Error("EWayBill.GenerationFailed",
                $"EWB generation failed: {ewbResult.ErrorMessage}");

        var ewayBill = EWayBill.Create(
            request.OrganizationId,
            request.SupplyType,
            request.TotalValue,
            request.FromPlace,
            request.ToPlace);

        if (request.GstInvoiceId.HasValue)
            ewayBill.SetInvoiceLink(request.GstInvoiceId.Value);

        ewayBill.SetVehicle(request.VehicleNumber);
        ewayBill.SetGenerated(ewbResult.EwbNumber, ewbResult.ValidUpto ?? DateTime.UtcNow.AddDays(1));

        dbContext.EWayBills.Add(ewayBill);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new CreateEWayBillResponse(ewbResult.EwbNumber, ewbResult.ValidUpto ?? DateTime.UtcNow.AddDays(1));
    }
}
