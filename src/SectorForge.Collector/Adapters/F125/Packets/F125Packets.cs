namespace SectorForge.Collector.Adapters.F125.Packets;

public abstract record F125Packet(F125PacketHeader Header);

public sealed record F125MotionPacket(F125PacketHeader Header, ReadOnlyMemory<byte> Payload)
    : F125Packet(Header);

public sealed record F125LapDataPacket(F125PacketHeader Header, ReadOnlyMemory<byte> Payload)
    : F125Packet(Header);

public sealed record F125CarTelemetryPacket(F125PacketHeader Header, ReadOnlyMemory<byte> Payload)
    : F125Packet(Header);
