using System.Buffers.Binary;
using System.Globalization;
using SectorForge.Collector.Adapters.F125.Packets;
using SectorForge.Core.Telemetry;

namespace SectorForge.Collector.Adapters.F125;

public sealed class F125Normalizer
{
    private const string AdapterId = "f1-25-udp";
    private const string DisplayName = "F1 25 UDP";
    private const string InputKind = "UDP packets";

    public TelemetrySample Normalize(
        F125MotionPacket motion,
        F125LapDataPacket lapData,
        F125CarTelemetryPacket carTelemetry)
        => Normalize(new F125TelemetryPacketSet(motion, lapData, carTelemetry));

    public TelemetrySample Normalize(F125TelemetryPacketSet packets)
    {
        ArgumentNullException.ThrowIfNull(packets);

        var motion = packets.Motion;
        var lapData = packets.LapData;
        var carTelemetry = packets.CarTelemetry;
        var carStatus = packets.CarStatus?.PlayerCar;
        var carDamage = packets.CarDamage?.PlayerCar;
        var session = packets.Session?.Session;

        ArgumentNullException.ThrowIfNull(motion);
        ArgumentNullException.ThrowIfNull(lapData);
        ArgumentNullException.ThrowIfNull(carTelemetry);

        var header = carTelemetry.Header;
        var sessionId = CreateSessionId(header.SessionUid);
        var sessionElapsed = TimeSpan.FromSeconds(header.SessionTime);
        var timestamp = DateTimeOffset.UnixEpoch + sessionElapsed;
        var playerCarIndex = header.PlayerCarIndex;
        F125SessionHistoryPacket? playerHistoryPacket = null;
        packets.SessionHistoryByCarIndex?.TryGetValue(playerCarIndex, out playerHistoryPacket);
        var playerHistory = playerHistoryPacket?.History;

        return new TelemetrySample(
            SessionId: sessionId,
            Sequence: header.OverallFrameIdentifier,
            Timestamp: timestamp,
            Source: new TelemetrySource(
                AdapterId: AdapterId,
                Game: GameId.F125,
                DisplayName: DisplayName,
                InputKind: InputKind,
                IsSimulated: false,
                Status: TelemetrySourceStatus.Running),
            Session: new SessionState(
                Id: sessionId,
                Name: null,
                SessionType: null,
                StartedAt: timestamp - sessionElapsed,
                IsActive: true),
            Lap: new LapState(
                LapNumber: lapData.PlayerCar.LapNumber,
                CurrentLapTime: lapData.PlayerCar.CurrentLapTime,
                LastLapTime: lapData.PlayerCar.LastLapTime,
                BestLapTime: playerHistory?.BestLapTime ?? lapData.PlayerCar.BestLapTime,
                SectorIndex: lapData.PlayerCar.SectorIndex,
                LapDistanceMeters: lapData.PlayerCar.LapDistanceMeters,
                Sector1Time: lapData.PlayerCar.Sector1Time,
                Sector2Time: lapData.PlayerCar.Sector2Time,
                LastSector1Time: playerHistory?.LastCompletedLap?.Sector1,
                LastSector2Time: playerHistory?.LastCompletedLap?.Sector2,
                LastSector3Time: playerHistory?.LastCompletedLap?.Sector3,
                IsValid: lapData.PlayerCar.IsValid,
                TotalDistanceMeters: lapData.PlayerCar.TotalDistanceMeters,
                PitStatus: MapPitStatus(lapData.PlayerCar.PitStatusCode),
                PitStopCount: lapData.PlayerCar.PitStopCount,
                PenaltiesSeconds: lapData.PlayerCar.PenaltiesSeconds,
                WarningsCount: lapData.PlayerCar.WarningsCount,
                CornersCut: lapData.PlayerCar.CornersCut),
            Vehicle: new VehicleState(
                CarName: null,
                SpeedKph: carTelemetry.PlayerCar.SpeedKph,
                Rpm: carTelemetry.PlayerCar.Rpm,
                Gear: carTelemetry.PlayerCar.Gear,
                EngineTemperatureC: carTelemetry.PlayerCar.EngineTemperatureC,
                LateralG: motion.PlayerCar.LateralG,
                LongitudinalG: motion.PlayerCar.LongitudinalG,
                VerticalG: motion.PlayerCar.VerticalG,
                WorldPositionX: motion.PlayerCar.WorldPositionX,
                WorldPositionY: motion.PlayerCar.WorldPositionY,
                WorldPositionZ: motion.PlayerCar.WorldPositionZ,
                Yaw: motion.PlayerCar.Yaw,
                Pitch: motion.PlayerCar.Pitch,
                Roll: motion.PlayerCar.Roll),
            Tyres: new TyreState(
                FrontLeft: null,
                FrontRight: null,
                RearLeft: null,
                RearRight: null,
                Compound: carStatus is null
                    ? null
                    : MapTyreCompound(carStatus.VisualTyreCompoundCode, carStatus.ActualTyreCompoundCode),
                AgeLaps: carStatus?.TyreAgeLaps,
                FrontLeftWear: carDamage is null ? null : new WheelWearState(carDamage.FrontLeftTyreWearPercent),
                FrontRightWear: carDamage is null ? null : new WheelWearState(carDamage.FrontRightTyreWearPercent),
                RearLeftWear: carDamage is null ? null : new WheelWearState(carDamage.RearLeftTyreWearPercent),
                RearRightWear: carDamage is null ? null : new WheelWearState(carDamage.RearRightTyreWearPercent)),
            Brakes: new BrakeState(
                FrontLeftTemperatureC: null,
                FrontRightTemperatureC: null,
                RearLeftTemperatureC: null,
                RearRightTemperatureC: null),
            Fuel: new FuelState(
                RemainingLiters: carStatus?.FuelInTankLiters,
                CapacityLiters: carStatus?.FuelCapacityLiters,
                LitersPerLapEstimate: EstimateLitersPerLap(carStatus),
                LapsRemainingEstimate: EstimateLapsRemaining(carStatus)),
            Track: new TrackState(
                TrackName: null,
                TrackTemperatureC: session?.TrackTemperatureC,
                AirTemperatureC: session?.AirTemperatureC,
                Weather: null,
                TrackId: session?.TrackId.ToString(CultureInfo.InvariantCulture),
                TrackLengthMeters: session?.TrackLengthMeters,
                RainPercent: CurrentRainPercent(session),
                WeatherEnum: session is null ? null : MapWeather(session.WeatherCode),
                SafetyCarStatus: session is null ? null : MapSafetyCarStatus(session.SafetyCarStatusCode),
                FormationLap: session is null ? null : session.SafetyCarStatusCode == 3),
            DriverInput: new DriverInputState(
                Throttle: carTelemetry.PlayerCar.Throttle,
                Brake: carTelemetry.PlayerCar.Brake,
                Steering: carTelemetry.PlayerCar.Steering,
                Clutch: carTelemetry.PlayerCar.Clutch,
                DrsAllowed: carStatus?.DrsAllowed,
                DrsActive: carTelemetry.PlayerCar.DrsActive,
                PitLimiterActive: carStatus?.PitLimiterActive,
                AbsActive: carStatus?.AbsActive,
                TcActive: carStatus?.TcActive),
            Timing: new TimingState(
                SessionElapsed: sessionElapsed,
                SessionRemaining: session?.SessionTimeLeft,
                DeltaToBestLap: null,
                SectorDelta: null,
                SessionTimeLeft: session?.SessionTimeLeft,
                SessionDuration: session?.SessionDuration),
            Participants: BuildParticipants(packets, playerCarIndex),
            Damage: BuildDamage(carDamage),
            PowerUnit: BuildPowerUnit(carStatus),
            WeatherForecast: BuildWeatherForecast(session));
    }

    private Guid CreateSessionId(ulong sessionUid)
    {
        Span<byte> bytes = stackalloc byte[16];
        bytes.Clear();
        BinaryPrimitives.WriteUInt64LittleEndian(bytes, sessionUid);
        return new Guid(bytes);
    }

    private static PitStatus MapPitStatus(byte value)
        => value switch
        {
            0 => PitStatus.None,
            1 => PitStatus.Pitting,
            2 => PitStatus.InPitArea,
            _ => PitStatus.Unknown
        };

    private static DamageState? BuildDamage(F125CarDamageData? carDamage)
        => carDamage is null
            ? null
            : new DamageState(
                FrontLeftWingPercent: carDamage.FrontLeftWingDamagePercent,
                FrontRightWingPercent: carDamage.FrontRightWingDamagePercent,
                RearWingPercent: carDamage.RearWingDamagePercent,
                FloorPercent: carDamage.FloorDamagePercent,
                DiffuserPercent: carDamage.DiffuserDamagePercent,
                SidepodPercent: carDamage.SidepodDamagePercent,
                GearboxPercent: carDamage.GearboxDamagePercent,
                EnginePercent: carDamage.EngineDamagePercent,
                FrontLeftTyreDamage: new WheelDamageState(carDamage.FrontLeftTyreDamagePercent),
                FrontRightTyreDamage: new WheelDamageState(carDamage.FrontRightTyreDamagePercent),
                RearLeftTyreDamage: new WheelDamageState(carDamage.RearLeftTyreDamagePercent),
                RearRightTyreDamage: new WheelDamageState(carDamage.RearRightTyreDamagePercent),
                FrontLeftBrakeDamage: new WheelDamageState(carDamage.FrontLeftBrakeDamagePercent),
                FrontRightBrakeDamage: new WheelDamageState(carDamage.FrontRightBrakeDamagePercent),
                RearLeftBrakeDamage: new WheelDamageState(carDamage.RearLeftBrakeDamagePercent),
                RearRightBrakeDamage: new WheelDamageState(carDamage.RearRightBrakeDamagePercent));

    private static PowerUnitState? BuildPowerUnit(F125CarStatusData? carStatus)
        => carStatus is null
            ? null
            : new PowerUnitState(
                ErsStoreJoules: carStatus.ErsStoreJoules,
                ErsDeployedThisLapJoules: carStatus.ErsDeployedThisLapJoules,
                ErsHarvestedThisLapMguk: carStatus.ErsHarvestedThisLapMguk,
                ErsHarvestedThisLapMguh: carStatus.ErsHarvestedThisLapMguh,
                ErsDeployMode: MapErsDeployMode(carStatus.ErsDeployModeCode));

    private static WeatherForecastState? BuildWeatherForecast(F125SessionData? session)
        => session is null || session.ForecastSamples.Count == 0
            ? null
            : new WeatherForecastState(session.ForecastSamples
                .Select(sample => new WeatherForecastSample(
                    MinutesAhead: sample.MinutesAhead,
                    Weather: MapWeather(sample.WeatherCode),
                    RainPercent: sample.RainPercent,
                    TrackTemperatureC: sample.TrackTemperatureC,
                    AirTemperatureC: sample.AirTemperatureC))
                .ToArray());

    private static IReadOnlyList<ParticipantState>? BuildParticipants(F125TelemetryPacketSet packets, int playerCarIndex)
    {
        var participantsByIndex = packets.Participants?.Participants.ToDictionary(participant => participant.CarIndex)
            ?? new Dictionary<int, F125ParticipantData>();
        var historiesByIndex = packets.SessionHistoryByCarIndex ?? new Dictionary<int, F125SessionHistoryPacket>();
        if (participantsByIndex.Count == 0 && historiesByIndex.Count == 0)
        {
            return null;
        }

        var statusByIndex = packets.CarStatus?.Cars.ToDictionary(status => status.CarIndex)
            ?? new Dictionary<int, F125CarStatusData>();
        var participants = new List<ParticipantState>();
        foreach (var carLap in packets.LapData.Cars)
        {
            participantsByIndex.TryGetValue(carLap.CarIndex, out var participant);
            historiesByIndex.TryGetValue(carLap.CarIndex, out var historyPacket);
            statusByIndex.TryGetValue(carLap.CarIndex, out var carStatus);

            if (participant is null && historyPacket is null)
            {
                continue;
            }

            var isPlayer = carLap.CarIndex == playerCarIndex;
            participants.Add(new ParticipantState(
                DriverName: DisplayDriverName(participant, carLap.CarIndex),
                TeamName: DisplayTeamName(participant),
                CarName: null,
                Position: carLap.Position > 0 ? carLap.Position : carLap.CarIndex + 1,
                IsPlayer: isPlayer,
                IsInPit: MapPitStatus(carLap.PitStatusCode) is PitStatus.Pitting or PitStatus.InPitArea,
                LapNumber: carLap.LapNumber,
                CurrentLapTime: carLap.CurrentLapTime,
                LastLapTime: carLap.LastLapTime,
                BestLapTime: historyPacket?.History.BestLapTime ?? carLap.BestLapTime,
                GapToLeader: carLap.DeltaToRaceLeader,
                IntervalToAhead: carLap.DeltaToCarInFront,
                Sector1: carLap.Sector1Time,
                Sector2: carLap.Sector2Time,
                BestSector1: historyPacket?.History.BestSector1,
                BestSector2: historyPacket?.History.BestSector2,
                BestSector3: historyPacket?.History.BestSector3,
                TyreCompound: carStatus is null
                    ? null
                    : MapTyreCompound(carStatus.VisualTyreCompoundCode, carStatus.ActualTyreCompoundCode),
                PitStopCount: carLap.PitStopCount,
                ResultStatus: MapResultStatus(carLap.ResultStatusCode),
                GridPosition: carLap.GridPosition == 0 ? null : carLap.GridPosition,
                DriverNumber: participant?.DriverNumber,
                IsAi: participant?.IsAi));
        }

        return participants.Count == 0 ? null : participants;
    }

    private static string DisplayDriverName(F125ParticipantData? participant, int carIndex)
    {
        if (!string.IsNullOrWhiteSpace(participant?.DriverName))
        {
            return participant.DriverName;
        }

        return participant?.DriverNumber > 0
            ? $"Driver {participant.DriverNumber.ToString(CultureInfo.InvariantCulture)}"
            : $"Car {(carIndex + 1).ToString(CultureInfo.InvariantCulture)}";
    }

    private static string? DisplayTeamName(F125ParticipantData? participant)
        => participant is null ? null : $"Team {participant.TeamId.ToString(CultureInfo.InvariantCulture)}";

    private static double? CurrentRainPercent(F125SessionData? session)
        => session?.ForecastSamples.FirstOrDefault(sample => sample.MinutesAhead == 0)?.RainPercent
            ?? session?.ForecastSamples.FirstOrDefault()?.RainPercent;

    private static double? EstimateLitersPerLap(F125CarStatusData? carStatus)
        => carStatus is not null && carStatus.FuelRemainingLaps > 0
            ? carStatus.FuelInTankLiters / carStatus.FuelRemainingLaps
            : null;

    private static int? EstimateLapsRemaining(F125CarStatusData? carStatus)
        => carStatus is not null && carStatus.FuelRemainingLaps >= 0
            ? (int)Math.Floor(carStatus.FuelRemainingLaps)
            : null;

    private static TyreCompound MapTyreCompound(byte visualCompoundCode, byte actualCompoundCode)
    {
        var visualCompound = MapTyreCompoundCode(visualCompoundCode);
        return visualCompound == TyreCompound.Unknown
            ? MapTyreCompoundCode(actualCompoundCode)
            : visualCompound;
    }

    private static TyreCompound MapTyreCompoundCode(byte value)
        => value switch
        {
            7 => TyreCompound.Intermediate,
            8 => TyreCompound.Wet,
            16 => TyreCompound.Soft,
            17 => TyreCompound.Medium,
            18 => TyreCompound.Hard,
            _ => TyreCompound.Unknown
        };

    private static ErsDeployMode MapErsDeployMode(byte value)
        => value switch
        {
            0 => ErsDeployMode.None,
            1 => ErsDeployMode.Medium,
            2 => ErsDeployMode.Hotlap,
            3 => ErsDeployMode.Overtake,
            _ => ErsDeployMode.Unknown
        };

    private static WeatherKind MapWeather(byte value)
        => value switch
        {
            0 => WeatherKind.Clear,
            1 => WeatherKind.LightCloud,
            2 => WeatherKind.Overcast,
            3 => WeatherKind.LightRain,
            4 => WeatherKind.HeavyRain,
            5 => WeatherKind.Storm,
            _ => WeatherKind.Unknown
        };

    private static SafetyCarStatus MapSafetyCarStatus(byte value)
        => value switch
        {
            0 => SafetyCarStatus.None,
            1 => SafetyCarStatus.Full,
            2 => SafetyCarStatus.Virtual,
            _ => SafetyCarStatus.Unknown
        };

    private static ResultStatus MapResultStatus(byte value)
        => value switch
        {
            2 => ResultStatus.Active,
            3 => ResultStatus.Finished,
            4 => ResultStatus.Retired,
            5 => ResultStatus.Disqualified,
            6 => ResultStatus.NotClassified,
            7 => ResultStatus.Retired,
            _ => ResultStatus.Unknown
        };
}
