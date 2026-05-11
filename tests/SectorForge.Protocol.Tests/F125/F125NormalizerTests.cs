using System.Buffers.Binary;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.F125.Packets;
using SectorForge.Core.Telemetry;

namespace SectorForge.Protocol.Tests.F125;

public sealed class F125NormalizerTests
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

        var capturedAt = new DateTimeOffset(2026, 5, 3, 16, 0, 0, TimeSpan.Zero);

        var sample = new F125Normalizer(new FixedTimeProvider(capturedAt)).Normalize(motion, lapData, carTelemetry);

        Assert.Equal(GameId.F125, sample.Source.Game);
        Assert.Equal("f1-25-udp", sample.Source.AdapterId);
        Assert.Equal(TelemetrySourceStatus.Running, sample.Source.Status);
        Assert.False(sample.Source.IsSimulated);
        Assert.Equal(5678, sample.Sequence);
        Assert.Equal(capturedAt, sample.Timestamp);
        Assert.Equal(TimeSpan.FromSeconds(42.5), sample.Timing.SessionElapsed);
        Assert.Equal(capturedAt - TimeSpan.FromSeconds(42.5), sample.Session.StartedAt);
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
        Assert.Equal(91, sample.Tyres.FrontLeft?.SurfaceC.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(101, sample.Tyres.FrontLeft?.CoreC.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(92, sample.Tyres.FrontRight?.SurfaceC.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(102, sample.Tyres.FrontRight?.CoreC.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(83, sample.Tyres.RearLeft?.SurfaceC.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(84, sample.Tyres.RearRight?.SurfaceC.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(27.1, sample.Tyres.FrontLeftPressurePsi.GetValueOrDefault(), precision: 3);
        Assert.Equal(27.2, sample.Tyres.FrontRightPressurePsi.GetValueOrDefault(), precision: 3);
        Assert.Equal(26.1, sample.Tyres.RearLeftPressurePsi.GetValueOrDefault(), precision: 3);
        Assert.Equal(26.2, sample.Tyres.RearRightPressurePsi.GetValueOrDefault(), precision: 3);
        Assert.Equal(401, sample.Brakes.FrontLeftTemperatureC.GetValueOrDefault(), precision: 3);
        Assert.Equal(402, sample.Brakes.FrontRightTemperatureC.GetValueOrDefault(), precision: 3);
        Assert.Equal(301, sample.Brakes.RearLeftTemperatureC.GetValueOrDefault(), precision: 3);
        Assert.Equal(302, sample.Brakes.RearRightTemperatureC.GetValueOrDefault(), precision: 3);

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

    [Fact]
    public void NormalizesOptionalPacketsIntoExpandedTelemetryChannels()
    {
        var playerCarIndex = (byte)1;
        var motion = ReadPacket<F125MotionPacket>(
            F125PacketIds.Motion,
            playerCarIndex,
            BuildMotionPayload(playerCarIndex));
        var lapData = ReadPacket<F125LapDataPacket>(
            F125PacketIds.LapData,
            playerCarIndex,
            BuildMultiCarLapDataPayload(playerCarIndex));
        var carTelemetry = ReadPacket<F125CarTelemetryPacket>(
            F125PacketIds.CarTelemetry,
            playerCarIndex,
            BuildCarTelemetryPayload(playerCarIndex));
        var session = ReadPacket<F125SessionPacket>(
            F125PacketIds.Session,
            playerCarIndex,
            BuildSessionPayload());
        var participants = ReadPacket<F125ParticipantsPacket>(
            F125PacketIds.Participants,
            playerCarIndex,
            BuildParticipantsPayload());
        var carStatus = ReadPacket<F125CarStatusPacket>(
            F125PacketIds.CarStatus,
            playerCarIndex,
            BuildCarStatusPayload(playerCarIndex));
        var carDamage = ReadPacket<F125CarDamagePacket>(
            F125PacketIds.CarDamage,
            playerCarIndex,
            BuildCarDamagePayload(playerCarIndex));
        var playerHistory = ReadPacket<F125SessionHistoryPacket>(
            F125PacketIds.SessionHistory,
            playerCarIndex,
            BuildSessionHistoryPayload(playerCarIndex));
        var otherHistory = ReadPacket<F125SessionHistoryPacket>(
            F125PacketIds.SessionHistory,
            playerCarIndex,
            BuildSessionHistoryPayload(carIndex: 0));
        var capturedAt = new DateTimeOffset(2026, 5, 3, 16, 30, 0, TimeSpan.Zero);

        var sample = new F125Normalizer(new FixedTimeProvider(capturedAt)).Normalize(new F125TelemetryPacketSet(
            motion,
            lapData,
            carTelemetry,
            session,
            participants,
            carStatus,
            carDamage,
            new Dictionary<int, F125SessionHistoryPacket>
            {
                [0] = otherHistory,
                [playerCarIndex] = playerHistory
            }));

        Assert.Equal("5-lap race", sample.Session.Name);
        Assert.Equal("Race", sample.Session.SessionType);
        Assert.True(sample.DriverInput.DrsAllowed);
        Assert.True(sample.DriverInput.PitLimiterActive);
        Assert.True(sample.DriverInput.AbsActive);
        Assert.True(sample.DriverInput.TcActive);
        Assert.Equal(TyreCompound.Medium, sample.Tyres.Compound);
        Assert.Equal(8, sample.Tyres.AgeLaps);
        Assert.Equal(13.5, sample.Tyres.FrontLeftWear?.WearPercent.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(14.5, sample.Tyres.FrontRightWear?.WearPercent.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(11.5, sample.Tyres.RearLeftWear?.WearPercent.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(12.5, sample.Tyres.RearRightWear?.WearPercent.GetValueOrDefault() ?? 0, precision: 3);

        Assert.NotNull(sample.Damage);
        Assert.Equal(2, sample.Damage.FrontLeftWingPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(3, sample.Damage.FrontRightWingPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(4, sample.Damage.RearWingPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(5, sample.Damage.FloorPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(6, sample.Damage.DiffuserPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(7, sample.Damage.SidepodPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(8, sample.Damage.GearboxPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(9, sample.Damage.EnginePercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(21, sample.Damage.FrontLeftTyreDamage?.DamagePercent.GetValueOrDefault() ?? 0, precision: 3);
        Assert.Equal(23, sample.Damage.FrontLeftBrakeDamage?.DamagePercent.GetValueOrDefault() ?? 0, precision: 3);

        Assert.NotNull(sample.PowerUnit);
        Assert.Equal(3_200_000, sample.PowerUnit.ErsStoreJoules.GetValueOrDefault(), precision: 3);
        Assert.Equal(3_300, sample.PowerUnit.ErsDeployedThisLapJoules.GetValueOrDefault(), precision: 3);
        Assert.Equal(1_100, sample.PowerUnit.ErsHarvestedThisLapMguk.GetValueOrDefault(), precision: 3);
        Assert.Equal(2_200, sample.PowerUnit.ErsHarvestedThisLapMguh.GetValueOrDefault(), precision: 3);
        Assert.Equal(ErsDeployMode.Overtake, sample.PowerUnit.ErsDeployMode);

        Assert.Equal(TimeSpan.FromMilliseconds(83_111), sample.Lap.BestLapTime);
        Assert.Equal(TimeSpan.FromMilliseconds(21_111), sample.Lap.LastSector1Time);
        Assert.Equal(TimeSpan.FromMilliseconds(31_000), sample.Lap.LastSector2Time);
        Assert.Equal(TimeSpan.FromMilliseconds(29_000), sample.Lap.LastSector3Time);
        Assert.Equal(34.5, sample.Fuel.RemainingLiters.GetValueOrDefault(), precision: 3);
        Assert.Equal(110.0, sample.Fuel.CapacityLiters.GetValueOrDefault(), precision: 3);
        Assert.Equal(2.706, sample.Fuel.LitersPerLapEstimate.GetValueOrDefault(), precision: 3);
        Assert.Equal(12, sample.Fuel.LapsRemainingEstimate);

        Assert.Equal("Silverstone", sample.Track.TrackName);
        Assert.Equal("7", sample.Track.TrackId);
        Assert.Equal(5_891, sample.Track.TrackLengthMeters.GetValueOrDefault(), precision: 3);
        Assert.Equal(-2, sample.Track.TrackTemperatureC.GetValueOrDefault(), precision: 3);
        Assert.Equal(18, sample.Track.AirTemperatureC.GetValueOrDefault(), precision: 3);
        Assert.Equal("Light rain", sample.Track.Weather);
        Assert.Equal(42, sample.Track.RainPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(WeatherKind.LightRain, sample.Track.WeatherEnum);
        Assert.Equal(SafetyCarStatus.Virtual, sample.Track.SafetyCarStatus);
        Assert.False(sample.Track.FormationLap);
        Assert.Equal(TimeSpan.FromSeconds(600), sample.Timing.SessionTimeLeft);
        Assert.Equal(TimeSpan.FromSeconds(1_200), sample.Timing.SessionDuration);
        Assert.NotNull(sample.WeatherForecast);
        Assert.Collection(
            sample.WeatherForecast.Samples,
            first =>
            {
                Assert.Equal(0, first.MinutesAhead);
                Assert.Equal(WeatherKind.LightRain, first.Weather);
                Assert.Equal(42, first.RainPercent.GetValueOrDefault(), precision: 3);
            },
            second =>
            {
                Assert.Equal(15, second.MinutesAhead);
                Assert.Equal(WeatherKind.HeavyRain, second.Weather);
                Assert.Equal(72, second.RainPercent.GetValueOrDefault(), precision: 3);
            });

        Assert.NotNull(sample.Participants);
        var participantsList = sample.Participants!;
        Assert.Collection(
            participantsList,
            first =>
            {
                Assert.Equal("Avery Cole", first.DriverName);
                Assert.Equal("Team 10", first.TeamName);
                Assert.Equal(44, first.DriverNumber);
                Assert.False(first.IsAi);
                Assert.False(first.IsPlayer);
                Assert.Equal(1, first.Position);
                Assert.Equal(TyreCompound.Soft, first.TyreCompound);
            },
            second =>
            {
                Assert.Equal("Mika Stone", second.DriverName);
                Assert.Equal("Team 12", second.TeamName);
                Assert.Equal(81, second.DriverNumber);
                Assert.True(second.IsAi);
                Assert.True(second.IsPlayer);
                Assert.Equal(2, second.Position);
                Assert.Equal(4, second.GridPosition);
                Assert.Equal(ResultStatus.Finished, second.ResultStatus);
                Assert.Equal(TyreCompound.Medium, second.TyreCompound);
                Assert.Equal(TimeSpan.FromMilliseconds(21_111), second.BestSector1);
                Assert.Equal(TimeSpan.FromMilliseconds(31_000), second.BestSector2);
                Assert.Equal(TimeSpan.FromMilliseconds(29_000), second.BestSector3);
            });
    }

    [Fact]
    public void NormalizesFallbackMappingsWhenOptionalMetadataIsSparse()
    {
        var playerCarIndex = (byte)0;
        var motion = ReadPacket<F125MotionPacket>(
            F125PacketIds.Motion,
            playerCarIndex,
            BuildMotionPayload(playerCarIndex));

        var lapPayload = BuildLapDataPayload(playerCarIndex);
        lapPayload[32] = 0;
        lapPayload[34] = 2;
        lapPayload[43] = 0;
        lapPayload[45] = 7;
        var lapData = ReadPacket<F125LapDataPacket>(
            F125PacketIds.LapData,
            playerCarIndex,
            lapPayload);

        var carTelemetry = ReadPacket<F125CarTelemetryPacket>(
            F125PacketIds.CarTelemetry,
            playerCarIndex,
            BuildCarTelemetryPayload(playerCarIndex));

        var sessionPayload = BuildSessionPayload();
        sessionPayload[0] = 99;
        sessionPayload[3] = 0;
        sessionPayload[6] = 99;
        sessionPayload[7] = 99;
        sessionPayload[124] = 3;
        sessionPayload[SessionForecastCountOffset] = 1;
        var forecast = sessionPayload.AsSpan(SessionForecastStartOffset, WeatherForecastSampleSize);
        forecast.Clear();
        forecast[0] = 99;
        forecast[1] = 5;
        forecast[2] = 99;
        forecast[7] = 64;
        var session = ReadPacket<F125SessionPacket>(
            F125PacketIds.Session,
            playerCarIndex,
            sessionPayload);

        var carStatusPayload = BuildCarStatusPayload(playerCarIndex);
        carStatusPayload[13] = 0;
        carStatusPayload[14] = 0;
        carStatusPayload[15] = 0x80;
        carStatusPayload[16] = 0xBF;
        carStatusPayload[25] = 18;
        carStatusPayload[26] = 0;
        carStatusPayload[41] = 9;
        var carStatus = ReadPacket<F125CarStatusPacket>(
            F125PacketIds.CarStatus,
            playerCarIndex,
            carStatusPayload);

        var playerHistory = ReadPacket<F125SessionHistoryPacket>(
            F125PacketIds.SessionHistory,
            playerCarIndex,
            BuildSessionHistoryPayload(playerCarIndex));

        var sample = new F125Normalizer().Normalize(new F125TelemetryPacketSet(
            motion,
            lapData,
            carTelemetry,
            session,
            Participants: null,
            carStatus,
            CarDamage: null,
            SessionHistoryByCarIndex: new Dictionary<int, F125SessionHistoryPacket>
            {
                [playerCarIndex] = playerHistory
            }));

        Assert.Equal("Session 99", sample.Session.Name);
        Assert.Equal("Session 99", sample.Session.SessionType);
        Assert.Equal(PitStatus.InPitArea, sample.Lap.PitStatus);
        Assert.Equal(TyreCompound.Hard, sample.Tyres.Compound);
        Assert.Null(sample.Fuel.LitersPerLapEstimate);
        Assert.Null(sample.Fuel.LapsRemainingEstimate);
        Assert.Equal("Track 99", sample.Track.TrackName);
        Assert.Equal("99", sample.Track.TrackId);
        Assert.Equal(WeatherKind.Unknown, sample.Track.WeatherEnum);
        Assert.Equal("Unknown", sample.Track.Weather);
        Assert.Equal(64d, sample.Track.RainPercent.GetValueOrDefault(), precision: 3);
        Assert.Equal(SafetyCarStatus.Unknown, sample.Track.SafetyCarStatus);
        Assert.True(sample.Track.FormationLap);
        Assert.NotNull(sample.PowerUnit);
        Assert.Equal(ErsDeployMode.Unknown, sample.PowerUnit.ErsDeployMode);

        Assert.NotNull(sample.Participants);
        var participant = Assert.Single(sample.Participants!);
        Assert.Equal("Car 1", participant.DriverName);
        Assert.Null(participant.TeamName);
        Assert.Equal(1, participant.Position);
        Assert.True(participant.IsPlayer);
        Assert.True(participant.IsInPit);
        Assert.Equal(ResultStatus.Retired, participant.ResultStatus);
        Assert.Null(participant.GridPosition);
        Assert.Null(participant.DriverNumber);
        Assert.Null(participant.IsAi);
        Assert.Equal(TyreCompound.Hard, participant.TyreCompound);
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
        WriteLapData(payload, playerCarIndex, position: 2, gridPosition: 4, resultStatus: 3);
        return payload;
    }

    private static byte[] BuildMultiCarLapDataPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * LapDataSize];
        WriteLapData(payload, carIndex: 0, position: 1, gridPosition: 3, resultStatus: 2);
        WriteLapData(payload, playerCarIndex, position: 2, gridPosition: 4, resultStatus: 3);
        return payload;
    }

    private static void WriteLapData(byte[] payload, byte carIndex, byte position, byte gridPosition, byte resultStatus)
    {
        var playerOffset = carIndex * LapDataSize;
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset, sizeof(uint)), 83_210);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset + 4, sizeof(uint)), 12_345);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 8, sizeof(ushort)), 23_456);
        payload[playerOffset + 10] = 1;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 11, sizeof(ushort)), 12_345);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 14, sizeof(ushort)), 450);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 17, sizeof(ushort)), 1_750);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 20, sizeof(float)), 1234.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 24, sizeof(float)), 5432.25f);
        payload[playerOffset + 32] = position;
        payload[playerOffset + 33] = 7;
        payload[playerOffset + 34] = 1;
        payload[playerOffset + 35] = 2;
        payload[playerOffset + 36] = 2;
        payload[playerOffset + 37] = 0;
        payload[playerOffset + 38] = 5;
        payload[playerOffset + 39] = 4;
        payload[playerOffset + 40] = 3;
        payload[playerOffset + 43] = gridPosition;
        payload[playerOffset + 45] = resultStatus;
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

    private static byte[] BuildSessionPayload()
    {
        var payload = new byte[SessionForecastStartOffset + 3 * WeatherForecastSampleSize];
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
        payload[SessionForecastCountOffset] = 3;

        var first = payload.AsSpan(SessionForecastStartOffset, WeatherForecastSampleSize);
        first[0] = 14;
        first[1] = 0;
        first[2] = 0;
        first[3] = 25;
        first[5] = 20;
        first[7] = 5;

        var second = payload.AsSpan(SessionForecastStartOffset + WeatherForecastSampleSize, WeatherForecastSampleSize);
        second[0] = 15;
        second[1] = 0;
        second[2] = 3;
        second[3] = 22;
        second[5] = 18;
        second[7] = 42;

        var third = payload.AsSpan(SessionForecastStartOffset + 2 * WeatherForecastSampleSize, WeatherForecastSampleSize);
        third[0] = 15;
        third[1] = 15;
        third[2] = 4;
        third[3] = 20;
        third[5] = 17;
        third[7] = 72;
        return payload;
    }

    private static byte[] BuildParticipantsPayload()
    {
        var payload = new byte[1 + 2 * ParticipantDataSize];
        payload[0] = 2;
        WriteParticipant(payload.AsSpan(1, ParticipantDataSize), "Avery Cole", teamId: 10, driverNumber: 44, isAi: false);
        WriteParticipant(payload.AsSpan(1 + ParticipantDataSize, ParticipantDataSize), "Mika Stone", teamId: 12, driverNumber: 81, isAi: true);
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

    private static byte[] BuildCarStatusPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarStatusDataSize];
        WriteCarStatus(payload, carIndex: 0, visualCompound: 16);
        WriteCarStatus(payload, playerCarIndex, visualCompound: 17);
        return payload;
    }

    private static void WriteCarStatus(byte[] payload, byte carIndex, byte visualCompound)
    {
        var playerOffset = carIndex * CarStatusDataSize;
        payload[playerOffset] = 2;
        payload[playerOffset + 1] = 1;
        payload[playerOffset + 4] = 1;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 5, sizeof(float)), 34.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 9, sizeof(float)), 110.0f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 13, sizeof(float)), 12.75f);
        payload[playerOffset + 22] = 1;
        payload[playerOffset + 25] = visualCompound;
        payload[playerOffset + 26] = visualCompound;
        payload[playerOffset + 27] = 8;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 37, sizeof(float)), 3_200_000f);
        payload[playerOffset + 41] = 3;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 42, sizeof(float)), 1_100f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 46, sizeof(float)), 2_200f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 50, sizeof(float)), 3_300f);
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

    private static byte[] BuildSessionHistoryPayload(byte carIndex)
    {
        var payload = new byte[SessionHistoryHeaderSize + 2 * SessionHistoryLapDataSize];
        payload[0] = carIndex;
        payload[1] = 2;
        payload[3] = 2;
        payload[4] = 2;
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

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow()
            => utcNow;
    }
}
