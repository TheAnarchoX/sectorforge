namespace SectorForge.Collector.Adapters.F125.Packets;

public enum F125PacketReadStatus
{
    Parsed,
    Skipped,
    Failed
}

public enum F125PacketSkipReason
{
    UnsupportedPacketId
}

public enum F125PacketReadFailureKind
{
    TruncatedHeader,
    InvalidPacketFormat,
    PacketReaderFailure
}

public sealed record F125PacketReadFailure(
    F125PacketReadFailureKind Kind,
    string Message,
    int ActualBytes = 0,
    int? RequiredBytes = null,
    ushort? ExpectedPacketFormat = null,
    ushort? ActualPacketFormat = null,
    byte? PacketId = null);

public sealed record F125PacketHeaderReadResult(
    F125PacketHeader? Header,
    F125PacketReadFailure? Failure)
{
    public bool IsSuccess => Header is not null && Failure is null;

    public static F125PacketHeaderReadResult Parsed(F125PacketHeader header)
        => new(header, null);

    public static F125PacketHeaderReadResult Failed(F125PacketReadFailure failure)
        => new(null, failure);
}

public sealed record F125PacketPayloadReadResult(
    F125Packet? Packet,
    F125PacketReadFailure? Failure)
{
    public bool IsSuccess => Packet is not null && Failure is null;

    public static F125PacketPayloadReadResult Parsed(F125Packet packet)
        => new(packet, null);

    public static F125PacketPayloadReadResult Failed(F125PacketReadFailure failure)
        => new(null, failure);
}

public sealed record F125PacketReadResult(
    F125PacketReadStatus Status,
    F125PacketHeader? Header,
    F125Packet? Packet,
    F125PacketReadFailure? Failure,
    F125PacketSkipReason? SkipReason)
{
    public static F125PacketReadResult Parsed(F125Packet packet)
        => new(F125PacketReadStatus.Parsed, packet.Header, packet, null, null);

    public static F125PacketReadResult Skipped(F125PacketHeader header, F125PacketSkipReason skipReason)
        => new(F125PacketReadStatus.Skipped, header, null, null, skipReason);

    public static F125PacketReadResult Failed(F125PacketReadFailure failure)
        => new(F125PacketReadStatus.Failed, null, null, failure, null);

    public static F125PacketReadResult Failed(F125PacketHeader header, F125PacketReadFailure failure)
        => new(F125PacketReadStatus.Failed, header, null, failure, null);
}
