using System.Text.Json;
using System.Text.Json.Serialization;
using SectorForge.Collector.Adapters;
using SectorForge.Core.Telemetry;

namespace SectorForge.Core.Tests;

public sealed class TelemetryModelTests
{
    [Fact]
    public void FakeSampleUsesStableSessionIdentityWhenProvided()
    {
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();

        var first = adapter.CreateSample(TimeSpan.Zero, 1, sessionId);
        var second = adapter.CreateSample(TimeSpan.FromSeconds(3), 2, sessionId);

        Assert.Equal(sessionId, first.SessionId);
        Assert.Equal(sessionId, second.SessionId);
        Assert.Equal(first.Session.Id, second.Session.Id);
    }

    [Fact]
    public void FakeSampleLeavesSliceAOptionalFieldsUnset()
    {
        var sample = new FakeTelemetryAdapter().CreateSample(TimeSpan.FromSeconds(3), 1, Guid.NewGuid());

        Assert.Null(sample.Vehicle.LateralG);
        Assert.Null(sample.Vehicle.LongitudinalG);
        Assert.Null(sample.Vehicle.VerticalG);
        Assert.Null(sample.Vehicle.WorldPositionX);
        Assert.Null(sample.Vehicle.WorldPositionY);
        Assert.Null(sample.Vehicle.WorldPositionZ);
        Assert.Null(sample.Vehicle.Yaw);
        Assert.Null(sample.Vehicle.Pitch);
        Assert.Null(sample.Vehicle.Roll);
        Assert.Null(sample.Vehicle.OilTemperatureC);
        Assert.Null(sample.Lap.Sector1Time);
        Assert.Null(sample.Lap.Sector2Time);
        Assert.Null(sample.Lap.Sector3Time);
        Assert.Null(sample.Lap.LastSector1Time);
        Assert.Null(sample.Lap.LastSector2Time);
        Assert.Null(sample.Lap.LastSector3Time);
        Assert.Null(sample.Lap.IsValid);
        Assert.Null(sample.Lap.LapDistanceMeters);
        Assert.Null(sample.Lap.TotalDistanceMeters);
        Assert.Null(sample.Lap.PitStatus);
        Assert.Null(sample.Lap.PitStopCount);
        Assert.Null(sample.Lap.PenaltiesSeconds);
        Assert.Null(sample.Lap.WarningsCount);
        Assert.Null(sample.Lap.CornersCut);
        Assert.Null(sample.DriverInput.DrsAllowed);
        Assert.Null(sample.DriverInput.DrsActive);
        Assert.Null(sample.DriverInput.PitLimiterActive);
        Assert.Null(sample.DriverInput.AbsActive);
        Assert.Null(sample.DriverInput.TcActive);
    }

    [Fact]
    public void SliceAFieldsRoundTripThroughJson()
    {
        var sample = CreateSliceASample();

        var json = JsonSerializer.Serialize(sample, JsonOptions());
        var roundTripped = JsonSerializer.Deserialize<TelemetrySample>(json, JsonOptions());

        Assert.NotNull(roundTripped);
        Assert.Equal(sample.Vehicle.LateralG, roundTripped.Vehicle.LateralG);
        Assert.Equal(sample.Vehicle.LongitudinalG, roundTripped.Vehicle.LongitudinalG);
        Assert.Equal(sample.Vehicle.VerticalG, roundTripped.Vehicle.VerticalG);
        Assert.Equal(sample.Vehicle.WorldPositionX, roundTripped.Vehicle.WorldPositionX);
        Assert.Equal(sample.Vehicle.WorldPositionY, roundTripped.Vehicle.WorldPositionY);
        Assert.Equal(sample.Vehicle.WorldPositionZ, roundTripped.Vehicle.WorldPositionZ);
        Assert.Equal(sample.Vehicle.Yaw, roundTripped.Vehicle.Yaw);
        Assert.Equal(sample.Vehicle.Pitch, roundTripped.Vehicle.Pitch);
        Assert.Equal(sample.Vehicle.Roll, roundTripped.Vehicle.Roll);
        Assert.Equal(sample.Vehicle.OilTemperatureC, roundTripped.Vehicle.OilTemperatureC);
        Assert.Equal(sample.Lap.Sector1Time, roundTripped.Lap.Sector1Time);
        Assert.Equal(sample.Lap.Sector2Time, roundTripped.Lap.Sector2Time);
        Assert.Equal(sample.Lap.Sector3Time, roundTripped.Lap.Sector3Time);
        Assert.Equal(sample.Lap.LastSector1Time, roundTripped.Lap.LastSector1Time);
        Assert.Equal(sample.Lap.LastSector2Time, roundTripped.Lap.LastSector2Time);
        Assert.Equal(sample.Lap.LastSector3Time, roundTripped.Lap.LastSector3Time);
        Assert.Equal(sample.Lap.IsValid, roundTripped.Lap.IsValid);
        Assert.Equal(sample.Lap.LapDistanceMeters, roundTripped.Lap.LapDistanceMeters);
        Assert.Equal(sample.Lap.TotalDistanceMeters, roundTripped.Lap.TotalDistanceMeters);
        Assert.Equal(sample.Lap.PitStatus, roundTripped.Lap.PitStatus);
        Assert.Equal(sample.Lap.PitStopCount, roundTripped.Lap.PitStopCount);
        Assert.Equal(sample.Lap.PenaltiesSeconds, roundTripped.Lap.PenaltiesSeconds);
        Assert.Equal(sample.Lap.WarningsCount, roundTripped.Lap.WarningsCount);
        Assert.Equal(sample.Lap.CornersCut, roundTripped.Lap.CornersCut);
        Assert.Equal(sample.DriverInput.DrsAllowed, roundTripped.DriverInput.DrsAllowed);
        Assert.Equal(sample.DriverInput.DrsActive, roundTripped.DriverInput.DrsActive);
        Assert.Equal(sample.DriverInput.PitLimiterActive, roundTripped.DriverInput.PitLimiterActive);
        Assert.Equal(sample.DriverInput.AbsActive, roundTripped.DriverInput.AbsActive);
        Assert.Equal(sample.DriverInput.TcActive, roundTripped.DriverInput.TcActive);
    }

    internal static TelemetrySample CreateSliceASample()
    {
        var sample = new FakeTelemetryAdapter().CreateSample(TimeSpan.FromSeconds(12), 2, Guid.NewGuid());

        return sample with
        {
            Vehicle = sample.Vehicle with
            {
                LateralG = 1.23,
                LongitudinalG = -0.42,
                VerticalG = 0.08,
                WorldPositionX = 12.5,
                WorldPositionY = -3.75,
                WorldPositionZ = 44.25,
                Yaw = 0.02,
                Pitch = -0.01,
                Roll = 0.04,
                OilTemperatureC = 104.5
            },
            Lap = sample.Lap with
            {
                LapDistanceMeters = 1234.5,
                Sector1Time = TimeSpan.FromMilliseconds(31_234),
                Sector2Time = TimeSpan.FromMilliseconds(62_345),
                Sector3Time = TimeSpan.FromMilliseconds(29_876),
                LastSector1Time = TimeSpan.FromMilliseconds(30_998),
                LastSector2Time = TimeSpan.FromMilliseconds(61_775),
                LastSector3Time = TimeSpan.FromMilliseconds(30_101),
                IsValid = true,
                TotalDistanceMeters = 17_543.25,
                PitStatus = PitStatus.Pitting,
                PitStopCount = 1,
                PenaltiesSeconds = 5,
                WarningsCount = 2,
                CornersCut = 1
            },
            DriverInput = sample.DriverInput with
            {
                DrsAllowed = true,
                DrsActive = false,
                PitLimiterActive = true,
                AbsActive = false,
                TcActive = true
            }
        };
    }

    private static JsonSerializerOptions JsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
