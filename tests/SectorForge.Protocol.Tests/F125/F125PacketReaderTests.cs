using System.Buffers.Binary;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.F125.Packets;

namespace SectorForge.Protocol.Tests.F125;

public sealed class F125PacketReaderTests
{
    private const int CarCount = 22;
    private const int MotionDataSize = 60;
    private const int LapDataSize = 57;
    private const int CarTelemetryDataSize = 60;
    private const int CarStatusDataSize = 55;
    private const int CarDamageDataSize = 42;
    private const int ParticipantDataSize = 57;
    private const int SessionForecastCountOffset = 126;
    private const int SessionForecastStartOffset = 127;
    private const int WeatherForecastSampleSize = 8;
    private const int SessionHistoryHeaderSize = 7;
    private const int SessionHistoryLapDataSize = 14;

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
        var carTelemetryPacket = Assert.IsType<F125CarTelemetryPacket>(secondResult.Packet);
        Assert.Equal(401, carTelemetryPacket.PlayerCar.BrakeTemperaturesC.FrontLeft, precision: 3);
        Assert.Equal(402, carTelemetryPacket.PlayerCar.BrakeTemperaturesC.FrontRight, precision: 3);
        Assert.Equal(301, carTelemetryPacket.PlayerCar.BrakeTemperaturesC.RearLeft, precision: 3);
        Assert.Equal(302, carTelemetryPacket.PlayerCar.BrakeTemperaturesC.RearRight, precision: 3);
        Assert.Equal(91, carTelemetryPacket.PlayerCar.TyreSurfaceTemperaturesC.FrontLeft, precision: 3);
        Assert.Equal(101, carTelemetryPacket.PlayerCar.TyreInnerTemperaturesC.FrontLeft, precision: 3);
        Assert.Equal(27.1, carTelemetryPacket.PlayerCar.TyrePressuresPsi.FrontLeft, precision: 3);
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

    [Fact]
    public void ReadsCarStatusPacketForPlayerCar()
    {
        var reader = new F125PacketReader();
        var buffer = BuildPacket(
            F125PacketIds.CarStatus,
            playerCarIndex: 2,
            BuildCarStatusPayload(playerCarIndex: 2));

        var result = reader.Read(buffer);

        Assert.Equal(F125PacketReadStatus.Parsed, result.Status);
        var packet = Assert.IsType<F125CarStatusPacket>(result.Packet);
        Assert.Equal(2, packet.PlayerCar.CarIndex);
        Assert.True(packet.PlayerCar.TcActive);
        Assert.True(packet.PlayerCar.AbsActive);
        Assert.True(packet.PlayerCar.PitLimiterActive);
        Assert.True(packet.PlayerCar.DrsAllowed);
        Assert.Equal(34.5, packet.PlayerCar.FuelInTankLiters, precision: 3);
        Assert.Equal(110.0, packet.PlayerCar.FuelCapacityLiters, precision: 3);
        Assert.Equal(12.75, packet.PlayerCar.FuelRemainingLaps, precision: 3);
        Assert.Equal(16, packet.PlayerCar.ActualTyreCompoundCode);
        Assert.Equal(17, packet.PlayerCar.VisualTyreCompoundCode);
        Assert.Equal(8, packet.PlayerCar.TyreAgeLaps);
        Assert.Equal(3_200_000, packet.PlayerCar.ErsStoreJoules, precision: 3);
        Assert.Equal(3, packet.PlayerCar.ErsDeployModeCode);
        Assert.Equal(1_100, packet.PlayerCar.ErsHarvestedThisLapMguk, precision: 3);
        Assert.Equal(2_200, packet.PlayerCar.ErsHarvestedThisLapMguh, precision: 3);
        Assert.Equal(3_300, packet.PlayerCar.ErsDeployedThisLapJoules, precision: 3);
    }

    [Fact]
    public void ReadsCarDamagePacketForPlayerCar()
    {
        var reader = new F125PacketReader();
        var buffer = BuildPacket(
            F125PacketIds.CarDamage,
            playerCarIndex: 5,
            BuildCarDamagePayload(playerCarIndex: 5));

        var result = reader.Read(buffer);

        Assert.Equal(F125PacketReadStatus.Parsed, result.Status);
        var packet = Assert.IsType<F125CarDamagePacket>(result.Packet);
        Assert.Equal(5, packet.PlayerCar.CarIndex);
        Assert.Equal(13.5, packet.PlayerCar.FrontLeftTyreWearPercent, precision: 3);
        Assert.Equal(14.5, packet.PlayerCar.FrontRightTyreWearPercent, precision: 3);
        Assert.Equal(11.5, packet.PlayerCar.RearLeftTyreWearPercent, precision: 3);
        Assert.Equal(12.5, packet.PlayerCar.RearRightTyreWearPercent, precision: 3);
        Assert.Equal(21, packet.PlayerCar.FrontLeftTyreDamagePercent);
        Assert.Equal(22, packet.PlayerCar.FrontRightTyreDamagePercent);
        Assert.Equal(23, packet.PlayerCar.FrontLeftBrakeDamagePercent);
        Assert.Equal(24, packet.PlayerCar.FrontRightBrakeDamagePercent);
        Assert.Equal(2, packet.PlayerCar.FrontLeftWingDamagePercent);
        Assert.Equal(3, packet.PlayerCar.FrontRightWingDamagePercent);
        Assert.Equal(4, packet.PlayerCar.RearWingDamagePercent);
        Assert.Equal(5, packet.PlayerCar.FloorDamagePercent);
        Assert.Equal(6, packet.PlayerCar.DiffuserDamagePercent);
        Assert.Equal(7, packet.PlayerCar.SidepodDamagePercent);
        Assert.Equal(8, packet.PlayerCar.GearboxDamagePercent);
        Assert.Equal(9, packet.PlayerCar.EngineDamagePercent);
    }

    [Fact]
    public void ReadsSessionPacketWithBoundedWeatherForecast()
    {
        var reader = new F125PacketReader();
        var buffer = BuildPacket(
            F125PacketIds.Session,
            playerCarIndex: 0,
            BuildSessionPayload(forecastCount: 2));

        var result = reader.Read(buffer);

        Assert.Equal(F125PacketReadStatus.Parsed, result.Status);
        var packet = Assert.IsType<F125SessionPacket>(result.Packet);
        Assert.Equal(3, packet.Session.WeatherCode);
        Assert.Equal(-2, packet.Session.TrackTemperatureC, precision: 3);
        Assert.Equal(18, packet.Session.AirTemperatureC, precision: 3);
        Assert.Equal(5, packet.Session.TotalLaps);
        Assert.Equal(5_891, packet.Session.TrackLengthMeters);
        Assert.Equal(15, packet.Session.SessionTypeCode);
        Assert.Equal(7, packet.Session.TrackId);
        Assert.Equal(TimeSpan.FromSeconds(600), packet.Session.SessionTimeLeft);
        Assert.Equal(TimeSpan.FromSeconds(1_200), packet.Session.SessionDuration);
        Assert.Equal(2, packet.Session.SafetyCarStatusCode);
        Assert.Collection(
            packet.Session.ForecastSamples,
            first =>
            {
                Assert.Equal(0, first.MinutesAhead);
                Assert.Equal(3, first.WeatherCode);
                Assert.Equal(42, first.RainPercent, precision: 3);
            },
            second =>
            {
                Assert.Equal(15, second.MinutesAhead);
                Assert.Equal(4, second.WeatherCode);
                Assert.Equal(72, second.RainPercent, precision: 3);
            });
    }

    [Fact]
    public void WeatherForecastCountAboveBoundReturnsTypedFailure()
    {
        var reader = new F125PacketReader();
        var buffer = BuildPacket(
            F125PacketIds.Session,
            playerCarIndex: 0,
            BuildSessionPayload(forecastCount: 65));

        var result = reader.Read(buffer);

        Assert.Equal(F125PacketReadStatus.Failed, result.Status);
        Assert.NotNull(result.Failure);
        Assert.Equal(F125PacketReadFailureKind.InvalidPayload, result.Failure.Kind);
        Assert.Equal(F125PacketIds.Session, result.Failure.PacketId.GetValueOrDefault());
    }

    [Fact]
    public void ReadsParticipantAndSessionHistoryPackets()
    {
        var reader = new F125PacketReader();
        var participantsResult = reader.Read(BuildPacket(
            F125PacketIds.Participants,
            playerCarIndex: 1,
            BuildParticipantsPayload(activeCarCount: 2)));
        var historyResult = reader.Read(BuildPacket(
            F125PacketIds.SessionHistory,
            playerCarIndex: 1,
            BuildSessionHistoryPayload(carIndex: 1)));

        Assert.Equal(F125PacketReadStatus.Parsed, participantsResult.Status);
        var participantsPacket = Assert.IsType<F125ParticipantsPacket>(participantsResult.Packet);
        Assert.Collection(
            participantsPacket.Participants,
            first =>
            {
                Assert.Equal(0, first.CarIndex);
                Assert.Equal("Avery Cole", first.DriverName);
                Assert.Equal(10, first.TeamId);
                Assert.Equal(44, first.DriverNumber);
                Assert.False(first.IsAi);
            },
            second =>
            {
                Assert.Equal(1, second.CarIndex);
                Assert.Equal("Mika Stone", second.DriverName);
                Assert.Equal(12, second.TeamId);
                Assert.Equal(81, second.DriverNumber);
                Assert.True(second.IsAi);
            });

        Assert.Equal(F125PacketReadStatus.Parsed, historyResult.Status);
        var historyPacket = Assert.IsType<F125SessionHistoryPacket>(historyResult.Packet);
        Assert.Equal(1, historyPacket.History.CarIndex);
        Assert.Equal(TimeSpan.FromMilliseconds(83_111), historyPacket.History.BestLapTime);
        Assert.Equal(TimeSpan.FromMilliseconds(21_000), historyPacket.History.BestSector1);
        Assert.Equal(TimeSpan.FromMilliseconds(31_000), historyPacket.History.BestSector2);
        Assert.Equal(TimeSpan.FromMilliseconds(29_000), historyPacket.History.BestSector3);
        Assert.Equal(TimeSpan.FromMilliseconds(83_111), historyPacket.History.LastCompletedLap?.LapTime);
    }

    [Fact]
    public void ReadsSessionHistoryPacketWithMissingReferencesAndEmptyLaps()
    {
        var reader = new F125PacketReader();
        var payload = BuildSessionHistoryPayload(carIndex: 1);
        payload[3] = 0;
        payload[4] = 9;
        payload[5] = 0;
        payload[6] = 9;
        payload.AsSpan(SessionHistoryHeaderSize, SessionHistoryLapDataSize).Clear();
        payload.AsSpan(SessionHistoryHeaderSize + SessionHistoryLapDataSize, SessionHistoryLapDataSize).Clear();

        var result = reader.Read(BuildPacket(
            F125PacketIds.SessionHistory,
            playerCarIndex: 1,
            payload));

        Assert.Equal(F125PacketReadStatus.Parsed, result.Status);
        var historyPacket = Assert.IsType<F125SessionHistoryPacket>(result.Packet);
        Assert.Null(historyPacket.History.BestLapTime);
        Assert.Null(historyPacket.History.BestSector1);
        Assert.Null(historyPacket.History.BestSector2);
        Assert.Null(historyPacket.History.BestSector3);
        Assert.Null(historyPacket.History.LastCompletedLap);
        Assert.All(
            historyPacket.History.Laps,
            lap =>
            {
                Assert.Null(lap.LapTime);
                Assert.Null(lap.Sector1);
                Assert.Null(lap.Sector2);
                Assert.Null(lap.Sector3);
                Assert.False(lap.IsValid);
            });
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
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 20, sizeof(float)), 1234.5f);
        payload[playerOffset + 32] = 1;
        payload[playerOffset + 33] = 7;
        payload[playerOffset + 36] = 2;
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
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 22, sizeof(ushort)), 301);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 24, sizeof(ushort)), 302);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 26, sizeof(ushort)), 401);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 28, sizeof(ushort)), 402);
        payload[playerOffset + 30] = 83;
        payload[playerOffset + 31] = 84;
        payload[playerOffset + 32] = 91;
        payload[playerOffset + 33] = 92;
        payload[playerOffset + 34] = 94;
        payload[playerOffset + 35] = 95;
        payload[playerOffset + 36] = 101;
        payload[playerOffset + 37] = 102;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 38, sizeof(ushort)), 102);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 40, sizeof(float)), 26.1f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 44, sizeof(float)), 26.2f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 48, sizeof(float)), 27.1f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 52, sizeof(float)), 27.2f);
        return payload;
    }

    private static byte[] BuildCarStatusPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarStatusDataSize];
        var playerOffset = playerCarIndex * CarStatusDataSize;
        payload[playerOffset] = 2;
        payload[playerOffset + 1] = 1;
        payload[playerOffset + 4] = 1;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 5, sizeof(float)), 34.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 9, sizeof(float)), 110.0f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 13, sizeof(float)), 12.75f);
        payload[playerOffset + 22] = 1;
        payload[playerOffset + 25] = 16;
        payload[playerOffset + 26] = 17;
        payload[playerOffset + 27] = 8;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 37, sizeof(float)), 3_200_000f);
        payload[playerOffset + 41] = 3;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 42, sizeof(float)), 1_100f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 46, sizeof(float)), 2_200f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 50, sizeof(float)), 3_300f);
        return payload;
    }

    private static byte[] BuildCarDamagePayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarDamageDataSize];
        var playerOffset = playerCarIndex * CarDamageDataSize;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset, sizeof(float)), 11.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 4, sizeof(float)), 12.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 8, sizeof(float)), 13.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 12, sizeof(float)), 14.5f);
        payload[playerOffset + 16] = 19;
        payload[playerOffset + 17] = 20;
        payload[playerOffset + 18] = 21;
        payload[playerOffset + 19] = 22;
        payload[playerOffset + 20] = 17;
        payload[playerOffset + 21] = 18;
        payload[playerOffset + 22] = 23;
        payload[playerOffset + 23] = 24;
        payload[playerOffset + 24] = 2;
        payload[playerOffset + 25] = 3;
        payload[playerOffset + 26] = 4;
        payload[playerOffset + 27] = 5;
        payload[playerOffset + 28] = 6;
        payload[playerOffset + 29] = 7;
        payload[playerOffset + 32] = 8;
        payload[playerOffset + 33] = 9;
        return payload;
    }

    private static byte[] BuildSessionPayload(byte forecastCount)
    {
        var safeForecastCount = Math.Min(forecastCount, (byte)2);
        var payload = new byte[SessionForecastStartOffset + safeForecastCount * WeatherForecastSampleSize];
        payload[0] = 3;
        payload[1] = unchecked((byte)-2);
        payload[2] = 18;
        payload[3] = 5;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(4, sizeof(ushort)), 5_891);
        payload[6] = 15;
        payload[7] = 7;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(9, sizeof(ushort)), 600);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(11, sizeof(ushort)), 1_200);
        payload[124] = 2;
        payload[SessionForecastCountOffset] = forecastCount;

        if (safeForecastCount > 0)
        {
            var first = payload.AsSpan(SessionForecastStartOffset, WeatherForecastSampleSize);
            first[1] = 0;
            first[2] = 3;
            first[3] = 22;
            first[5] = 18;
            first[7] = 42;
        }

        if (safeForecastCount > 1)
        {
            var second = payload.AsSpan(SessionForecastStartOffset + WeatherForecastSampleSize, WeatherForecastSampleSize);
            second[1] = 15;
            second[2] = 4;
            second[3] = 20;
            second[5] = 17;
            second[7] = 72;
        }

        return payload;
    }

    private static byte[] BuildParticipantsPayload(byte activeCarCount)
    {
        var payload = new byte[1 + activeCarCount * ParticipantDataSize];
        payload[0] = activeCarCount;
        if (activeCarCount > 0)
        {
            WriteParticipant(payload.AsSpan(1, ParticipantDataSize), "Avery Cole", teamId: 10, driverNumber: 44, isAi: false);
        }

        if (activeCarCount > 1)
        {
            WriteParticipant(payload.AsSpan(1 + ParticipantDataSize, ParticipantDataSize), "Mika Stone", teamId: 12, driverNumber: 81, isAi: true);
        }

        return payload;
    }

    private static void WriteParticipant(Span<byte> payload, string driverName, byte teamId, byte driverNumber, bool isAi)
    {
        payload[0] = isAi ? (byte)1 : (byte)0;
        payload[3] = teamId;
        payload[5] = driverNumber;
        var nameBytes = System.Text.Encoding.ASCII.GetBytes(driverName);
        nameBytes.CopyTo(payload.Slice(7, nameBytes.Length));
    }

    private static byte[] BuildSessionHistoryPayload(byte carIndex)
    {
        var payload = new byte[SessionHistoryHeaderSize + 2 * SessionHistoryLapDataSize];
        payload[0] = carIndex;
        payload[1] = 2;
        payload[3] = 2;
        payload[4] = 1;
        payload[5] = 2;
        payload[6] = 2;
        WriteLapHistory(payload.AsSpan(SessionHistoryHeaderSize, SessionHistoryLapDataSize), lapTimeMs: 84_222, sector1Ms: 21_000, sector2Ms: 32_000, sector3Ms: 31_222);
        WriteLapHistory(payload.AsSpan(SessionHistoryHeaderSize + SessionHistoryLapDataSize, SessionHistoryLapDataSize), lapTimeMs: 83_111, sector1Ms: 21_111, sector2Ms: 31_000, sector3Ms: 29_000);
        return payload;
    }

    private static void WriteLapHistory(Span<byte> payload, uint lapTimeMs, ushort sector1Ms, ushort sector2Ms, ushort sector3Ms)
    {
        BinaryPrimitives.WriteUInt32LittleEndian(payload[..sizeof(uint)], lapTimeMs);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.Slice(4, sizeof(ushort)), sector1Ms);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.Slice(7, sizeof(ushort)), sector2Ms);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.Slice(10, sizeof(ushort)), sector3Ms);
        payload[13] = 1;
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
