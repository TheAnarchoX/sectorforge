using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Core.Telemetry;

namespace SectorForge.Protocol.Tests;

public sealed class CollectorProgramTests
{
    [Fact]
    public void CreateHostRegistersConfigGatedAdaptersAndWorker()
    {
        using var host = CollectorProgram.CreateHost([]);

        var adapter = host.Services.GetRequiredService<FakeTelemetryAdapter>();
        var adapters = host.Services.GetServices<ITelemetryAdapter>().ToArray();
        var hostedServices = host.Services.GetServices<IHostedService>();

        Assert.NotNull(adapter);
        Assert.Contains(adapters, service => service.Source.AdapterId == "fake");
        var f125Adapter = Assert.Single(adapters, service => service.Source.AdapterId == F125UdpTelemetryAdapter.AdapterId);
        Assert.Equal(TelemetrySourceStatus.Offline, f125Adapter.Source.Status);
        Assert.Contains(hostedServices, service => service is Worker);
    }
}
