using System.Buffers.Binary;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.F125.Packets;
using SectorForge.Core.Telemetry;

namespace SectorForge.Protocol.Tests.F125;

public sealed class F125NormalizerTests
{
    private const int CarCount = 22;
    private const int MotionDataSize = 60;
    private const int LapDataSize = 50;
    private const int CarTelemetryDataSize = 60;

    [Fact]
    public void NormalizesSyntheticPlayerCarTrioIntoTelemetrySample()
    {
        var playerCarIndex = (byte)3;
        var motion = ReadPacket<F125MotionPacket>(
            F125PacketIds.Motion,
            playerCarIndex,
            BuildMotionPayload(playerCarIndex));
        var lapData = ReadPacket<F125LapDataPacket>(
            F125PacketIds.LapData,
            playerCarIndex,
            BuildLapDataPayload(playerCarIndex));
        var carTelemetry = ReadPacket<F125CarTelemetryPacket>(
            F125PacketIds.CarTelemetry,
            playerCarIndex,
            BuildCarTelemetryPayload(playerCarIndex));

        var sample = new F125Normalizer().Normalize(motion, lapData, carTelemetry);

        Assert.Equal(GameId.F125, sample.Source.Game);
        Assert.Equal("f1-25-udp", sample.Source.AdapterId);
        Assert.Equal(TelemetrySourceStatus.Running, sample.Source.Status);
        Assert.False(sample.Source.IsSimulated);
        Assert.Equal(5678, sample.Sequence);
        Assert.Equal(TimeSpan.FromSeconds(42.5), sample.Timing.SessionElapsed);
        Assert.Equal(DateTimeOffset.UnixEpoch, sample.Session.StartedAt);
        Assert.Equal(ExpectedSessionId(), sample.SessionId);
        Assert.Equal(sample.SessionId, sample.Session.Id);
        Assert.True(sample.Session.IsActive);

        Assert.Equal(213, sample.Vehicle.SpeedKph.GetValueOrDefault(), precision: 3);
        Assert.Equal(11_250, sample.Vehicle.Rpm.GetValueOrDefault(), precision: 3);
        Assert.Equal(6, sample.Vehicle.Gear);
        Assert.Equal(102, sample.Vehicle.EngineTemperatureC.GetValueOrDefault(), precision: 3);
        Assert.Equal(1.25, sample.Vehicle.LateralG.GetValueOrDefault(), precision: 3);
        Assert.Equal(-0.5, sample.Vehicle.LongitudinalG.GetValueOrDefault(), precision: 3);
        Assert.Equal(0.1, sample.Vehicle.VerticalG.GetValueOrDefault(), precision: 3);
        Assert.Equal(12.5, sample.Vehicle.WorldPositionX.GetValueOrDefault(), precision: 3);
        Assert.Equal(-3.25, sample.Vehicle.WorldPositionY.GetValueOrDefault(), precision: 3);
        Assert.Equal(44.75, sample.Vehicle.WorldPositionZ.GetValueOrDefault(), precision: 3);
        Assert.Equal(0.02, sample.Vehicle.Yaw.GetValueOrDefault(), precision: 3);
        Assert.Equal(-0.01, sample.Vehicle.Pitch.GetValueOrDefault(), precision: 3);
        Assert.Equal(0.04, sample.Vehicle.Roll.GetValueOrDefault(), precision: 3);
        Assert.Equal(0.72, sample.DriverInput.Throttle.GetValueOrDefault(), precision: 3);
        Assert.Equal(0.18, sample.DriverInput.Brake.GetValueOrDefault(), precision: 3);
        Assert.Equal(-0.34, sample.DriverInput.Steering.GetValueOrDefault(), precision: 3);
        Assert.Equal(0.64, sample.DriverInput.Clutch.GetValueOrDefault(), precision: 3);
        Assert.True(sample.DriverInput.DrsActive);

        Assert.Equal(7, sample.Lap.LapNumber);
        Assert.Equal(TimeSpan.FromMilliseconds(12_345), sample.Lap.CurrentLapTime);
        Assert.Equal(TimeSpan.FromMilliseconds(83_210), sample.Lap.LastLapTime);
        Assert.Null(sample.Lap.BestLapTime);
        Assert.Equal(2, sample.Lap.SectorIndex);
        Assert.Equal(1234.5, sample.Lap.LapDistanceMeters.GetValueOrDefault(), precision: 3);
        Assert.Equal(TimeSpan.FromMilliseconds(83_456), sample.Lap.Sector1Time);
        Assert.Equal(TimeSpan.FromMilliseconds(12_345), sample.Lap.Sector2Time);
        Assert.Null(sample.Lap.Sector3Time);
        Assert.Null(sample.Lap.LastSector1Time);
        Assert.Null(sample.Lap.LastSector2Time);
        Assert.Null(sample.Lap.LastSector3Time);
        Assert.True(sample.Lap.IsValid);
        Assert.Equal(5432.25, sample.Lap.TotalDistanceMeters.GetValueOrDefault(), precision: 3);
        Assert.Equal(PitStatus.Pitting, sample.Lap.PitStatus);
        Assert.Equal(2, sample.Lap.PitStopCount);
        Assert.Equal(5, sample.Lap.PenaltiesSeconds);
        Assert.Equal(4, sample.Lap.WarningsCount);
        Assert.Equal(3, sample.Lap.CornersCut);

        Assert.Null(sample.Vehicle.CarName);
        Assert.Null(sample.Vehicle.OilTemperatureC);
        Assert.Null(sample.Tyres.FrontLeft);
        Assert.Null(sample.Brakes.FrontLeftTemperatureC);
        Assert.Null(sample.Fuel.RemainingLiters);
        Assert.Null(sample.Track.TrackName);
        Assert.Null(sample.Track.TrackId);
        Assert.Null(sample.Track.TrackLengthMeters);
        Assert.Null(sample.Track.RainPercent);
        Assert.Null(sample.Track.WeatherEnum);
        Assert.Null(sample.Track.SafetyCarStatus);
        Assert.Null(sample.Track.FormationLap);
        Assert.Null(sample.DriverInput.DrsAllowed);
        Assert.Null(sample.DriverInput.PitLimiterActive);
        Assert.Null(sample.DriverInput.AbsActive);
        Assert.Null(sample.DriverInput.TcActive);
        Assert.Null(sample.Timing.DeltaToBestLap);
        Assert.Null(sample.Timing.SessionTimeLeft);
        Assert.Null(sample.Timing.SessionDuration);
        Assert.Null(sample.Participants);
        Assert.Null(sample.WeatherForecast);
    }

    private static TPacket ReadPacket<TPacket>(
        byte packetId,
        byte playerCarIndex,
        ReadOnlySpan<byte> payload)
        where TPacket : F125Packet
    {
        var result = new F125PacketReader().Read(BuildPacket(packetId, playerCarIndex, payload));

        Assert.Equal(F125PacketReadStatus.Parsed, result.Status);
        return Assert.IsType<TPacket>(result.Packet);
    }

    private static byte[] BuildPacket(byte packetId, byte playerCarIndex, ReadOnlySpan<byte> payload)
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

    private static Guid ExpectedSessionId()
    {
        var bytes = new byte[16];
        BinaryPrimitives.WriteUInt64LittleEndian(bytes, 0x0102_0304_0506_0708UL);
        return new Guid(bytes);
    }

    private static byte[] BuildMotionPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * MotionDataSize];
        var playerOffset = playerCarIndex * MotionDataSize;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset, sizeof(float)), 12.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 4, sizeof(float)), -3.25f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 8, sizeof(float)), 44.75f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 36, sizeof(float)), 1.25f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 40, sizeof(float)), -0.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 44, sizeof(float)), 0.1f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 48, sizeof(float)), 0.02f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 52, sizeof(float)), -0.01f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 56, sizeof(float)), 0.04f);
        return payload;
    }

    private static byte[] BuildLapDataPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * LapDataSize];
        var playerOffset = playerCarIndex * LapDataSize;
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset, sizeof(uint)), 83_210);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset + 4, sizeof(uint)), 12_345);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 8, sizeof(ushort)), 23_456);
        payload[playerOffset + 10] = 1;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 11, sizeof(ushort)), 12_345);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 18, sizeof(float)), 1234.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 22, sizeof(float)), 5432.25f);
        payload[playerOffset + 31] = 7;
        payload[playerOffset + 32] = 1;
        payload[playerOffset + 33] = 2;
        payload[playerOffset + 34] = 2;
        payload[playerOffset + 35] = 0;
        payload[playerOffset + 36] = 5;
        payload[playerOffset + 37] = 4;
        payload[playerOffset + 38] = 3;
        return payload;
    }

    private static byte[] BuildCarTelemetryPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarTelemetryDataSize];
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(0, sizeof(ushort)), 99);

        var playerOffset = playerCarIndex * CarTelemetryDataSize;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset, sizeof(ushort)), 213);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 2, sizeof(float)), 0.72f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 6, sizeof(float)), -0.34f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 10, sizeof(float)), 0.18f);
        payload[playerOffset + 14] = 64;
        payload[playerOffset + 15] = 6;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 16, sizeof(ushort)), 11_250);
        payload[playerOffset + 18] = 1;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 38, sizeof(ushort)), 102);
        return payload;
    }
}
