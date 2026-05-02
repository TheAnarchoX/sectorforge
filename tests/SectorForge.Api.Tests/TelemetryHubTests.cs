using SectorForge.Collector;
using SectorForge.Api.Hubs;

namespace SectorForge.Api.Tests;

public sealed class TelemetryHubTests
{
    [Fact]
    public async Task OnConnectedAsyncSendsCollectorStatusWhenNoSampleIsAvailable()
    {
        var callerProxy = new RecordingClientProxy();
        await using var collector = TelemetryTestHarness.CreateCollector(new BlockingTelemetryAdapter());
        var hub = CreateHub(collector, callerProxy);

        await hub.OnConnectedAsync();

        var invocations = callerProxy.Invocations.ToArray();
        Assert.Single(invocations);
        Assert.Equal("collectorStatus", invocations[0].Method);
    }

    [Fact]
    public async Task OnConnectedAsyncSendsLatestSampleWhenCollectorHasOne()
    {
        var callerProxy = new RecordingClientProxy();
        await using var collector = TelemetryTestHarness.CreateCollector(new BlockingTelemetryAdapter());

        await collector.StartAsync("fake");
        await TelemetryTestHarness.WaitForConditionAsync(() => collector.GetStatus().LatestSample is not null, TimeSpan.FromSeconds(1));
        var latestSample = collector.GetStatus().LatestSample;
        var hub = CreateHub(collector, callerProxy);

        try
        {
            await hub.OnConnectedAsync();

            var invocations = callerProxy.Invocations.ToArray();
            Assert.Collection(
                invocations,
                statusInvocation => Assert.Equal("collectorStatus", statusInvocation.Method),
                sampleInvocation =>
                {
                    Assert.Equal("telemetrySample", sampleInvocation.Method);
                    Assert.Same(latestSample, sampleInvocation.Arguments[0]);
                });
        }
        finally
        {
            await collector.StopAsync(CancellationToken.None);
        }
    }

    private static TelemetryHub CreateHub(TelemetryCollectorService collector, RecordingClientProxy callerProxy)
    {
        return new TelemetryHub(collector)
        {
            Clients = new TestHubCallerClients(callerProxy),
            Context = new TestHubCallerContext(CancellationToken.None),
            Groups = new NoOpGroupManager()
        };
    }
}
