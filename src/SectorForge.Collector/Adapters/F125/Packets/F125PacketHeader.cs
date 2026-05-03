namespace SectorForge.Collector.Adapters.F125.Packets;

public sealed record F125PacketHeader(
    ushort PacketFormat,
    byte GameYear,
    byte GameMajorVersion,
    byte GameMinorVersion,
    byte PacketVersion,
    byte PacketId,
    ulong SessionUid,
    float SessionTime,
    uint FrameIdentifier,
    uint OverallFrameIdentifier,
    byte PlayerCarIndex,
    byte SecondaryPlayerCarIndex)
{
    public const int Size = 29;
    public const ushort ExpectedPacketFormat = 2025;
}
