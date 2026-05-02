using SectorForge.Collector.Adapters;
using SectorForge.Core.Telemetry;

namespace SectorForge.Protocol.Tests;

public sealed class FakeTelemetryAdapterTests
{
    [Fact]
    public void CreateSampleEmitsPlausibleTelemetryValues()
    {
        var adapter = new FakeTelemetryAdapter();

        var sample = adapter.CreateSample(TimeSpan.FromSeconds(18), 42, Guid.NewGuid());

        Assert.Equal(GameId.Fake, sample.Source.Game);
        Assert.Equal(TelemetrySourceStatus.Running, sample.Source.Status);
        Assert.InRange(sample.Vehicle.SpeedKph.GetValueOrDefault(), 40, 340);
        Assert.InRange(sample.Vehicle.Rpm.GetValueOrDefault(), 3_000, 12_600);
        Assert.InRange(sample.DriverInput.Throttle.GetValueOrDefault(), 0, 1);
        Assert.InRange(sample.DriverInput.Brake.GetValueOrDefault(), 0, 1);
        Assert.NotNull(sample.Tyres.FrontLeft?.CoreC);
        Assert.NotNull(sample.Brakes.FrontLeftTemperatureC);
    }

    [Fact]
    public void CreateSampleAdvancesLapAfterLapDuration()
    {
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();

        var openingLap = adapter.CreateSample(TimeSpan.FromSeconds(20), 1, sessionId);
        var nextLap = adapter.CreateSample(TimeSpan.FromSeconds(100), 2, sessionId);

        Assert.Equal(1, openingLap.Lap.LapNumber);
        Assert.Equal(2, nextLap.Lap.LapNumber);
        Assert.NotNull(nextLap.Lap.BestLapTime);
    }
}
