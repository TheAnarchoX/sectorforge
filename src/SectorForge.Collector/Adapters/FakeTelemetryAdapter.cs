using System.Diagnostics;
using System.Runtime.CompilerServices;
using SectorForge.Core.Telemetry;

namespace SectorForge.Collector.Adapters;

public sealed class FakeTelemetryAdapter : ITelemetryAdapter
{
    private static readonly TimeSpan LapDuration = TimeSpan.FromSeconds(92.4);
    private static readonly TimeSpan BestLap = TimeSpan.FromSeconds(91.82);
    private static readonly FakeParticipantProfile[] ParticipantProfiles =
    [
        new("Lena Hart", "Orion Motorsport", "Orion VXR GT3", IsPlayer: false, PaceOffsetSeconds: -0.22, GapBaseSeconds: 0.0, PhaseOffset: 0.45),
        new("Noah Duran", "Helix Engineering", "Helix R6 Evo", IsPlayer: false, PaceOffsetSeconds: 0.18, GapBaseSeconds: 2.1, PhaseOffset: 1.05),
        new("Avery Cole", "SectorForge Works", "SectorForge GT Prototype", IsPlayer: true, PaceOffsetSeconds: 0.0, GapBaseSeconds: 5.4, PhaseOffset: 0.12),
        new("Sofia Kim", "Vertex Dynamics", "Vertex GT-R", IsPlayer: false, PaceOffsetSeconds: 0.44, GapBaseSeconds: 7.8, PhaseOffset: 1.72),
        new("Mateo Rossi", "Atlas Endurance", "Atlas GTM", IsPlayer: false, PaceOffsetSeconds: 0.67, GapBaseSeconds: 10.3, PhaseOffset: 2.41),
        new("Rin Okafor", "Apex Nova", "Apex S4", IsPlayer: false, PaceOffsetSeconds: 1.04, GapBaseSeconds: 14.8, PhaseOffset: 3.02),
    ];
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
        var participants = BuildParticipants(
            elapsed,
            lapNumber,
            currentLapTime,
            lastLapTime,
            lapNumber > 1 ? BestLap : null);

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
                SectorDelta: TimeSpan.FromMilliseconds(Math.Sin(elapsed.TotalSeconds * 0.7) * 120)),
            Participants: participants);
    }

    private static IReadOnlyList<ParticipantState> BuildParticipants(
        TimeSpan elapsed,
        int playerLapNumber,
        TimeSpan playerCurrentLapTime,
        TimeSpan? playerLastLapTime,
        TimeSpan? playerBestLapTime)
    {
        var snapshots = ParticipantProfiles
            .Select(profile => CreateParticipantSnapshot(
                profile,
                elapsed,
                playerLapNumber,
                playerCurrentLapTime,
                playerLastLapTime,
                playerBestLapTime))
            .OrderBy(snapshot => snapshot.GapToLeader ?? TimeSpan.Zero)
            .ToArray();

        var participants = new ParticipantState[snapshots.Length];
        for (var index = 0; index < snapshots.Length; index++)
        {
            var snapshot = snapshots[index];
            var intervalToAhead = index == 0 || snapshot.GapToLeader is null || snapshots[index - 1].GapToLeader is null
                ? null
                : snapshot.GapToLeader - snapshots[index - 1].GapToLeader;

            participants[index] = new ParticipantState(
                DriverName: snapshot.DriverName,
                TeamName: snapshot.TeamName,
                CarName: snapshot.CarName,
                Position: index + 1,
                IsPlayer: snapshot.IsPlayer,
                IsInPit: snapshot.IsInPit,
                LapNumber: snapshot.LapNumber,
                CurrentLapTime: snapshot.CurrentLapTime,
                LastLapTime: snapshot.LastLapTime,
                BestLapTime: snapshot.BestLapTime,
                GapToLeader: snapshot.GapToLeader,
                IntervalToAhead: intervalToAhead);
        }

        return participants;
    }

    private static ParticipantSnapshot CreateParticipantSnapshot(
        FakeParticipantProfile profile,
        TimeSpan elapsed,
        int playerLapNumber,
        TimeSpan playerCurrentLapTime,
        TimeSpan? playerLastLapTime,
        TimeSpan? playerBestLapTime)
    {
        if (profile.IsPlayer)
        {
            return new ParticipantSnapshot(
                DriverName: profile.DriverName,
                TeamName: profile.TeamName,
                CarName: profile.CarName,
                IsPlayer: true,
                IsInPit: false,
                LapNumber: playerLapNumber,
                CurrentLapTime: playerCurrentLapTime,
                LastLapTime: playerLastLapTime,
                BestLapTime: playerBestLapTime,
                GapToLeader: TimeSpan.FromSeconds(
                    Math.Max(
                        0,
                        profile.GapBaseSeconds
                            + Math.Sin(elapsed.TotalSeconds * 0.05 + profile.PhaseOffset) * 0.35)));
        }

        var participantElapsed = elapsed + TimeSpan.FromSeconds(profile.PhaseOffset * 5.5);
        var lapNumber = Math.Max(1, (int)Math.Floor(participantElapsed.TotalSeconds / LapDuration.TotalSeconds) + 1);
        var lapDurationSeconds = BestLap.TotalSeconds
            + profile.PaceOffsetSeconds
            + Math.Sin(elapsed.TotalSeconds * 0.045 + profile.PhaseOffset) * 0.32;
        var lapProgressSeconds = participantElapsed.TotalSeconds % LapDuration.TotalSeconds;
        if (lapProgressSeconds < 0)
        {
            lapProgressSeconds += LapDuration.TotalSeconds;
        }

        var lapProgress = lapProgressSeconds / LapDuration.TotalSeconds;
        var currentLapTime = TimeSpan.FromSeconds(lapProgress * lapDurationSeconds);
        TimeSpan? lastLapTime = lapNumber > 1
            ? TimeSpan.FromSeconds(lapDurationSeconds + Math.Sin(lapNumber * 1.25 + profile.PhaseOffset) * 0.28)
            : null;
        TimeSpan? bestLapTime = lapNumber > 1
            ? TimeSpan.FromSeconds(
                Math.Max(
                    89.4,
                    BestLap.TotalSeconds
                        + profile.PaceOffsetSeconds
                        - 0.48
                        + Math.Sin(lapNumber * 0.38 + profile.PhaseOffset) * 0.14))
            : null;
        var gapToLeader = TimeSpan.FromSeconds(
            Math.Max(
                0,
                profile.GapBaseSeconds
                    + Math.Sin(elapsed.TotalSeconds * 0.05 + profile.PhaseOffset) * 0.24));

        return new ParticipantSnapshot(
            DriverName: profile.DriverName,
            TeamName: profile.TeamName,
            CarName: profile.CarName,
            IsPlayer: false,
            IsInPit: Math.Sin(elapsed.TotalSeconds * 0.025 + profile.PhaseOffset) > 0.97,
            LapNumber: lapNumber,
            CurrentLapTime: currentLapTime,
            LastLapTime: lastLapTime,
            BestLapTime: bestLapTime,
            GapToLeader: gapToLeader);
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

    private sealed record FakeParticipantProfile(
        string DriverName,
        string TeamName,
        string CarName,
        bool IsPlayer,
        double PaceOffsetSeconds,
        double GapBaseSeconds,
        double PhaseOffset);

    private sealed record ParticipantSnapshot(
        string DriverName,
        string TeamName,
        string CarName,
        bool IsPlayer,
        bool IsInPit,
        int LapNumber,
        TimeSpan CurrentLapTime,
        TimeSpan? LastLapTime,
        TimeSpan? BestLapTime,
        TimeSpan? GapToLeader);
}
