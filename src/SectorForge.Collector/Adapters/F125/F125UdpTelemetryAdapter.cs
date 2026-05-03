using System.Runtime.CompilerServices;
using Microsoft.Extensions.Options;
using SectorForge.Collector.Adapters.F125.Packets;
using SectorForge.Core.Telemetry;
using SectorForge.Core.Telemetry.Configuration;
using SectorForge.Core.Telemetry.Udp;

namespace SectorForge.Collector.Adapters.F125;

public sealed class F125UdpTelemetryAdapter : ITelemetryAdapter
{
    public const string AdapterId = "f1-25-udp";
    public const int DefaultPort = 20777;

    private readonly TelemetryAdapterOptions _options;
    private readonly IUdpTelemetryListenerFactory _listenerFactory;
    private readonly F125PacketReader _packetReader;
    private readonly F125Normalizer _normalizer;

    public F125UdpTelemetryAdapter(
        IOptions<TelemetryAdaptersOptions> adaptersOptions,
        IUdpTelemetryListenerFactory listenerFactory,
        F125PacketReader packetReader,
        F125Normalizer normalizer)
        : this(
            adaptersOptions?.Value.For(AdapterId) ?? throw new ArgumentNullException(nameof(adaptersOptions)),
            listenerFactory,
            packetReader,
            normalizer)
    {
    }

    public F125UdpTelemetryAdapter(
        TelemetryAdapterOptions options,
        IUdpTelemetryListenerFactory listenerFactory,
        F125PacketReader? packetReader = null,
        F125Normalizer? normalizer = null)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _listenerFactory = listenerFactory ?? throw new ArgumentNullException(nameof(listenerFactory));
        _packetReader = packetReader ?? new F125PacketReader();
        _normalizer = normalizer ?? new F125Normalizer();
        Source = CreateSource(_options);
    }

    public TelemetrySource Source { get; }

    public async IAsyncEnumerable<TelemetrySample> RunAsync([EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            throw new InvalidOperationException("F1 25 UDP adapter is disabled. Enable Adapters:f1-25-udp:Enabled before selecting it.");
        }

        await using var listener = _listenerFactory.Bind(CreateListenerOptions(_options));
        F125PacketAccumulator? accumulator = null;

        await foreach (var datagram in listener.ReceiveAsync(cancellationToken))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var readResult = _packetReader.Read(datagram.Payload.Span);
            if (readResult.Status == F125PacketReadStatus.Skipped)
            {
                continue;
            }

            if (readResult.Status == F125PacketReadStatus.Failed)
            {
                throw CreateParseException(readResult);
            }

            var packet = readResult.Packet!;
            if (accumulator is null || accumulator.SessionUid != packet.Header.SessionUid)
            {
                accumulator = new F125PacketAccumulator(packet.Header.SessionUid);
            }

            var packetSet = accumulator.Apply(packet);
            if (packet is F125CarTelemetryPacket && packetSet is not null)
            {
                yield return _normalizer.Normalize(packetSet);
            }
        }
    }

    private sealed class F125PacketAccumulator(ulong sessionUid)
    {
        private readonly Dictionary<int, F125SessionHistoryPacket> _sessionHistoryByCarIndex = [];

        public ulong SessionUid { get; } = sessionUid;

        private F125MotionPacket? LatestMotion { get; set; }

        private F125SessionPacket? LatestSession { get; set; }

        private F125LapDataPacket? LatestLapData { get; set; }

        private F125ParticipantsPacket? LatestParticipants { get; set; }

        private F125CarTelemetryPacket? LatestCarTelemetry { get; set; }

        private F125CarStatusPacket? LatestCarStatus { get; set; }

        private F125CarDamagePacket? LatestCarDamage { get; set; }

        public F125TelemetryPacketSet? Apply(F125Packet packet)
        {
            switch (packet)
            {
                case F125MotionPacket motion:
                    LatestMotion = motion;
                    break;
                case F125SessionPacket session:
                    LatestSession = session;
                    break;
                case F125LapDataPacket lapData:
                    LatestLapData = lapData;
                    break;
                case F125ParticipantsPacket participants:
                    LatestParticipants = participants;
                    break;
                case F125CarTelemetryPacket carTelemetry:
                    LatestCarTelemetry = carTelemetry;
                    break;
                case F125CarStatusPacket carStatus:
                    LatestCarStatus = carStatus;
                    break;
                case F125CarDamagePacket carDamage:
                    LatestCarDamage = carDamage;
                    break;
                case F125SessionHistoryPacket sessionHistory:
                    _sessionHistoryByCarIndex[sessionHistory.History.CarIndex] = sessionHistory;
                    break;
            }

            return LatestMotion is not null
                && LatestLapData is not null
                && LatestCarTelemetry is not null
                ? new F125TelemetryPacketSet(
                    LatestMotion,
                    LatestLapData,
                    LatestCarTelemetry,
                    LatestSession,
                    LatestParticipants,
                    LatestCarStatus,
                    LatestCarDamage,
                    new Dictionary<int, F125SessionHistoryPacket>(_sessionHistoryByCarIndex))
                : null;
        }
    }

    private static UdpTelemetryListenerOptions CreateListenerOptions(TelemetryAdapterOptions options)
    {
        var bindAddress = string.IsNullOrWhiteSpace(options.BindAddress)
            ? TelemetryAdapterOptions.DefaultBindAddress
            : options.BindAddress;

        return new UdpTelemetryListenerOptions(
            bindAddress,
            options.Port ?? DefaultPort,
            Math.Max(0, options.ReceiveBufferBytes.GetValueOrDefault()));
    }

    private static TelemetrySource CreateSource(TelemetryAdapterOptions options)
    {
        var listenerOptions = CreateListenerOptions(options);
        return new TelemetrySource(
            AdapterId: AdapterId,
            Game: GameId.F125,
            DisplayName: "F1 25 UDP",
            InputKind: "UDP packets",
            IsSimulated: false,
            Status: options.Enabled ? TelemetrySourceStatus.Available : TelemetrySourceStatus.Offline,
            Notes: options.Enabled
                ? $"Listens on {listenerOptions.BindAddress}:{listenerOptions.Port} for the config-gated player-car UDP slice."
                : "Disabled by default; enable Adapters:f1-25-udp before selecting this adapter.");
    }

    private static InvalidOperationException CreateParseException(F125PacketReadResult readResult)
    {
        return readResult.Failure is null
            ? new InvalidOperationException("F1 25 UDP packet failed to parse.")
            : new InvalidOperationException($"F1 25 UDP packet failed to parse: {readResult.Failure.Message}");
    }
}
