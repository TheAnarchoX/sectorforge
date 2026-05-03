using SectorForge.Collector;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SectorForge.Api.Services;
using SectorForge.Core.Telemetry.Configuration;

namespace SectorForge.Api.Tests;

public sealed class CollectorAutoStartServiceTests
{
    [Fact]
    public async Task StartAsyncDoesNothingWhenAutoStartIsDisabled()
    {
        var publisher = new RecordingTelemetryPublisher();
        await using var collector = TelemetryTestHarness.CreateCollector(new BlockingTelemetryAdapter(), publisher);
        var service = CreateService(collector, autoStart: false);

        await service.StartAsync(CancellationToken.None);

        Assert.False(collector.GetStatus().IsRunning);
        Assert.Empty(publisher.StatusUpdates);
    }

    [Fact]
    public async Task StartAsyncStartsCollectorAndStopAsyncStopsItWhenAutoStartIsEnabled()
    {
        var publisher = new RecordingTelemetryPublisher();
        await using var collector = TelemetryTestHarness.CreateCollector(new BlockingTelemetryAdapter(), publisher);
        var service = CreateService(collector, autoStart: true);

        await service.StartAsync(CancellationToken.None);
        await TelemetryTestHarness.WaitForConditionAsync(() => collector.GetStatus().IsRunning, TimeSpan.FromSeconds(1));

        var runningStatus = collector.GetStatus();
        Assert.True(runningStatus.IsRunning);
        Assert.Equal("fake", runningStatus.ActiveAdapterId);

        await service.StopAsync(CancellationToken.None);

        Assert.False(collector.GetStatus().IsRunning);
        Assert.Contains(publisher.StatusUpdates, update => update.IsRunning);
        Assert.Contains(publisher.StatusUpdates, update => !update.IsRunning);
    }

    private static CollectorAutoStartService CreateService(TelemetryCollectorService collector, bool autoStart)
    {
        var options = Options.Create(new CollectorOptions
        {
            AutoStart = autoStart,
            AdapterId = "fake"
        });

        return new CollectorAutoStartService(
            collector,
            options,
            NullLogger<CollectorAutoStartService>.Instance);
    }
}
