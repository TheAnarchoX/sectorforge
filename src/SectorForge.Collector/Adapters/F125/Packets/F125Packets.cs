namespace SectorForge.Collector.Adapters.F125.Packets;

public abstract record F125Packet(F125PacketHeader Header);

public sealed record F125MotionPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    F125PlayerMotionData PlayerCar)
    : F125Packet(Header);

public sealed record F125SessionPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    F125SessionData Session)
    : F125Packet(Header);

public sealed record F125LapDataPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    IReadOnlyList<F125PlayerLapData> Cars,
    F125PlayerLapData PlayerCar)
    : F125Packet(Header);

public sealed record F125ParticipantsPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    IReadOnlyList<F125ParticipantData> Participants)
    : F125Packet(Header);

public sealed record F125CarTelemetryPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    F125PlayerCarTelemetry PlayerCar)
    : F125Packet(Header);

public sealed record F125CarStatusPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    IReadOnlyList<F125CarStatusData> Cars,
    F125CarStatusData PlayerCar)
    : F125Packet(Header);

public sealed record F125CarDamagePacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    IReadOnlyList<F125CarDamageData> Cars,
    F125CarDamageData PlayerCar)
    : F125Packet(Header);

public sealed record F125SessionHistoryPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    F125SessionHistoryData History)
    : F125Packet(Header);

public sealed record F125PlayerMotionData(
    double WorldPositionX,
    double WorldPositionY,
    double WorldPositionZ,
    double LateralG,
    double LongitudinalG,
    double VerticalG,
    double Yaw,
    double Pitch,
    double Roll);

public sealed record F125PlayerLapData(
    int CarIndex,
    int LapNumber,
    TimeSpan CurrentLapTime,
    TimeSpan? LastLapTime,
    TimeSpan? BestLapTime,
    int Position,
    int SectorIndex,
    double LapDistanceMeters,
    TimeSpan? Sector1Time,
    TimeSpan? Sector2Time,
    TimeSpan? DeltaToCarInFront,
    TimeSpan? DeltaToRaceLeader,
    double TotalDistanceMeters,
    bool IsValid,
    byte PitStatusCode,
    int PitStopCount,
    int GridPosition,
    byte ResultStatusCode,
    int PenaltiesSeconds,
    int WarningsCount,
    int CornersCut);

public sealed record F125PlayerCarTelemetry(
    double SpeedKph,
    double Throttle,
    double Brake,
    double Steering,
    double Clutch,
    int Gear,
    double Rpm,
    bool DrsActive,
    double EngineTemperatureC,
    F125WheelTelemetry BrakeTemperaturesC,
    F125WheelTelemetry TyreSurfaceTemperaturesC,
    F125WheelTelemetry TyreInnerTemperaturesC,
    F125WheelTelemetry TyrePressuresPsi);

public sealed record F125WheelTelemetry(
    double RearLeft,
    double RearRight,
    double FrontLeft,
    double FrontRight);

public sealed record F125SessionData(
    byte WeatherCode,
    double TrackTemperatureC,
    double AirTemperatureC,
    int TotalLaps,
    int TrackLengthMeters,
    byte SessionTypeCode,
    int TrackId,
    TimeSpan SessionTimeLeft,
    TimeSpan SessionDuration,
    byte SafetyCarStatusCode,
    IReadOnlyList<F125WeatherForecastSample> ForecastSamples);

public sealed record F125WeatherForecastSample(
    byte SessionTypeCode,
    int MinutesAhead,
    byte WeatherCode,
    double TrackTemperatureC,
    double AirTemperatureC,
    double RainPercent);

public sealed record F125ParticipantData(
    int CarIndex,
    string DriverName,
    byte TeamId,
    int DriverNumber,
    bool IsAi);

public sealed record F125CarStatusData(
    int CarIndex,
    bool TcActive,
    bool AbsActive,
    bool PitLimiterActive,
    bool DrsAllowed,
    double FuelInTankLiters,
    double FuelCapacityLiters,
    double FuelRemainingLaps,
    byte ActualTyreCompoundCode,
    byte VisualTyreCompoundCode,
    int TyreAgeLaps,
    double ErsStoreJoules,
    byte ErsDeployModeCode,
    double ErsHarvestedThisLapMguk,
    double ErsHarvestedThisLapMguh,
    double ErsDeployedThisLapJoules);

public sealed record F125CarDamageData(
    int CarIndex,
    double FrontLeftTyreWearPercent,
    double FrontRightTyreWearPercent,
    double RearLeftTyreWearPercent,
    double RearRightTyreWearPercent,
    double FrontLeftTyreDamagePercent,
    double FrontRightTyreDamagePercent,
    double RearLeftTyreDamagePercent,
    double RearRightTyreDamagePercent,
    double FrontLeftBrakeDamagePercent,
    double FrontRightBrakeDamagePercent,
    double RearLeftBrakeDamagePercent,
    double RearRightBrakeDamagePercent,
    double FrontLeftWingDamagePercent,
    double FrontRightWingDamagePercent,
    double RearWingDamagePercent,
    double FloorDamagePercent,
    double DiffuserDamagePercent,
    double SidepodDamagePercent,
    double GearboxDamagePercent,
    double EngineDamagePercent);

public sealed record F125SessionHistoryData(
    int CarIndex,
    IReadOnlyList<F125LapHistoryData> Laps,
    TimeSpan? BestLapTime,
    TimeSpan? BestSector1,
    TimeSpan? BestSector2,
    TimeSpan? BestSector3,
    F125LapHistoryData? LastCompletedLap);

public sealed record F125LapHistoryData(
    int LapNumber,
    TimeSpan? LapTime,
    TimeSpan? Sector1,
    TimeSpan? Sector2,
    TimeSpan? Sector3,
    bool? IsValid);
