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

public enum PitStatus
{
    Unknown = 0,
    None,
    Pitting,
    InPitArea
}

public enum TyreCompound
{
    Unknown = 0,
    Soft,
    Medium,
    Hard,
    Intermediate,
    Wet
}

public enum ErsDeployMode
{
    Unknown = 0,
    None,
    Medium,
    Hotlap,
    Overtake
}

public enum WeatherKind
{
    Unknown = 0,
    Clear,
    LightCloud,
    Overcast,
    LightRain,
    HeavyRain,
    Storm
}

public enum SafetyCarStatus
{
    Unknown = 0,
    None,
    Full,
    Virtual
}

public enum ResultStatus
{
    Unknown = 0,
    Active,
    Finished,
    Retired,
    Disqualified,
    NotClassified
}

public enum LapChannelValueKind
{
    Number,
    Boolean
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
    IReadOnlyList<ParticipantState>? Participants = null,
    DamageState? Damage = null,
    PowerUnitState? PowerUnit = null,
    WeatherForecastState? WeatherForecast = null);

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
    double? LapDistanceMeters = null,
    TimeSpan? Sector1Time = null,
    TimeSpan? Sector2Time = null,
    TimeSpan? Sector3Time = null,
    TimeSpan? LastSector1Time = null,
    TimeSpan? LastSector2Time = null,
    TimeSpan? LastSector3Time = null,
    bool? IsValid = null,
    double? TotalDistanceMeters = null,
    PitStatus? PitStatus = null,
    int? PitStopCount = null,
    int? PenaltiesSeconds = null,
    int? WarningsCount = null,
    int? CornersCut = null);

public sealed record VehicleState(
    string? CarName,
    double? SpeedKph,
    double? Rpm,
    int? Gear,
    double? EngineTemperatureC,
    double? LateralG = null,
    double? LongitudinalG = null,
    double? VerticalG = null,
    double? WorldPositionX = null,
    double? WorldPositionY = null,
    double? WorldPositionZ = null,
    double? Yaw = null,
    double? Pitch = null,
    double? Roll = null,
    double? OilTemperatureC = null);

public sealed record TyreState(
    WheelTemperatureState? FrontLeft,
    WheelTemperatureState? FrontRight,
    WheelTemperatureState? RearLeft,
    WheelTemperatureState? RearRight,
    double? FrontLeftPressurePsi = null,
    double? FrontRightPressurePsi = null,
    double? RearLeftPressurePsi = null,
    double? RearRightPressurePsi = null,
    TyreCompound? Compound = null,
    int? AgeLaps = null,
    WheelWearState? FrontLeftWear = null,
    WheelWearState? FrontRightWear = null,
    WheelWearState? RearLeftWear = null,
    WheelWearState? RearRightWear = null);

public sealed record WheelTemperatureState(
    double? SurfaceC,
    double? CoreC,
    double? InnerC = null,
    double? MiddleC = null,
    double? OuterC = null);

public sealed record WheelWearState(double? WearPercent = null);

public sealed record WheelDamageState(double? DamagePercent = null);

public sealed record DamageState(
    double? FrontLeftWingPercent = null,
    double? FrontRightWingPercent = null,
    double? RearWingPercent = null,
    double? FloorPercent = null,
    double? DiffuserPercent = null,
    double? SidepodPercent = null,
    double? GearboxPercent = null,
    double? EnginePercent = null,
    WheelDamageState? FrontLeftTyreDamage = null,
    WheelDamageState? FrontRightTyreDamage = null,
    WheelDamageState? RearLeftTyreDamage = null,
    WheelDamageState? RearRightTyreDamage = null,
    WheelDamageState? FrontLeftBrakeDamage = null,
    WheelDamageState? FrontRightBrakeDamage = null,
    WheelDamageState? RearLeftBrakeDamage = null,
    WheelDamageState? RearRightBrakeDamage = null);

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

public sealed record PowerUnitState(
    double? ErsStoreJoules = null,
    double? ErsDeployedThisLapJoules = null,
    double? ErsHarvestedThisLapMguk = null,
    double? ErsHarvestedThisLapMguh = null,
    ErsDeployMode? ErsDeployMode = null);

public sealed record WeatherForecastState(
    IReadOnlyList<WeatherForecastSample> Samples);

public sealed record WeatherForecastSample(
    int? MinutesAhead = null,
    WeatherKind? Weather = null,
    double? RainPercent = null,
    double? TrackTemperatureC = null,
    double? AirTemperatureC = null);

public sealed record TrackState(
    string? TrackName,
    double? TrackTemperatureC,
    double? AirTemperatureC,
    string? Weather,
    string? TrackId = null,
    double? TrackLengthMeters = null,
    double? RainPercent = null,
    WeatherKind? WeatherEnum = null,
    SafetyCarStatus? SafetyCarStatus = null,
    bool? FormationLap = null);

public sealed record DriverInputState(
    double? Throttle,
    double? Brake,
    double? Steering,
    double? Clutch,
    bool? DrsAllowed = null,
    bool? DrsActive = null,
    bool? PitLimiterActive = null,
    bool? AbsActive = null,
    bool? TcActive = null);

public sealed record TimingState(
    TimeSpan? SessionElapsed,
    TimeSpan? SessionRemaining,
    TimeSpan? DeltaToBestLap,
    TimeSpan? SectorDelta,
    TimeSpan? SessionTimeLeft = null,
    TimeSpan? SessionDuration = null);

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
    TimeSpan? IntervalToAhead = null,
    TimeSpan? Sector1 = null,
    TimeSpan? Sector2 = null,
    TimeSpan? BestSector1 = null,
    TimeSpan? BestSector2 = null,
    TimeSpan? BestSector3 = null,
    TyreCompound? TyreCompound = null,
    int? PitStopCount = null,
    ResultStatus? ResultStatus = null,
    int? GridPosition = null,
    int? DriverNumber = null,
    bool? IsAi = null);

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

public sealed record TelemetryLapSamples(
    TelemetrySessionSummary Session,
    LapSummary? Lap,
    IReadOnlyList<TelemetrySample> Samples);

public sealed record LapChannelManifestEntry(
    string Key,
    string Label,
    LapChannelValueKind ValueKind,
    string? Unit = null);

public sealed record LapChannelData(
    IReadOnlyList<double?> Time,
    IReadOnlyList<double?> SpeedKph,
    IReadOnlyList<double?> Rpm,
    IReadOnlyList<double?> Throttle,
    IReadOnlyList<double?> Brake,
    IReadOnlyList<double?> Steering,
    IReadOnlyList<double?>? LapDistance = null,
    IReadOnlyList<double?>? LateralG = null,
    IReadOnlyList<double?>? LongitudinalG = null,
    IReadOnlyList<bool?>? DrsActive = null,
    IReadOnlyList<double?>? ErsStoreJoules = null);

public sealed record LapChannelsResponse(
    Guid SessionId,
    int LapNumber,
    TimeSpan? LapTime,
    TimeSpan? BestLapTime,
    TimeSpan? Sector1Time,
    TimeSpan? Sector2Time,
    TimeSpan? Sector3Time,
    int SampleCount,
    IReadOnlyList<LapChannelManifestEntry> Manifest,
    LapChannelData Channels);

public sealed record TelemetrySessionDetails(
    TelemetrySessionSummary Session,
    IReadOnlyList<LapSummary> Laps,
    IReadOnlyList<TelemetrySample> Samples);
