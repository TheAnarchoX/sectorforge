using SectorForge.Collector.Adapters;
using SectorForge.Core.Telemetry;

namespace SectorForge.Protocol.Tests;

public sealed class UnavailableTelemetryAdapterTests
{
    [Fact]
    public async Task PlaceholderAdaptersStayUnavailableAndDoNotEmitSamples()
    {
        ITelemetryAdapter[] adapters =
        [
            new AccSharedMemoryTelemetryAdapter(),
            new Ams2TelemetryAdapter(),
            new LmuUdpTelemetryAdapter()
        ];

        foreach (var adapter in adapters)
        {
            Assert.Equal(TelemetrySourceStatus.NotImplemented, adapter.Source.Status);

            var emittedSamples = new List<TelemetrySample>();
            await foreach (var sample in adapter.RunAsync(CancellationToken.None))
            {
                emittedSamples.Add(sample);
            }

            Assert.Empty(emittedSamples);
        }
    }
}
