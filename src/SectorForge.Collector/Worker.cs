using SectorForge.Collector.Adapters;

namespace SectorForge.Collector;

public sealed class Worker(FakeTelemetryAdapter adapter, ILogger<Worker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var sample in adapter.RunAsync(stoppingToken))
        {
            if (sample.Sequence % 60 == 0)
            {
                logger.LogInformation(
                    "{Source} lap {Lap} speed {Speed:0.0} kph rpm {Rpm:0}",
                    sample.Source.DisplayName,
                    sample.Lap.LapNumber,
                    sample.Vehicle.SpeedKph,
                    sample.Vehicle.Rpm);
            }
        }
    }
}
