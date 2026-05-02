using Microsoft.AspNetCore.SignalR;
using SectorForge.Collector;

namespace SectorForge.Api.Hubs;

public sealed class TelemetryHub(TelemetryCollectorService collector) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var status = collector.GetStatus();
        await Clients.Caller.SendAsync("collectorStatus", status, Context.ConnectionAborted);

        if (status.LatestSample is not null)
        {
            await Clients.Caller.SendAsync("telemetrySample", status.LatestSample, Context.ConnectionAborted);
        }

        await base.OnConnectedAsync();
    }
}
