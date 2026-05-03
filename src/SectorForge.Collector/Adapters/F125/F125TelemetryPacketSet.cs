using SectorForge.Collector.Adapters.F125.Packets;

namespace SectorForge.Collector.Adapters.F125;

public sealed record F125TelemetryPacketSet(
    F125MotionPacket Motion,
    F125LapDataPacket LapData,
    F125CarTelemetryPacket CarTelemetry,
    F125SessionPacket? Session = null,
    F125ParticipantsPacket? Participants = null,
    F125CarStatusPacket? CarStatus = null,
    F125CarDamagePacket? CarDamage = null,
    IReadOnlyDictionary<int, F125SessionHistoryPacket>? SessionHistoryByCarIndex = null);
