namespace SectorForge.Core.Telemetry;

public enum GameId
{
    Unknown,
    Fake,
    F125,
    AssettoCorsaCompetizione,
    Automobilista2,
    LeMansUltimate
}

public enum TelemetrySourceStatus
{
    Offline,
    Available,
    Running,
    NotImplemented
}

public enum TelemetryRunMode
{
    Idle,
    Live,
    Replay
}

public sealed record TelemetrySource(
    string AdapterId,
    GameId Game,
    string DisplayName,
    string InputKind,
    bool IsSimulated,
    TelemetrySourceStatus Status,
    string? Notes = null);

public sealed record TelemetrySample(
    Guid SessionId,
    long Sequence,
    DateTimeOffset Timestamp,
    TelemetrySource Source,
    SessionState Session,
    LapState Lap,
    VehicleState Vehicle,
    TyreState Tyres,
    BrakeState Brakes,
    FuelState Fuel,
    TrackState Track,
    DriverInputState DriverInput,
    TimingState Timing,
    IReadOnlyList<ParticipantState>? Participants = null);

public sealed record SessionState(
    Guid Id,
    string? Name,
    string? SessionType,
    DateTimeOffset StartedAt,
    bool IsActive);

public sealed record LapState(
    int? LapNumber,
    TimeSpan? CurrentLapTime,
    TimeSpan? LastLapTime,
    TimeSpan? BestLapTime,
    int? SectorIndex,
    double? LapDistanceMeters = null);

public sealed record VehicleState(
    string? CarName,
    double? SpeedKph,
    double? Rpm,
    int? Gear,
    double? EngineTemperatureC);

public sealed record TyreState(
    WheelTemperatureState? FrontLeft,
    WheelTemperatureState? FrontRight,
    WheelTemperatureState? RearLeft,
    WheelTemperatureState? RearRight,
    double? FrontLeftPressurePsi = null,
    double? FrontRightPressurePsi = null,
    double? RearLeftPressurePsi = null,
    double? RearRightPressurePsi = null);

public sealed record WheelTemperatureState(
    double? SurfaceC,
    double? CoreC,
    double? InnerC = null,
    double? MiddleC = null,
    double? OuterC = null);

public sealed record BrakeState(
    double? FrontLeftTemperatureC,
    double? FrontRightTemperatureC,
    double? RearLeftTemperatureC,
    double? RearRightTemperatureC);

public sealed record FuelState(
    double? RemainingLiters,
    double? CapacityLiters,
    double? LitersPerLapEstimate,
    int? LapsRemainingEstimate);

public sealed record TrackState(
    string? TrackName,
    double? TrackTemperatureC,
    double? AirTemperatureC,
    string? Weather);

public sealed record DriverInputState(
    double? Throttle,
    double? Brake,
    double? Steering,
    double? Clutch);

public sealed record TimingState(
    TimeSpan? SessionElapsed,
    TimeSpan? SessionRemaining,
    TimeSpan? DeltaToBestLap,
    TimeSpan? SectorDelta);

public sealed record ParticipantState(
    string DriverName,
    string? TeamName,
    string? CarName,
    int Position,
    bool IsPlayer,
    bool IsInPit,
    int? LapNumber,
    TimeSpan? CurrentLapTime,
    TimeSpan? LastLapTime,
    TimeSpan? BestLapTime,
    TimeSpan? GapToLeader,
    TimeSpan? IntervalToAhead = null);

public sealed record TelemetryReceiverStatus(
    bool IsRunning,
    TelemetryRunMode RunMode,
    string? ActiveAdapterId,
    TelemetrySource? Source,
    DateTimeOffset? StartedAt,
    DateTimeOffset? LastSampleAt,
    long SamplesPublished,
    long SamplesDropped,
    string? LastError,
    TelemetrySample? LatestSample);

public sealed record TelemetrySessionSummary(
    Guid Id,
    GameId Game,
    string? SourceName,
    string? TrackName,
    string? CarName,
    DateTimeOffset StartedAt,
    DateTimeOffset LastSeenAt,
    TimeSpan? BestLapTime,
    long SampleCount);

public sealed record LapSummary(
    Guid SessionId,
    int LapNumber,
    TimeSpan? LapTime,
    TimeSpan? BestLapTime,
    DateTimeOffset UpdatedAt);

public sealed record TelemetrySessionDetails(
    TelemetrySessionSummary Session,
    IReadOnlyList<LapSummary> Laps,
    IReadOnlyList<TelemetrySample> Samples);
