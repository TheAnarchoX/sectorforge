using System.Diagnostics;
using System.Runtime.CompilerServices;
using SectorForge.Core.Telemetry;

namespace SectorForge.Collector.Adapters;

public sealed class FakeTelemetryAdapter : ITelemetryAdapter
{
    private static readonly TimeSpan LapDuration = TimeSpan.FromSeconds(92.4);
    private static readonly TimeSpan BestLap = TimeSpan.FromSeconds(91.82);
    private readonly DateTimeOffset _sessionStartedAt = DateTimeOffset.UtcNow;
    private readonly Guid _sessionId = Guid.NewGuid();
    private readonly TimeSpan _sampleInterval;

    public FakeTelemetryAdapter()
        : this(TimeSpan.FromSeconds(1.0 / 60.0))
    {
    }

    public FakeTelemetryAdapter(TimeSpan sampleInterval)
    {
        _sampleInterval = sampleInterval;
    }

    public TelemetrySource Source { get; } = new(
        AdapterId: "fake",
        Game: GameId.Fake,
        DisplayName: "Fake telemetry",
        InputKind: "Simulated 60 Hz stream",
        IsSimulated: true,
        Status: TelemetrySourceStatus.Available,
        Notes: "Synthetic data for UI and storage development without a running sim.");

    public async IAsyncEnumerable<TelemetrySample> RunAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        using var timer = new PeriodicTimer(_sampleInterval);
        var sequence = 0L;

        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            yield return CreateSample(stopwatch.Elapsed, ++sequence, _sessionId);
        }
    }

    public TelemetrySample CreateSample(TimeSpan elapsed, long sequence, Guid? sessionId = null)
    {
        var session = sessionId ?? _sessionId;
        var lapProgress = elapsed.TotalSeconds % LapDuration.TotalSeconds / LapDuration.TotalSeconds;
        var lapNumber = (int)(elapsed.TotalSeconds / LapDuration.TotalSeconds) + 1;
        var sectorIndex = Math.Clamp((int)Math.Floor(lapProgress * 3), 0, 2);
        var currentLapTime = TimeSpan.FromSeconds(lapProgress * LapDuration.TotalSeconds);
        TimeSpan? lastLapTime = lapNumber > 1
            ? LapDuration + TimeSpan.FromMilliseconds(Math.Sin(lapNumber * 1.7) * 450)
            : null;

        var corneringLoad = Math.Pow(Math.Sin(lapProgress * Math.PI * 8), 2);
        var straightBias = Math.Pow(Math.Sin(lapProgress * Math.PI * 3), 2);
        var speed = Math.Clamp(92 + straightBias * 214 - corneringLoad * 58 + Math.Sin(elapsed.TotalSeconds * 1.8) * 8, 48, 326);
        var throttle = Math.Clamp(0.45 + straightBias * 0.56 - corneringLoad * 0.25, 0, 1);
        var brake = Math.Clamp(corneringLoad * 0.82 - straightBias * 0.2, 0, 1);
        var steering = Math.Clamp(Math.Sin(lapProgress * Math.PI * 12) * (0.18 + corneringLoad * 0.62), -1, 1);
        var rpm = Math.Clamp(5_200 + speed * 28 + throttle * 3_200 + Math.Sin(elapsed.TotalSeconds * 8) * 260, 3_200, 12_400);
        var gear = speed < 8 ? 0 : Math.Clamp((int)Math.Floor(speed / 42) + 1, 1, 8);
        var fuelRemaining = Math.Max(0, 77.5 - elapsed.TotalMinutes * 0.42);
        var tyreBase = 84 + corneringLoad * 8 + straightBias * 4;
        var brakeBase = 340 + brake * 540 + speed * 0.48;
        var lapDelta = currentLapTime - TimeSpan.FromSeconds(lapProgress * BestLap.TotalSeconds);

        return new TelemetrySample(
            SessionId: session,
            Sequence: sequence,
            Timestamp: _sessionStartedAt + elapsed,
            Source: Source with { Status = TelemetrySourceStatus.Running },
            Session: new SessionState(
                Id: session,
                Name: "Fake GT practice",
                SessionType: "Practice",
                StartedAt: _sessionStartedAt,
                IsActive: true),
            Lap: new LapState(
                LapNumber: lapNumber,
                CurrentLapTime: currentLapTime,
                LastLapTime: lastLapTime,
                BestLapTime: lapNumber > 1 ? BestLap : null,
                SectorIndex: sectorIndex),
            Vehicle: new VehicleState(
                CarName: "SectorForge GT Prototype",
                SpeedKph: Math.Round(speed, 1),
                Rpm: Math.Round(rpm),
                Gear: gear,
                EngineTemperatureC: Math.Round(96 + throttle * 6, 1)),
            Tyres: new TyreState(
                FrontLeft: Wheel(tyreBase + Math.Max(0, steering) * 7),
                FrontRight: Wheel(tyreBase + Math.Max(0, -steering) * 7),
                RearLeft: Wheel(tyreBase + throttle * 5),
                RearRight: Wheel(tyreBase + throttle * 5.5),
                FrontLeftPressurePsi: Math.Round(26.8 + tyreBase * 0.015, 1),
                FrontRightPressurePsi: Math.Round(26.7 + tyreBase * 0.015, 1),
                RearLeftPressurePsi: Math.Round(27.1 + tyreBase * 0.014, 1),
                RearRightPressurePsi: Math.Round(27.0 + tyreBase * 0.014, 1)),
            Brakes: new BrakeState(
                FrontLeftTemperatureC: Math.Round(brakeBase + Math.Max(0, steering) * 50, 1),
                FrontRightTemperatureC: Math.Round(brakeBase + Math.Max(0, -steering) * 50, 1),
                RearLeftTemperatureC: Math.Round(brakeBase * 0.78, 1),
                RearRightTemperatureC: Math.Round(brakeBase * 0.8, 1)),
            Fuel: new FuelState(
                RemainingLiters: Math.Round(fuelRemaining, 2),
                CapacityLiters: 82,
                LitersPerLapEstimate: 2.72,
                LapsRemainingEstimate: (int)Math.Floor(fuelRemaining / 2.72)),
            Track: new TrackState(
                TrackName: "Silverstone GP",
                TrackTemperatureC: Math.Round(32 + Math.Sin(elapsed.TotalMinutes / 4) * 1.8, 1),
                AirTemperatureC: 22.4,
                Weather: "Clear"),
            DriverInput: new DriverInputState(
                Throttle: Math.Round(throttle, 3),
                Brake: Math.Round(brake, 3),
                Steering: Math.Round(steering, 3),
                Clutch: null),
            Timing: new TimingState(
                SessionElapsed: elapsed,
                SessionRemaining: TimeSpan.FromMinutes(30) - elapsed,
                DeltaToBestLap: lapNumber > 1 ? lapDelta : null,
                SectorDelta: TimeSpan.FromMilliseconds(Math.Sin(elapsed.TotalSeconds * 0.7) * 120)));
    }

    private static WheelTemperatureState Wheel(double coreTemperature)
    {
        return new WheelTemperatureState(
            SurfaceC: Math.Round(coreTemperature + 3.5, 1),
            CoreC: Math.Round(coreTemperature, 1),
            InnerC: Math.Round(coreTemperature + 2.4, 1),
            MiddleC: Math.Round(coreTemperature + 0.8, 1),
            OuterC: Math.Round(coreTemperature - 1.7, 1));
    }
}
