using System.Buffers.Binary;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.F125.Packets;

namespace SectorForge.Protocol.Tests.F125;

public sealed class F125PacketReaderTests
{
    private const int CarCount = 22;
    private const int MotionDataSize = 60;
    private const int LapDataSize = 50;
    private const int CarTelemetryDataSize = 60;

    [Fact]
    public void ReadsHeaderWithLittleEndianFieldsAndDispatchesKnownPacket()
    {
        var reader = new F125PacketReader();
        var payload = BuildMotionPayload(playerCarIndex: 7);
        var buffer = BuildPacket(F125PacketIds.Motion, playerCarIndex: 7, payload);

        var result = reader.Read(buffer);

        Assert.Equal(F125PacketReadStatus.Parsed, result.Status);
        var packet = Assert.IsType<F125MotionPacket>(result.Packet);
        Assert.Equal(payload, packet.Payload.ToArray());
        Assert.NotNull(result.Header);
        Assert.Equal(F125PacketHeader.ExpectedPacketFormat, result.Header.PacketFormat);
        Assert.Equal(25, result.Header.GameYear);
        Assert.Equal(1, result.Header.GameMajorVersion);
        Assert.Equal(2, result.Header.GameMinorVersion);
        Assert.Equal(3, result.Header.PacketVersion);
        Assert.Equal(F125PacketIds.Motion, result.Header.PacketId);
        Assert.Equal(0x0102_0304_0506_0708UL, result.Header.SessionUid);
        Assert.Equal(42.5f, result.Header.SessionTime);
        Assert.Equal(1234U, result.Header.FrameIdentifier);
        Assert.Equal(5678U, result.Header.OverallFrameIdentifier);
        Assert.Equal(7, result.Header.PlayerCarIndex);
        Assert.Equal(255, result.Header.SecondaryPlayerCarIndex);
        Assert.Equal(12.5, packet.PlayerCar.WorldPositionX, precision: 3);
        Assert.Equal(1.25, packet.PlayerCar.LateralG, precision: 3);
        Assert.Null(result.Failure);
    }

    [Fact]
    public void SkipsUnknownPacketIdsWithoutThrowing()
    {
        var reader = new F125PacketReader();
        var buffer = BuildPacket(packetId: 99, playerCarIndex: 4, payload: [0x01, 0x02]);

        var result = reader.Read(buffer);

        Assert.Equal(F125PacketReadStatus.Skipped, result.Status);
        Assert.Equal(F125PacketSkipReason.UnsupportedPacketId, result.SkipReason);
        Assert.NotNull(result.Header);
        Assert.Equal(99, result.Header.PacketId);
        Assert.Equal(4, result.Header.PlayerCarIndex);
        Assert.Null(result.Packet);
        Assert.Null(result.Failure);
    }

    [Fact]
    public void WrongPacketFormatReturnsTypedFailure()
    {
        var reader = new F125PacketReader();
        var buffer = BuildPacket(F125PacketIds.Motion, playerCarIndex: 0);
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(0, sizeof(ushort)), 2024);

        var result = reader.Read(buffer);

        Assert.Equal(F125PacketReadStatus.Failed, result.Status);
        Assert.Null(result.Header);
        Assert.NotNull(result.Failure);
        Assert.Equal(F125PacketReadFailureKind.InvalidPacketFormat, result.Failure.Kind);
        Assert.Equal(F125PacketHeader.ExpectedPacketFormat, result.Failure.ExpectedPacketFormat.GetValueOrDefault());
        Assert.Equal((ushort)2024, result.Failure.ActualPacketFormat.GetValueOrDefault());
    }

    [Fact]
    public void TruncatedHeaderReturnsTypedFailure()
    {
        var reader = new F125PacketReader();
        var buffer = BuildPacket(F125PacketIds.Motion, playerCarIndex: 0);

        var result = reader.Read(buffer.AsSpan(0, F125PacketHeader.Size - 1));

        Assert.Equal(F125PacketReadStatus.Failed, result.Status);
        Assert.Null(result.Header);
        Assert.NotNull(result.Failure);
        Assert.Equal(F125PacketReadFailureKind.TruncatedHeader, result.Failure.Kind);
        Assert.Equal(F125PacketHeader.Size - 1, result.Failure.ActualBytes);
        Assert.Equal(F125PacketHeader.Size, result.Failure.RequiredBytes);
    }

    [Fact]
    public void PlayerCarIndexIsReadFromEveryHeader()
    {
        var reader = new F125PacketReader();

        var firstResult = reader.Read(BuildPacket(
            F125PacketIds.LapData,
            playerCarIndex: 2,
            BuildLapDataPayload(playerCarIndex: 2)));
        var secondResult = reader.Read(BuildPacket(
            F125PacketIds.CarTelemetry,
            playerCarIndex: 12,
            BuildCarTelemetryPayload(playerCarIndex: 12)));

        Assert.Equal(F125PacketReadStatus.Parsed, firstResult.Status);
        Assert.Equal(F125PacketReadStatus.Parsed, secondResult.Status);
        Assert.NotNull(firstResult.Header);
        Assert.NotNull(secondResult.Header);
        Assert.Equal((byte)2, firstResult.Header.PlayerCarIndex);
        Assert.Equal((byte)12, secondResult.Header.PlayerCarIndex);
        Assert.IsType<F125LapDataPacket>(firstResult.Packet);
        Assert.IsType<F125CarTelemetryPacket>(secondResult.Packet);
    }

    [Fact]
    public void TruncatedPlayerPayloadReturnsTypedFailure()
    {
        var reader = new F125PacketReader();

        var result = reader.Read(BuildPacket(
            F125PacketIds.CarTelemetry,
            playerCarIndex: 3,
            payload: [0x01, 0x02]));

        Assert.Equal(F125PacketReadStatus.Failed, result.Status);
        Assert.NotNull(result.Header);
        Assert.NotNull(result.Failure);
        Assert.Equal(F125PacketReadFailureKind.TruncatedPayload, result.Failure.Kind);
        Assert.Equal(F125PacketIds.CarTelemetry, result.Failure.PacketId.GetValueOrDefault());
        Assert.Equal(2, result.Failure.ActualBytes);
        Assert.True(result.Failure.RequiredBytes.GetValueOrDefault() > result.Failure.ActualBytes);
    }

    [Fact]
    public void InvalidPlayerCarIndexReturnsTypedFailure()
    {
        var reader = new F125PacketReader();

        var result = reader.Read(BuildPacket(
            F125PacketIds.LapData,
            playerCarIndex: 255,
            BuildLapDataPayload(playerCarIndex: 0)));

        Assert.Equal(F125PacketReadStatus.Failed, result.Status);
        Assert.NotNull(result.Header);
        Assert.NotNull(result.Failure);
        Assert.Equal(F125PacketReadFailureKind.InvalidPlayerCarIndex, result.Failure.Kind);
        Assert.Equal(F125PacketIds.LapData, result.Failure.PacketId.GetValueOrDefault());
    }

    [Fact]
    public void PayloadReaderFailuresReturnTypedFailure()
    {
        var reader = new F125PacketReader([new FailingPayloadReader(F125PacketIds.Motion)]);

        var result = reader.Read(BuildPacket(F125PacketIds.Motion, playerCarIndex: 5));

        Assert.Equal(F125PacketReadStatus.Failed, result.Status);
        Assert.NotNull(result.Header);
        Assert.Equal((byte)5, result.Header.PlayerCarIndex);
        Assert.NotNull(result.Failure);
        Assert.Equal(F125PacketReadFailureKind.PacketReaderFailure, result.Failure.Kind);
        Assert.Equal(F125PacketIds.Motion, result.Failure.PacketId.GetValueOrDefault());
    }

    private static byte[] BuildPacket(byte packetId, byte playerCarIndex, ReadOnlySpan<byte> payload = default)
    {
        var buffer = new byte[F125PacketHeader.Size + payload.Length];
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(0, sizeof(ushort)), F125PacketHeader.ExpectedPacketFormat);
        buffer[2] = 25;
        buffer[3] = 1;
        buffer[4] = 2;
        buffer[5] = 3;
        buffer[6] = packetId;
        BinaryPrimitives.WriteUInt64LittleEndian(buffer.AsSpan(7, sizeof(ulong)), 0x0102_0304_0506_0708UL);
        BinaryPrimitives.WriteSingleLittleEndian(buffer.AsSpan(15, sizeof(float)), 42.5f);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(19, sizeof(uint)), 1234);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(23, sizeof(uint)), 5678);
        buffer[27] = playerCarIndex;
        buffer[28] = 255;
        payload.CopyTo(buffer.AsSpan(F125PacketHeader.Size));

        return buffer;
    }

    private static byte[] BuildMotionPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * MotionDataSize];
        var playerOffset = playerCarIndex * MotionDataSize;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset, sizeof(float)), 12.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 36, sizeof(float)), 1.25f);
        return payload;
    }

    private static byte[] BuildLapDataPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * LapDataSize];
        var playerOffset = playerCarIndex * LapDataSize;
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset, sizeof(uint)), 83_210);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset + 4, sizeof(uint)), 12_345);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 18, sizeof(float)), 1234.5f);
        payload[playerOffset + 31] = 7;
        payload[playerOffset + 34] = 2;
        return payload;
    }

    private static byte[] BuildCarTelemetryPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarTelemetryDataSize];
        var playerOffset = playerCarIndex * CarTelemetryDataSize;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset, sizeof(ushort)), 213);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 2, sizeof(float)), 0.72f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 6, sizeof(float)), -0.34f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 10, sizeof(float)), 0.18f);
        payload[playerOffset + 14] = 64;
        payload[playerOffset + 15] = 6;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 16, sizeof(ushort)), 11_250);
        return payload;
    }

    private sealed class FailingPayloadReader(byte packetId) : IF125PacketPayloadReader
    {
        public byte PacketId { get; } = packetId;

        public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
        {
            throw new InvalidOperationException("Synthetic reader failure");
        }
    }
}
