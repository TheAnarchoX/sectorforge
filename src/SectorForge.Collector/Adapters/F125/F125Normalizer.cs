using System.Buffers.Binary;
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
    {
        ArgumentNullException.ThrowIfNull(motion);
        ArgumentNullException.ThrowIfNull(lapData);
        ArgumentNullException.ThrowIfNull(carTelemetry);

        var header = carTelemetry.Header;
        var sessionId = CreateSessionId(header.SessionUid);
        var sessionElapsed = TimeSpan.FromSeconds(header.SessionTime);
        var timestamp = DateTimeOffset.UnixEpoch + sessionElapsed;

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
                BestLapTime: lapData.PlayerCar.BestLapTime,
                SectorIndex: lapData.PlayerCar.SectorIndex,
                LapDistanceMeters: lapData.PlayerCar.LapDistanceMeters),
            Vehicle: new VehicleState(
                CarName: null,
                SpeedKph: carTelemetry.PlayerCar.SpeedKph,
                Rpm: carTelemetry.PlayerCar.Rpm,
                Gear: carTelemetry.PlayerCar.Gear,
                EngineTemperatureC: null),
            Tyres: new TyreState(
                FrontLeft: null,
                FrontRight: null,
                RearLeft: null,
                RearRight: null),
            Brakes: new BrakeState(
                FrontLeftTemperatureC: null,
                FrontRightTemperatureC: null,
                RearLeftTemperatureC: null,
                RearRightTemperatureC: null),
            Fuel: new FuelState(
                RemainingLiters: null,
                CapacityLiters: null,
                LitersPerLapEstimate: null,
                LapsRemainingEstimate: null),
            Track: new TrackState(
                TrackName: null,
                TrackTemperatureC: null,
                AirTemperatureC: null,
                Weather: null),
            DriverInput: new DriverInputState(
                Throttle: carTelemetry.PlayerCar.Throttle,
                Brake: carTelemetry.PlayerCar.Brake,
                Steering: carTelemetry.PlayerCar.Steering,
                Clutch: carTelemetry.PlayerCar.Clutch),
            Timing: new TimingState(
                SessionElapsed: sessionElapsed,
                SessionRemaining: null,
                DeltaToBestLap: null,
                SectorDelta: null),
            Participants: null);
    }

    private Guid CreateSessionId(ulong sessionUid)
    {
        Span<byte> bytes = stackalloc byte[16];
        bytes.Clear();
        BinaryPrimitives.WriteUInt64LittleEndian(bytes, sessionUid);
        return new Guid(bytes);
    }
}
