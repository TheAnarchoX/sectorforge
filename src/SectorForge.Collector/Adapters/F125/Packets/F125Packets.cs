namespace SectorForge.Collector.Adapters.F125.Packets;

public abstract record F125Packet(F125PacketHeader Header);

public sealed record F125MotionPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    F125PlayerMotionData PlayerCar)
    : F125Packet(Header);

public sealed record F125LapDataPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    F125PlayerLapData PlayerCar)
    : F125Packet(Header);

public sealed record F125CarTelemetryPacket(
    F125PacketHeader Header,
    ReadOnlyMemory<byte> Payload,
    F125PlayerCarTelemetry PlayerCar)
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
    int LapNumber,
    TimeSpan CurrentLapTime,
    TimeSpan? LastLapTime,
    TimeSpan? BestLapTime,
    int SectorIndex,
    double LapDistanceMeters);

public sealed record F125PlayerCarTelemetry(
    double SpeedKph,
    double Throttle,
    double Brake,
    double Steering,
    double Clutch,
    int Gear,
    double Rpm);
