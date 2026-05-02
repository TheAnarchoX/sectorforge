using Microsoft.AspNetCore.SignalR;
using SectorForge.Api.Hubs;
using SectorForge.Core.Telemetry;

namespace SectorForge.Api.Services;

public sealed class SignalRTelemetryPublisher(IHubContext<TelemetryHub> hubContext) : ILiveTelemetryPublisher
{
    public Task PublishAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
    {
        return hubContext.Clients.All.SendAsync("telemetrySample", sample, cancellationToken);
    }

    public Task PublishStatusAsync(TelemetryReceiverStatus status, CancellationToken cancellationToken = default)
    {
        return hubContext.Clients.All.SendAsync("collectorStatus", status, cancellationToken);
    }
}
