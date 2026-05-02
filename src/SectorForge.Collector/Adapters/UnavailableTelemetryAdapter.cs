using System.Runtime.CompilerServices;
using SectorForge.Core.Telemetry;

namespace SectorForge.Collector.Adapters;

public abstract class UnavailableTelemetryAdapter : ITelemetryAdapter
{
    protected UnavailableTelemetryAdapter(TelemetrySource source)
    {
        Source = source;
    }

    public TelemetrySource Source { get; }

    public async IAsyncEnumerable<TelemetrySample> RunAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        yield break;
    }
}

public sealed class F125UdpTelemetryAdapter : UnavailableTelemetryAdapter
{
    public F125UdpTelemetryAdapter()
        : base(new TelemetrySource(
            AdapterId: "f1-25-udp",
            Game: GameId.F125,
            DisplayName: "F1 25 UDP",
            InputKind: "UDP packets",
            IsSimulated: false,
            Status: TelemetrySourceStatus.NotImplemented,
            Notes: "Planned first real adapter because EA publishes an official UDP packet spec."))
    {
    }
}

public sealed class AccSharedMemoryTelemetryAdapter : UnavailableTelemetryAdapter
{
    public AccSharedMemoryTelemetryAdapter()
        : base(new TelemetrySource(
            AdapterId: "acc-shared-memory",
            Game: GameId.AssettoCorsaCompetizione,
            DisplayName: "ACC shared memory",
            InputKind: "Shared memory",
            IsSimulated: false,
            Status: TelemetrySourceStatus.NotImplemented,
            Notes: "Planned adapter for Kunos shared memory structures."))
    {
    }
}

public sealed class Ams2TelemetryAdapter : UnavailableTelemetryAdapter
{
    public Ams2TelemetryAdapter()
        : base(new TelemetrySource(
            AdapterId: "ams2-project-cars",
            Game: GameId.Automobilista2,
            DisplayName: "AMS2 Project CARS style telemetry",
            InputKind: "Shared memory / UDP",
            IsSimulated: false,
            Status: TelemetrySourceStatus.NotImplemented,
            Notes: "Planned adapter for the Project CARS style telemetry model used by AMS2 tools."))
    {
    }
}

public sealed class LmuUdpTelemetryAdapter : UnavailableTelemetryAdapter
{
    public LmuUdpTelemetryAdapter()
        : base(new TelemetrySource(
            AdapterId: "lmu-plugin-udp",
            Game: GameId.LeMansUltimate,
            DisplayName: "LMU plugin UDP telemetry",
            InputKind: "Plugin / UDP JSON",
            IsSimulated: false,
            Status: TelemetrySourceStatus.NotImplemented,
            Notes: "Planned adapter once the preferred plugin/community stream format is selected."))
    {
    }
}
