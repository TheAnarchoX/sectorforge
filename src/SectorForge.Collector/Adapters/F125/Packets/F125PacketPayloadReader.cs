using System.Buffers.Binary;

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
    {
        var failure = F125PacketLayout.ValidatePlayerPayload(
            header,
            payload,
            F125PacketLayout.CarMotionDataSize,
            PacketId);
        if (failure is not null)
        {
            return F125PacketPayloadReadResult.Failed(failure);
        }

        var playerPayload = F125PacketLayout.PlayerPayload(
            header,
            payload,
            F125PacketLayout.CarMotionDataSize);
        var playerCar = new F125PlayerMotionData(
            WorldPositionX: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(0, sizeof(float))),
            WorldPositionY: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(4, sizeof(float))),
            WorldPositionZ: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(8, sizeof(float))),
            LateralG: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(36, sizeof(float))),
            LongitudinalG: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(40, sizeof(float))),
            VerticalG: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(44, sizeof(float))),
            Yaw: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(48, sizeof(float))),
            Pitch: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(52, sizeof(float))),
            Roll: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(56, sizeof(float))));

        return F125PacketPayloadReadResult.Parsed(new F125MotionPacket(header, payload.ToArray(), playerCar));
    }
}

public sealed class F125LapDataPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.LapData;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
    {
        var failure = F125PacketLayout.ValidatePlayerPayload(
            header,
            payload,
            F125PacketLayout.LapDataSize,
            PacketId);
        if (failure is not null)
        {
            return F125PacketPayloadReadResult.Failed(failure);
        }

        var playerPayload = F125PacketLayout.PlayerPayload(
            header,
            payload,
            F125PacketLayout.LapDataSize);
        var currentLapTime = BinaryPrimitives.ReadUInt32LittleEndian(playerPayload.Slice(4, sizeof(uint)));
        var lastLapTime = BinaryPrimitives.ReadUInt32LittleEndian(playerPayload.Slice(0, sizeof(uint)));
        var playerCar = new F125PlayerLapData(
            LapNumber: playerPayload[31],
            CurrentLapTime: TimeSpan.FromMilliseconds(currentLapTime),
            LastLapTime: lastLapTime == 0 ? null : TimeSpan.FromMilliseconds(lastLapTime),
            BestLapTime: null,
            SectorIndex: playerPayload[34],
            LapDistanceMeters: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(18, sizeof(float))));

        return F125PacketPayloadReadResult.Parsed(new F125LapDataPacket(header, payload.ToArray(), playerCar));
    }
}

public sealed class F125CarTelemetryPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.CarTelemetry;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
    {
        var failure = F125PacketLayout.ValidatePlayerPayload(
            header,
            payload,
            F125PacketLayout.CarTelemetryDataSize,
            PacketId);
        if (failure is not null)
        {
            return F125PacketPayloadReadResult.Failed(failure);
        }

        var playerPayload = F125PacketLayout.PlayerPayload(
            header,
            payload,
            F125PacketLayout.CarTelemetryDataSize);
        var playerCar = new F125PlayerCarTelemetry(
            SpeedKph: BinaryPrimitives.ReadUInt16LittleEndian(playerPayload[..sizeof(ushort)]),
            Throttle: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(2, sizeof(float))),
            Brake: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(10, sizeof(float))),
            Steering: BinaryPrimitives.ReadSingleLittleEndian(playerPayload.Slice(6, sizeof(float))),
            Clutch: playerPayload[14] / 100.0,
            Gear: unchecked((sbyte)playerPayload[15]),
            Rpm: BinaryPrimitives.ReadUInt16LittleEndian(playerPayload.Slice(16, sizeof(ushort))));

        return F125PacketPayloadReadResult.Parsed(new F125CarTelemetryPacket(header, payload.ToArray(), playerCar));
    }
}

internal static class F125PacketLayout
{
    public const int CarCount = 22;
    public const int CarMotionDataSize = 60;
    public const int LapDataSize = 50;
    public const int CarTelemetryDataSize = 60;

    public static F125PacketReadFailure? ValidatePlayerPayload(
        F125PacketHeader header,
        ReadOnlySpan<byte> payload,
        int playerCarDataSize,
        byte packetId)
    {
        if (header.PlayerCarIndex >= CarCount)
        {
            return new F125PacketReadFailure(
                F125PacketReadFailureKind.InvalidPlayerCarIndex,
                $"F1 25 player car index {header.PlayerCarIndex} is outside the supported car array.",
                ActualBytes: payload.Length,
                PacketId: packetId);
        }

        var requiredBytes = PlayerCarOffset(header, playerCarDataSize) + playerCarDataSize;
        if (payload.Length < requiredBytes)
        {
            return new F125PacketReadFailure(
                F125PacketReadFailureKind.TruncatedPayload,
                $"F1 25 packet {packetId} requires {requiredBytes} payload bytes for player car {header.PlayerCarIndex} but received {payload.Length}.",
                ActualBytes: payload.Length,
                RequiredBytes: requiredBytes,
                PacketId: packetId);
        }

        return null;
    }

    public static ReadOnlySpan<byte> PlayerPayload(
        F125PacketHeader header,
        ReadOnlySpan<byte> payload,
        int playerCarDataSize)
        => payload.Slice(PlayerCarOffset(header, playerCarDataSize), playerCarDataSize);

    private static int PlayerCarOffset(F125PacketHeader header, int playerCarDataSize)
        => header.PlayerCarIndex * playerCarDataSize;
}
