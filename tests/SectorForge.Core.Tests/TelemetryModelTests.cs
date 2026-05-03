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
    public void FakeSampleLeavesSliceBCOptionalFieldsUnset()
    {
        var sample = new FakeTelemetryAdapter().CreateSample(TimeSpan.FromSeconds(3), 1, Guid.NewGuid());

        Assert.Null(sample.Damage);
        Assert.Null(sample.PowerUnit);
        Assert.Null(sample.Tyres.Compound);
        Assert.Null(sample.Tyres.AgeLaps);
        Assert.Null(sample.Tyres.FrontLeftWear);
        Assert.Null(sample.Tyres.FrontRightWear);
        Assert.Null(sample.Tyres.RearLeftWear);
        Assert.Null(sample.Tyres.RearRightWear);
    }

    [Fact]
    public void FakeSampleLeavesSliceDOptionalFieldsUnset()
    {
        var sample = new FakeTelemetryAdapter().CreateSample(TimeSpan.FromSeconds(3), 1, Guid.NewGuid());

        Assert.Null(sample.WeatherForecast);
        Assert.Null(sample.Track.TrackId);
        Assert.Null(sample.Track.TrackLengthMeters);
        Assert.Null(sample.Track.RainPercent);
        Assert.Null(sample.Track.WeatherEnum);
        Assert.Null(sample.Track.SafetyCarStatus);
        Assert.Null(sample.Track.FormationLap);
        Assert.Null(sample.Timing.SessionTimeLeft);
        Assert.Null(sample.Timing.SessionDuration);

        foreach (var participant in sample.Participants ?? [])
        {
            Assert.Null(participant.Sector1);
            Assert.Null(participant.Sector2);
            Assert.Null(participant.BestSector1);
            Assert.Null(participant.BestSector2);
            Assert.Null(participant.BestSector3);
            Assert.Null(participant.TyreCompound);
            Assert.Null(participant.PitStopCount);
            Assert.Null(participant.ResultStatus);
            Assert.Null(participant.GridPosition);
            Assert.Null(participant.DriverNumber);
            Assert.Null(participant.IsAi);
        }
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

    [Fact]
    public void SliceBCFieldsRoundTripThroughJson()
    {
        var sample = CreateSliceBCSample();

        var json = JsonSerializer.Serialize(sample, JsonOptions());
        var roundTripped = JsonSerializer.Deserialize<TelemetrySample>(json, JsonOptions());

        Assert.NotNull(roundTripped);
        AssertSliceBCFieldsEqual(sample, roundTripped);
    }

    [Fact]
    public void SliceDFieldsRoundTripThroughJson()
    {
        var sample = CreateSliceDSample();

        var json = JsonSerializer.Serialize(sample, JsonOptions());
        var roundTripped = JsonSerializer.Deserialize<TelemetrySample>(json, JsonOptions());

        Assert.NotNull(roundTripped);
        AssertSliceDFieldsEqual(sample, roundTripped);
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

    internal static TelemetrySample CreateSliceBCSample()
    {
        var sample = new FakeTelemetryAdapter().CreateSample(TimeSpan.FromSeconds(12), 2, Guid.NewGuid());

        return sample with
        {
            Tyres = sample.Tyres with
            {
                Compound = TyreCompound.Soft,
                AgeLaps = 7,
                FrontLeftWear = new WheelWearState(12.5),
                FrontRightWear = new WheelWearState(11.25),
                RearLeftWear = new WheelWearState(18.75),
                RearRightWear = new WheelWearState(19.5)
            },
            Damage = new DamageState(
                FrontLeftWingPercent: 4.5,
                FrontRightWingPercent: 6.25,
                RearWingPercent: 2.0,
                FloorPercent: 1.5,
                DiffuserPercent: 3.75,
                SidepodPercent: 8.0,
                GearboxPercent: 5.0,
                EnginePercent: 9.5,
                FrontLeftTyreDamage: new WheelDamageState(16.5),
                FrontRightTyreDamage: new WheelDamageState(17.25),
                RearLeftTyreDamage: new WheelDamageState(22.75),
                RearRightTyreDamage: new WheelDamageState(24.0),
                FrontLeftBrakeDamage: new WheelDamageState(3.0),
                FrontRightBrakeDamage: new WheelDamageState(3.5),
                RearLeftBrakeDamage: new WheelDamageState(4.25),
                RearRightBrakeDamage: new WheelDamageState(4.75)),
            PowerUnit = new PowerUnitState(
                ErsStoreJoules: 3_450_000,
                ErsDeployedThisLapJoules: 820_000,
                ErsHarvestedThisLapMguk: 125_500,
                ErsHarvestedThisLapMguh: 91_250,
                ErsDeployMode: ErsDeployMode.Overtake)
        };
    }

    internal static TelemetrySample CreateSliceDSample()
    {
        var sample = new FakeTelemetryAdapter().CreateSample(TimeSpan.FromSeconds(12), 2, Guid.NewGuid());

        return sample with
        {
            Track = sample.Track with
            {
                TrackId = "silverstone-gp",
                TrackLengthMeters = 5_891,
                RainPercent = 12.5,
                WeatherEnum = WeatherKind.LightCloud,
                SafetyCarStatus = SafetyCarStatus.Virtual,
                FormationLap = false
            },
            Timing = sample.Timing with
            {
                SessionTimeLeft = TimeSpan.FromMinutes(12.5),
                SessionDuration = TimeSpan.FromMinutes(30)
            },
            Participants =
            [
                new ParticipantState(
                    DriverName: "Avery Cole",
                    TeamName: "SectorForge Works",
                    CarName: "SectorForge GT Prototype",
                    Position: 3,
                    IsPlayer: true,
                    IsInPit: false,
                    LapNumber: 7,
                    CurrentLapTime: TimeSpan.FromMilliseconds(64_321),
                    LastLapTime: TimeSpan.FromMilliseconds(91_820),
                    BestLapTime: TimeSpan.FromMilliseconds(91_540),
                    GapToLeader: TimeSpan.FromMilliseconds(5_420),
                    IntervalToAhead: TimeSpan.FromMilliseconds(1_120),
                    Sector1: TimeSpan.FromMilliseconds(30_145),
                    Sector2: TimeSpan.FromMilliseconds(31_250),
                    BestSector1: TimeSpan.FromMilliseconds(29_980),
                    BestSector2: TimeSpan.FromMilliseconds(30_875),
                    BestSector3: TimeSpan.FromMilliseconds(30_685),
                    TyreCompound: TyreCompound.Medium,
                    PitStopCount: 1,
                    ResultStatus: ResultStatus.Active,
                    GridPosition: 5,
                    DriverNumber: 22,
                    IsAi: false)
            ],
            WeatherForecast = new WeatherForecastState(
            [
                new WeatherForecastSample(
                    MinutesAhead: 0,
                    Weather: WeatherKind.Clear,
                    RainPercent: 5,
                    TrackTemperatureC: 33.5,
                    AirTemperatureC: 22.4),
                new WeatherForecastSample(
                    MinutesAhead: 15,
                    Weather: WeatherKind.LightRain,
                    RainPercent: 42.5,
                    TrackTemperatureC: 28.1,
                    AirTemperatureC: 20.2)
            ])
        };
    }

    internal static void AssertSliceBCFieldsEqual(TelemetrySample expected, TelemetrySample actual)
    {
        Assert.Equal(expected.Tyres.Compound, actual.Tyres.Compound);
        Assert.Equal(expected.Tyres.AgeLaps, actual.Tyres.AgeLaps);
        AssertWheelWearEqual(expected.Tyres.FrontLeftWear, actual.Tyres.FrontLeftWear);
        AssertWheelWearEqual(expected.Tyres.FrontRightWear, actual.Tyres.FrontRightWear);
        AssertWheelWearEqual(expected.Tyres.RearLeftWear, actual.Tyres.RearLeftWear);
        AssertWheelWearEqual(expected.Tyres.RearRightWear, actual.Tyres.RearRightWear);

        Assert.NotNull(expected.Damage);
        Assert.NotNull(actual.Damage);
        var expectedDamage = expected.Damage!;
        var actualDamage = actual.Damage!;
        Assert.Equal(expectedDamage.FrontLeftWingPercent, actualDamage.FrontLeftWingPercent);
        Assert.Equal(expectedDamage.FrontRightWingPercent, actualDamage.FrontRightWingPercent);
        Assert.Equal(expectedDamage.RearWingPercent, actualDamage.RearWingPercent);
        Assert.Equal(expectedDamage.FloorPercent, actualDamage.FloorPercent);
        Assert.Equal(expectedDamage.DiffuserPercent, actualDamage.DiffuserPercent);
        Assert.Equal(expectedDamage.SidepodPercent, actualDamage.SidepodPercent);
        Assert.Equal(expectedDamage.GearboxPercent, actualDamage.GearboxPercent);
        Assert.Equal(expectedDamage.EnginePercent, actualDamage.EnginePercent);
        AssertWheelDamageEqual(expectedDamage.FrontLeftTyreDamage, actualDamage.FrontLeftTyreDamage);
        AssertWheelDamageEqual(expectedDamage.FrontRightTyreDamage, actualDamage.FrontRightTyreDamage);
        AssertWheelDamageEqual(expectedDamage.RearLeftTyreDamage, actualDamage.RearLeftTyreDamage);
        AssertWheelDamageEqual(expectedDamage.RearRightTyreDamage, actualDamage.RearRightTyreDamage);
        AssertWheelDamageEqual(expectedDamage.FrontLeftBrakeDamage, actualDamage.FrontLeftBrakeDamage);
        AssertWheelDamageEqual(expectedDamage.FrontRightBrakeDamage, actualDamage.FrontRightBrakeDamage);
        AssertWheelDamageEqual(expectedDamage.RearLeftBrakeDamage, actualDamage.RearLeftBrakeDamage);
        AssertWheelDamageEqual(expectedDamage.RearRightBrakeDamage, actualDamage.RearRightBrakeDamage);

        Assert.NotNull(expected.PowerUnit);
        Assert.NotNull(actual.PowerUnit);
        var expectedPowerUnit = expected.PowerUnit!;
        var actualPowerUnit = actual.PowerUnit!;
        Assert.Equal(expectedPowerUnit.ErsStoreJoules, actualPowerUnit.ErsStoreJoules);
        Assert.Equal(expectedPowerUnit.ErsDeployedThisLapJoules, actualPowerUnit.ErsDeployedThisLapJoules);
        Assert.Equal(expectedPowerUnit.ErsHarvestedThisLapMguk, actualPowerUnit.ErsHarvestedThisLapMguk);
        Assert.Equal(expectedPowerUnit.ErsHarvestedThisLapMguh, actualPowerUnit.ErsHarvestedThisLapMguh);
        Assert.Equal(expectedPowerUnit.ErsDeployMode, actualPowerUnit.ErsDeployMode);
    }

    internal static void AssertSliceDFieldsEqual(TelemetrySample expected, TelemetrySample actual)
    {
        Assert.Equal(expected.Track.TrackId, actual.Track.TrackId);
        Assert.Equal(expected.Track.TrackLengthMeters, actual.Track.TrackLengthMeters);
        Assert.Equal(expected.Track.RainPercent, actual.Track.RainPercent);
        Assert.Equal(expected.Track.WeatherEnum, actual.Track.WeatherEnum);
        Assert.Equal(expected.Track.SafetyCarStatus, actual.Track.SafetyCarStatus);
        Assert.Equal(expected.Track.FormationLap, actual.Track.FormationLap);
        Assert.Equal(expected.Timing.SessionTimeLeft, actual.Timing.SessionTimeLeft);
        Assert.Equal(expected.Timing.SessionDuration, actual.Timing.SessionDuration);

        Assert.NotNull(expected.WeatherForecast);
        Assert.NotNull(actual.WeatherForecast);
        var expectedForecast = expected.WeatherForecast!;
        var actualForecast = actual.WeatherForecast!;
        Assert.Equal(expectedForecast.Samples.Count, actualForecast.Samples.Count);
        for (var index = 0; index < expectedForecast.Samples.Count; index++)
        {
            AssertWeatherForecastSampleEqual(expectedForecast.Samples[index], actualForecast.Samples[index]);
        }

        Assert.NotNull(expected.Participants);
        Assert.NotNull(actual.Participants);
        var expectedParticipants = expected.Participants!;
        var actualParticipants = actual.Participants!;
        Assert.Equal(expectedParticipants.Count, actualParticipants.Count);
        for (var index = 0; index < expectedParticipants.Count; index++)
        {
            AssertParticipantSliceDFieldsEqual(expectedParticipants[index], actualParticipants[index]);
        }
    }

    private static void AssertWeatherForecastSampleEqual(WeatherForecastSample expected, WeatherForecastSample actual)
    {
        Assert.Equal(expected.MinutesAhead, actual.MinutesAhead);
        Assert.Equal(expected.Weather, actual.Weather);
        Assert.Equal(expected.RainPercent, actual.RainPercent);
        Assert.Equal(expected.TrackTemperatureC, actual.TrackTemperatureC);
        Assert.Equal(expected.AirTemperatureC, actual.AirTemperatureC);
    }

    private static void AssertParticipantSliceDFieldsEqual(ParticipantState expected, ParticipantState actual)
    {
        Assert.Equal(expected.Sector1, actual.Sector1);
        Assert.Equal(expected.Sector2, actual.Sector2);
        Assert.Equal(expected.BestSector1, actual.BestSector1);
        Assert.Equal(expected.BestSector2, actual.BestSector2);
        Assert.Equal(expected.BestSector3, actual.BestSector3);
        Assert.Equal(expected.TyreCompound, actual.TyreCompound);
        Assert.Equal(expected.PitStopCount, actual.PitStopCount);
        Assert.Equal(expected.ResultStatus, actual.ResultStatus);
        Assert.Equal(expected.GridPosition, actual.GridPosition);
        Assert.Equal(expected.DriverNumber, actual.DriverNumber);
        Assert.Equal(expected.IsAi, actual.IsAi);
    }

    private static void AssertWheelWearEqual(WheelWearState? expected, WheelWearState? actual)
        => Assert.Equal(expected?.WearPercent, actual?.WearPercent);

    private static void AssertWheelDamageEqual(WheelDamageState? expected, WheelDamageState? actual)
        => Assert.Equal(expected?.DamagePercent, actual?.DamagePercent);

    private static JsonSerializerOptions JsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
