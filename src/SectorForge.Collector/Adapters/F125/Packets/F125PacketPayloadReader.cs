namespace SectorForge.Collector.Adapters.F125.Packets;

public interface IF125PacketPayloadReader
{
    byte PacketId { get; }

    F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload);
}

public static class F125PacketPayloadReaders
{
    public static IReadOnlyList<IF125PacketPayloadReader> Default { get; } =
    [
        new F125MotionPacketReader(),
        new F125LapDataPacketReader(),
        new F125CarTelemetryPacketReader()
    ];
}

public sealed class F125MotionPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.Motion;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
        => F125PacketPayloadReadResult.Parsed(new F125MotionPacket(header, payload.ToArray()));
}

public sealed class F125LapDataPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.LapData;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
        => F125PacketPayloadReadResult.Parsed(new F125LapDataPacket(header, payload.ToArray()));
}

public sealed class F125CarTelemetryPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.CarTelemetry;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
        => F125PacketPayloadReadResult.Parsed(new F125CarTelemetryPacket(header, payload.ToArray()));
}
