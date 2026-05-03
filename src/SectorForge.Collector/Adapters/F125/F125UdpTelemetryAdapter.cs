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
        F125MotionPacket? latestMotion = null;
        F125LapDataPacket? latestLapData = null;
        F125CarTelemetryPacket? latestCarTelemetry = null;
        ulong? currentSessionUid = null;

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
            if (currentSessionUid is not null && packet.Header.SessionUid != currentSessionUid.Value)
            {
                latestMotion = null;
                latestLapData = null;
                latestCarTelemetry = null;
            }

            currentSessionUid = packet.Header.SessionUid;

            switch (packet)
            {
                case F125MotionPacket motion:
                    latestMotion = motion;
                    break;
                case F125LapDataPacket lapData:
                    latestLapData = lapData;
                    break;
                case F125CarTelemetryPacket carTelemetry:
                    latestCarTelemetry = carTelemetry;
                    break;
            }

            if (packet is F125CarTelemetryPacket
                && latestMotion is not null
                && latestLapData is not null
                && latestCarTelemetry is not null)
            {
                yield return _normalizer.Normalize(latestMotion, latestLapData, latestCarTelemetry);
            }
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
