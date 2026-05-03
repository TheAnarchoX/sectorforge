using System.Buffers.Binary;
using System.Text;

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
        new F125SessionPacketReader(),
        new F125LapDataPacketReader(),
        new F125ParticipantsPacketReader(),
        new F125CarTelemetryPacketReader(),
        new F125CarStatusPacketReader(),
        new F125CarDamagePacketReader(),
        new F125SessionHistoryPacketReader()
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

public sealed class F125SessionPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.Session;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
    {
        if (payload.Length < F125PacketLayout.SessionWeatherForecastStartOffset)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.Truncated(
                PacketId,
                payload.Length,
                F125PacketLayout.SessionWeatherForecastStartOffset));
        }

        var forecastCount = payload[F125PacketLayout.SessionWeatherForecastCountOffset];
        if (forecastCount > F125PacketLayout.MaxWeatherForecastSamples)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.InvalidPayload(
                PacketId,
                $"F1 25 session packet contains {forecastCount} weather forecast samples, above the supported maximum of {F125PacketLayout.MaxWeatherForecastSamples}."));
        }

        var requiredBytes = F125PacketLayout.SessionWeatherForecastStartOffset
            + forecastCount * F125PacketLayout.WeatherForecastSampleSize;
        if (payload.Length < requiredBytes)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.Truncated(
                PacketId,
                payload.Length,
                requiredBytes));
        }

        var forecastSamples = new List<F125WeatherForecastSample>(forecastCount);
        for (var index = 0; index < forecastCount; index++)
        {
            var sample = payload.Slice(
                F125PacketLayout.SessionWeatherForecastStartOffset + index * F125PacketLayout.WeatherForecastSampleSize,
                F125PacketLayout.WeatherForecastSampleSize);
            forecastSamples.Add(new F125WeatherForecastSample(
                MinutesAhead: sample[1],
                WeatherCode: sample[2],
                TrackTemperatureC: F125PacketLayout.ReadSignedByte(sample[3]),
                AirTemperatureC: F125PacketLayout.ReadSignedByte(sample[5]),
                RainPercent: sample[7]));
        }

        var session = new F125SessionData(
            WeatherCode: payload[0],
            TrackTemperatureC: F125PacketLayout.ReadSignedByte(payload[1]),
            AirTemperatureC: F125PacketLayout.ReadSignedByte(payload[2]),
            TotalLaps: payload[3],
            TrackLengthMeters: BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(4, sizeof(ushort))),
            SessionTypeCode: payload[6],
            TrackId: F125PacketLayout.ReadSignedByte(payload[7]),
            SessionTimeLeft: TimeSpan.FromSeconds(BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(9, sizeof(ushort)))),
            SessionDuration: TimeSpan.FromSeconds(BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(11, sizeof(ushort)))),
            SafetyCarStatusCode: payload[124],
            ForecastSamples: forecastSamples);

        return F125PacketPayloadReadResult.Parsed(new F125SessionPacket(header, payload.ToArray(), session));
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

        var carCount = F125PacketLayout.AvailableCarCount(payload, F125PacketLayout.LapDataSize);
        var cars = new List<F125PlayerLapData>(carCount);
        for (var carIndex = 0; carIndex < carCount; carIndex++)
        {
            cars.Add(ReadLapData(
                carIndex,
                F125PacketLayout.CarPayload(payload, F125PacketLayout.LapDataSize, carIndex)));
        }

        return F125PacketPayloadReadResult.Parsed(new F125LapDataPacket(
            header,
            payload.ToArray(),
            cars,
            cars[header.PlayerCarIndex]));
    }

    private static F125PlayerLapData ReadLapData(int carIndex, ReadOnlySpan<byte> payload)
    {
        var currentLapTime = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(4, sizeof(uint)));
        var lastLapTime = BinaryPrimitives.ReadUInt32LittleEndian(payload.Slice(0, sizeof(uint)));

        return new F125PlayerLapData(
            CarIndex: carIndex,
            LapNumber: payload[33],
            CurrentLapTime: TimeSpan.FromMilliseconds(currentLapTime),
            LastLapTime: F125PacketLayout.ReadMilliseconds(lastLapTime),
            BestLapTime: null,
            Position: payload[32],
            SectorIndex: payload[36],
            LapDistanceMeters: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(20, sizeof(float))),
            Sector1Time: F125PacketLayout.ReadSectorTime(payload, millisecondsOffset: 8, minutesOffset: 10),
            Sector2Time: F125PacketLayout.ReadSectorTime(payload, millisecondsOffset: 11, minutesOffset: 13),
            DeltaToCarInFront: F125PacketLayout.ReadSectorTime(payload, millisecondsOffset: 14, minutesOffset: 16),
            DeltaToRaceLeader: F125PacketLayout.ReadSectorTime(payload, millisecondsOffset: 17, minutesOffset: 19),
            TotalDistanceMeters: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(24, sizeof(float))),
            IsValid: payload[37] == 0,
            PitStatusCode: payload[34],
            PitStopCount: payload[35],
            GridPosition: payload[43],
            ResultStatusCode: payload[45],
            PenaltiesSeconds: payload[38],
            WarningsCount: payload[39],
            CornersCut: payload[40]);
    }
}

public sealed class F125ParticipantsPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.Participants;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
    {
        if (payload.Length < 1)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.Truncated(PacketId, payload.Length, 1));
        }

        var activeCarCount = payload[0];
        if (activeCarCount > F125PacketLayout.CarCount)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.InvalidPayload(
                PacketId,
                $"F1 25 participants packet contains {activeCarCount} active cars, above the supported maximum of {F125PacketLayout.CarCount}."));
        }

        var requiredBytes = 1 + activeCarCount * F125PacketLayout.ParticipantDataSize;
        if (payload.Length < requiredBytes)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.Truncated(PacketId, payload.Length, requiredBytes));
        }

        var participants = new List<F125ParticipantData>(activeCarCount);
        for (var carIndex = 0; carIndex < activeCarCount; carIndex++)
        {
            var participantPayload = payload.Slice(
                1 + carIndex * F125PacketLayout.ParticipantDataSize,
                F125PacketLayout.ParticipantDataSize);
            participants.Add(new F125ParticipantData(
                CarIndex: carIndex,
                DriverName: ReadName(participantPayload.Slice(7, F125PacketLayout.ParticipantNameLength)),
                TeamId: participantPayload[3],
                DriverNumber: participantPayload[5],
                IsAi: participantPayload[0] != 0));
        }

        return F125PacketPayloadReadResult.Parsed(new F125ParticipantsPacket(header, payload.ToArray(), participants));
    }

    private static string ReadName(ReadOnlySpan<byte> nameBytes)
        => Encoding.ASCII.GetString(nameBytes).TrimEnd('\0', ' ');
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
            Rpm: BinaryPrimitives.ReadUInt16LittleEndian(playerPayload.Slice(16, sizeof(ushort))),
            DrsActive: playerPayload[18] != 0,
            EngineTemperatureC: BinaryPrimitives.ReadUInt16LittleEndian(playerPayload.Slice(38, sizeof(ushort))),
            BrakeTemperaturesC: F125PacketLayout.ReadUInt16WheelTelemetry(playerPayload, 22),
            TyreSurfaceTemperaturesC: F125PacketLayout.ReadByteWheelTelemetry(playerPayload, 30),
            TyreInnerTemperaturesC: F125PacketLayout.ReadByteWheelTelemetry(playerPayload, 34),
            TyrePressuresPsi: F125PacketLayout.ReadSingleWheelTelemetry(playerPayload, 40));

        return F125PacketPayloadReadResult.Parsed(new F125CarTelemetryPacket(header, payload.ToArray(), playerCar));
    }
}

public sealed class F125CarStatusPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.CarStatus;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
    {
        var failure = F125PacketLayout.ValidatePlayerPayload(
            header,
            payload,
            F125PacketLayout.CarStatusDataSize,
            PacketId);
        if (failure is not null)
        {
            return F125PacketPayloadReadResult.Failed(failure);
        }

        var cars = ReadCars(payload);
        return F125PacketPayloadReadResult.Parsed(new F125CarStatusPacket(
            header,
            payload.ToArray(),
            cars,
            cars[header.PlayerCarIndex]));
    }

    private static IReadOnlyList<F125CarStatusData> ReadCars(ReadOnlySpan<byte> payload)
    {
        var carCount = F125PacketLayout.AvailableCarCount(payload, F125PacketLayout.CarStatusDataSize);
        var cars = new List<F125CarStatusData>(carCount);
        for (var carIndex = 0; carIndex < carCount; carIndex++)
        {
            cars.Add(ReadCarStatus(
                carIndex,
                F125PacketLayout.CarPayload(payload, F125PacketLayout.CarStatusDataSize, carIndex)));
        }

        return cars;
    }

    private static F125CarStatusData ReadCarStatus(int carIndex, ReadOnlySpan<byte> payload)
        => new(
            CarIndex: carIndex,
            TcActive: payload[0] != 0,
            AbsActive: payload[1] != 0,
            PitLimiterActive: payload[4] != 0,
            DrsAllowed: payload[22] != 0,
            FuelInTankLiters: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(5, sizeof(float))),
            FuelCapacityLiters: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(9, sizeof(float))),
            FuelRemainingLaps: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(13, sizeof(float))),
            ActualTyreCompoundCode: payload[25],
            VisualTyreCompoundCode: payload[26],
            TyreAgeLaps: payload[27],
            ErsStoreJoules: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(37, sizeof(float))),
            ErsDeployModeCode: payload[41],
            ErsHarvestedThisLapMguk: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(42, sizeof(float))),
            ErsHarvestedThisLapMguh: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(46, sizeof(float))),
            ErsDeployedThisLapJoules: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(50, sizeof(float))));
}

public sealed class F125CarDamagePacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.CarDamage;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
    {
        var failure = F125PacketLayout.ValidatePlayerPayload(
            header,
            payload,
            F125PacketLayout.CarDamageDataSize,
            PacketId);
        if (failure is not null)
        {
            return F125PacketPayloadReadResult.Failed(failure);
        }

        var cars = ReadCars(payload);
        return F125PacketPayloadReadResult.Parsed(new F125CarDamagePacket(
            header,
            payload.ToArray(),
            cars,
            cars[header.PlayerCarIndex]));
    }

    private static IReadOnlyList<F125CarDamageData> ReadCars(ReadOnlySpan<byte> payload)
    {
        var carCount = F125PacketLayout.AvailableCarCount(payload, F125PacketLayout.CarDamageDataSize);
        var cars = new List<F125CarDamageData>(carCount);
        for (var carIndex = 0; carIndex < carCount; carIndex++)
        {
            cars.Add(ReadCarDamage(
                carIndex,
                F125PacketLayout.CarPayload(payload, F125PacketLayout.CarDamageDataSize, carIndex)));
        }

        return cars;
    }

    private static F125CarDamageData ReadCarDamage(int carIndex, ReadOnlySpan<byte> payload)
        => new(
            CarIndex: carIndex,
            FrontLeftTyreWearPercent: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(8, sizeof(float))),
            FrontRightTyreWearPercent: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(12, sizeof(float))),
            RearLeftTyreWearPercent: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(0, sizeof(float))),
            RearRightTyreWearPercent: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(4, sizeof(float))),
            FrontLeftTyreDamagePercent: payload[18],
            FrontRightTyreDamagePercent: payload[19],
            RearLeftTyreDamagePercent: payload[16],
            RearRightTyreDamagePercent: payload[17],
            FrontLeftBrakeDamagePercent: payload[22],
            FrontRightBrakeDamagePercent: payload[23],
            RearLeftBrakeDamagePercent: payload[20],
            RearRightBrakeDamagePercent: payload[21],
            FrontLeftWingDamagePercent: payload[24],
            FrontRightWingDamagePercent: payload[25],
            RearWingDamagePercent: payload[26],
            FloorDamagePercent: payload[27],
            DiffuserDamagePercent: payload[28],
            SidepodDamagePercent: payload[29],
            GearboxDamagePercent: payload[32],
            EngineDamagePercent: payload[33]);
}

public sealed class F125SessionHistoryPacketReader : IF125PacketPayloadReader
{
    public byte PacketId => F125PacketIds.SessionHistory;

    public F125PacketPayloadReadResult Read(F125PacketHeader header, ReadOnlySpan<byte> payload)
    {
        if (payload.Length < F125PacketLayout.SessionHistoryHeaderSize)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.Truncated(
                PacketId,
                payload.Length,
                F125PacketLayout.SessionHistoryHeaderSize));
        }

        var carIndex = payload[0];
        if (carIndex >= F125PacketLayout.CarCount)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.InvalidPayload(
                PacketId,
                $"F1 25 session history packet uses car index {carIndex}, outside the supported car array."));
        }

        var lapCount = payload[1];
        if (lapCount > F125PacketLayout.MaxSessionHistoryLaps)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.InvalidPayload(
                PacketId,
                $"F1 25 session history packet contains {lapCount} laps, above the supported maximum of {F125PacketLayout.MaxSessionHistoryLaps}."));
        }

        var requiredBytes = F125PacketLayout.SessionHistoryHeaderSize
            + lapCount * F125PacketLayout.SessionHistoryLapDataSize;
        if (payload.Length < requiredBytes)
        {
            return F125PacketPayloadReadResult.Failed(F125PacketLayout.Truncated(PacketId, payload.Length, requiredBytes));
        }

        var laps = new List<F125LapHistoryData>(lapCount);
        for (var index = 0; index < lapCount; index++)
        {
            laps.Add(ReadLapHistory(
                index + 1,
                payload.Slice(
                    F125PacketLayout.SessionHistoryHeaderSize + index * F125PacketLayout.SessionHistoryLapDataSize,
                    F125PacketLayout.SessionHistoryLapDataSize)));
        }

        var history = new F125SessionHistoryData(
            CarIndex: carIndex,
            Laps: laps,
            BestLapTime: GetLapByNumber(laps, payload[3])?.LapTime,
            BestSector1: GetLapByNumber(laps, payload[4])?.Sector1,
            BestSector2: GetLapByNumber(laps, payload[5])?.Sector2,
            BestSector3: GetLapByNumber(laps, payload[6])?.Sector3,
            LastCompletedLap: laps.LastOrDefault(lap => lap.LapTime is not null));

        return F125PacketPayloadReadResult.Parsed(new F125SessionHistoryPacket(header, payload.ToArray(), history));
    }

    private static F125LapHistoryData ReadLapHistory(int lapNumber, ReadOnlySpan<byte> payload)
    {
        var lapTime = BinaryPrimitives.ReadUInt32LittleEndian(payload[..sizeof(uint)]);
        return new F125LapHistoryData(
            LapNumber: lapNumber,
            LapTime: F125PacketLayout.ReadMilliseconds(lapTime),
            Sector1: F125PacketLayout.ReadSectorTime(payload, millisecondsOffset: 4, minutesOffset: 6),
            Sector2: F125PacketLayout.ReadSectorTime(payload, millisecondsOffset: 7, minutesOffset: 9),
            Sector3: F125PacketLayout.ReadSectorTime(payload, millisecondsOffset: 10, minutesOffset: 12),
            IsValid: payload[13] == 0 ? false : true);
    }

    private static F125LapHistoryData? GetLapByNumber(IReadOnlyList<F125LapHistoryData> laps, byte lapNumber)
        => lapNumber == 0 || lapNumber > laps.Count ? null : laps[lapNumber - 1];
}

internal static class F125PacketLayout
{
    public const int CarCount = 22;
    public const int CarMotionDataSize = 60;
    public const int LapDataSize = 57;
    public const int CarTelemetryDataSize = 60;
    public const int CarStatusDataSize = 55;
    public const int CarDamageDataSize = 42;
    public const int ParticipantDataSize = 57;
    public const int ParticipantNameLength = 32;
    public const int SessionWeatherForecastCountOffset = 126;
    public const int SessionWeatherForecastStartOffset = 127;
    public const int WeatherForecastSampleSize = 8;
    public const int MaxWeatherForecastSamples = 64;
    public const int SessionHistoryHeaderSize = 7;
    public const int SessionHistoryLapDataSize = 14;
    public const int MaxSessionHistoryLaps = 100;

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

    public static ReadOnlySpan<byte> CarPayload(ReadOnlySpan<byte> payload, int carDataSize, int carIndex)
        => payload.Slice(carIndex * carDataSize, carDataSize);

    public static int AvailableCarCount(ReadOnlySpan<byte> payload, int carDataSize)
        => Math.Min(CarCount, payload.Length / carDataSize);

    public static TimeSpan? ReadSectorTime(ReadOnlySpan<byte> payload, int millisecondsOffset, int minutesOffset)
    {
        var millisecondsPart = BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(millisecondsOffset, sizeof(ushort)));
        var minutesPart = payload[minutesOffset];
        var totalMilliseconds = minutesPart * 60_000 + millisecondsPart;

        return totalMilliseconds == 0
            ? null
            : TimeSpan.FromMilliseconds(totalMilliseconds);
    }

    public static TimeSpan? ReadMilliseconds(uint milliseconds)
        => milliseconds == 0 ? null : TimeSpan.FromMilliseconds(milliseconds);

    public static TimeSpan? ReadMilliseconds(ushort milliseconds)
        => milliseconds == 0 ? null : TimeSpan.FromMilliseconds(milliseconds);

    public static sbyte ReadSignedByte(byte value)
        => unchecked((sbyte)value);

    public static F125WheelTelemetry ReadUInt16WheelTelemetry(ReadOnlySpan<byte> payload, int offset)
        => new(
            RearLeft: BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(offset, sizeof(ushort))),
            RearRight: BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(offset + 2, sizeof(ushort))),
            FrontLeft: BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(offset + 4, sizeof(ushort))),
            FrontRight: BinaryPrimitives.ReadUInt16LittleEndian(payload.Slice(offset + 6, sizeof(ushort))));

    public static F125WheelTelemetry ReadByteWheelTelemetry(ReadOnlySpan<byte> payload, int offset)
        => new(
            RearLeft: payload[offset],
            RearRight: payload[offset + 1],
            FrontLeft: payload[offset + 2],
            FrontRight: payload[offset + 3]);

    public static F125WheelTelemetry ReadSingleWheelTelemetry(ReadOnlySpan<byte> payload, int offset)
        => new(
            RearLeft: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(offset, sizeof(float))),
            RearRight: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(offset + 4, sizeof(float))),
            FrontLeft: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(offset + 8, sizeof(float))),
            FrontRight: BinaryPrimitives.ReadSingleLittleEndian(payload.Slice(offset + 12, sizeof(float))));

    public static F125PacketReadFailure Truncated(byte packetId, int actualBytes, int requiredBytes)
        => new(
            F125PacketReadFailureKind.TruncatedPayload,
            $"F1 25 packet {packetId} requires {requiredBytes} payload bytes but received {actualBytes}.",
            ActualBytes: actualBytes,
            RequiredBytes: requiredBytes,
            PacketId: packetId);

    public static F125PacketReadFailure InvalidPayload(byte packetId, string message)
        => new(F125PacketReadFailureKind.InvalidPayload, message, PacketId: packetId);

    private static int PlayerCarOffset(F125PacketHeader header, int playerCarDataSize)
        => header.PlayerCarIndex * playerCarDataSize;
}
