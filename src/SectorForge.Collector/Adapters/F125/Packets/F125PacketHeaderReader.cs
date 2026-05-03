using System.Buffers.Binary;

namespace SectorForge.Collector.Adapters.F125.Packets;

public static class F125PacketHeaderReader
{
    public static F125PacketHeaderReadResult Read(ReadOnlySpan<byte> buffer)
    {
        if (buffer.Length < F125PacketHeader.Size)
        {
            return F125PacketHeaderReadResult.Failed(new F125PacketReadFailure(
                F125PacketReadFailureKind.TruncatedHeader,
                $"F1 25 packet header requires {F125PacketHeader.Size} bytes but received {buffer.Length}.",
                ActualBytes: buffer.Length,
                RequiredBytes: F125PacketHeader.Size));
        }

        var packetFormat = BinaryPrimitives.ReadUInt16LittleEndian(buffer[..2]);
        if (packetFormat != F125PacketHeader.ExpectedPacketFormat)
        {
            return F125PacketHeaderReadResult.Failed(new F125PacketReadFailure(
                F125PacketReadFailureKind.InvalidPacketFormat,
                $"Expected F1 25 packet format {F125PacketHeader.ExpectedPacketFormat} but received {packetFormat}.",
                ActualBytes: buffer.Length,
                ExpectedPacketFormat: F125PacketHeader.ExpectedPacketFormat,
                ActualPacketFormat: packetFormat));
        }

        var header = new F125PacketHeader(
            PacketFormat: packetFormat,
            GameYear: buffer[2],
            GameMajorVersion: buffer[3],
            GameMinorVersion: buffer[4],
            PacketVersion: buffer[5],
            PacketId: buffer[6],
            SessionUid: BinaryPrimitives.ReadUInt64LittleEndian(buffer.Slice(7, sizeof(ulong))),
            SessionTime: BinaryPrimitives.ReadSingleLittleEndian(buffer.Slice(15, sizeof(float))),
            FrameIdentifier: BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(19, sizeof(uint))),
            OverallFrameIdentifier: BinaryPrimitives.ReadUInt32LittleEndian(buffer.Slice(23, sizeof(uint))),
            PlayerCarIndex: buffer[27],
            SecondaryPlayerCarIndex: buffer[28]);

        return F125PacketHeaderReadResult.Parsed(header);
    }
}
