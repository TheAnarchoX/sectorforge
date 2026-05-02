using SectorForge.Collector;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SectorForge.Api.Services;

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
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Collector:AutoStart"] = autoStart.ToString(),
                ["Collector:AdapterId"] = "fake"
            })
            .Build();

        return new CollectorAutoStartService(
            collector,
            configuration,
            NullLogger<CollectorAutoStartService>.Instance);
    }
}
