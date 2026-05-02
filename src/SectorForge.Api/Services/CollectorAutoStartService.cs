using SectorForge.Collector;

namespace SectorForge.Api.Services;

public sealed class CollectorAutoStartService(
    TelemetryCollectorService collector,
    IConfiguration configuration,
    ILogger<CollectorAutoStartService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!configuration.GetValue("Collector:AutoStart", false))
        {
            return;
        }

        var adapterId = configuration.GetValue("Collector:AdapterId", "fake") ?? "fake";
        logger.LogInformation("Auto-starting telemetry collector with adapter {AdapterId}", adapterId);
        await collector.StartAsync(adapterId, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return collector.StopAsync(cancellationToken);
    }
}
