using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;

namespace SectorForge.Protocol.Tests;

public sealed class CollectorProgramTests
{
    [Fact]
    public void CreateHostRegistersFakeAdapterAndWorker()
    {
        using var host = CollectorProgram.CreateHost([]);

        var adapter = host.Services.GetRequiredService<FakeTelemetryAdapter>();
        var hostedServices = host.Services.GetServices<IHostedService>();

        Assert.NotNull(adapter);
        Assert.Contains(hostedServices, service => service is Worker);
    }
}
