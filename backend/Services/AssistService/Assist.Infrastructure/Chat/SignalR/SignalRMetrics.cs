using System.Diagnostics.Metrics;

namespace ChatService.Infrastructure.SignalR;

/// <summary>
/// Custom OpenTelemetry metrics for the SignalR / Chat service.
/// Meter name: <c>SnapAccount.Chat</c>.
/// Instruments:
/// <list type="bullet">
///   <item><term>signalr.connections.active</term><description>Active WebSocket connections (UpDownCounter).</description></item>
///   <item><term>signalr.fanout.failures</term><description>Count of IHubContext fan-out SendAsync failures (Counter).</description></item>
/// </list>
/// Register via <see cref="MeterName"/> in the host's <c>WithMetrics</c> call.
/// DG-INFRA-06: emits the metrics required by docs/devops/observability-slos.md lines 139, 142.
/// </summary>
public sealed class SignalRMetrics : IDisposable
{
    /// <summary>Meter name — add to OTel pipeline via <c>.AddMeter(SignalRMetrics.MeterName)</c>.</summary>
    public const string MeterName = "SnapAccount.Chat";

    private readonly Meter _meter;

    /// <summary>
    /// UpDownCounter tracking active WebSocket connections to the ChatHub.
    /// Incremented in <see cref="ChatHub.OnConnectedAsync"/> and decremented in
    /// <see cref="ChatHub.OnDisconnectedAsync"/>.
    /// </summary>
    public UpDownCounter<int> ActiveConnections { get; }

    /// <summary>
    /// Counter of failed <c>IHubContext.Clients.Group(...).SendAsync</c> calls.
    /// Incremented in <see cref="ChatHubNotifier"/> on each caught exception.
    /// </summary>
    public Counter<int> FanOutFailures { get; }

    /// <summary>Initialises the meter and all instruments.</summary>
    public SignalRMetrics()
    {
        _meter = new Meter(MeterName, "1.0.0");

        ActiveConnections = _meter.CreateUpDownCounter<int>(
            "signalr.connections.active",
            unit: "{connection}",
            description: "Number of active WebSocket connections to the ChatHub.");

        FanOutFailures = _meter.CreateCounter<int>(
            "signalr.fanout.failures",
            unit: "{failure}",
            description: "Number of IHubContext Group SendAsync failures (message fan-out errors).");
    }

    /// <inheritdoc />
    public void Dispose() => _meter.Dispose();
}
