using SectorForge.Collector.Adapters.F125.Packets;

namespace SectorForge.Collector.Adapters.F125;

public sealed class F125PacketReader
{
    private readonly IReadOnlyDictionary<byte, IF125PacketPayloadReader> _payloadReaders;

    public F125PacketReader()
        : this(F125PacketPayloadReaders.Default)
    {
    }

    public F125PacketReader(IEnumerable<IF125PacketPayloadReader> payloadReaders)
    {
        ArgumentNullException.ThrowIfNull(payloadReaders);

        _payloadReaders = payloadReaders.ToDictionary(
            reader => reader.PacketId,
            reader => reader);
    }

    public F125PacketReadResult Read(ReadOnlySpan<byte> buffer)
    {
        var headerResult = F125PacketHeaderReader.Read(buffer);
        if (!headerResult.IsSuccess)
        {
            return F125PacketReadResult.Failed(headerResult.Failure!);
        }

        var header = headerResult.Header!;
        if (!_payloadReaders.TryGetValue(header.PacketId, out var payloadReader))
        {
            return F125PacketReadResult.Skipped(header, F125PacketSkipReason.UnsupportedPacketId);
        }

        try
        {
            var payloadResult = payloadReader.Read(header, buffer[F125PacketHeader.Size..]);
            if (!payloadResult.IsSuccess)
            {
                return F125PacketReadResult.Failed(header, payloadResult.Failure!);
            }

            return F125PacketReadResult.Parsed(payloadResult.Packet!);
        }
        catch (Exception ex)
        {
            return F125PacketReadResult.Failed(
                header,
                new F125PacketReadFailure(
                    F125PacketReadFailureKind.PacketReaderFailure,
                    $"Packet reader for ID {header.PacketId} failed: {ex.Message}",
                    PacketId: header.PacketId));
        }
    }
}
