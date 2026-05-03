using Microsoft.Extensions.Options;
using SectorForge.Collector;
using SectorForge.Core.Telemetry.Configuration;

namespace SectorForge.Api.Services;

public sealed class CollectorAutoStartService(
    TelemetryCollectorService collector,
    IOptions<CollectorOptions> collectorOptions,
    ILogger<CollectorAutoStartService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var options = collectorOptions.Value;
        if (!options.AutoStart)
        {
            return;
        }

        var adapterId = string.IsNullOrWhiteSpace(options.AdapterId) ? "fake" : options.AdapterId;
        logger.LogInformation("Auto-starting telemetry collector with adapter {AdapterId}", adapterId);
        await collector.StartAsync(adapterId, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return collector.StopAsync(cancellationToken);
    }
}
