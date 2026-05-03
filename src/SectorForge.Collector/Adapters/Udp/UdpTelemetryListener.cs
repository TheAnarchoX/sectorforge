using System.Net;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using SectorForge.Core.Telemetry.Udp;

namespace SectorForge.Collector.Adapters.Udp;

/// <summary>
/// Default <see cref="IUdpTelemetryListener"/> implementation backed by <see cref="UdpClient"/>.
/// Game-specific parsing intentionally lives in adapter code, not here.
/// </summary>
public sealed class UdpTelemetryListener : IUdpTelemetryListener
{
    private readonly UdpClient _client;
    private bool _disposed;

    public UdpTelemetryListener(UdpTelemetryListenerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        if (options.Port < 0 || options.Port > 65535)
        {
            throw new ArgumentOutOfRangeException(
                nameof(options),
                options.Port,
                "UDP port must be between 0 and 65535.");
        }

        if (string.IsNullOrWhiteSpace(options.BindAddress))
        {
            throw new ArgumentException("Bind address must be provided.", nameof(options));
        }

        if (!IPAddress.TryParse(options.BindAddress, out var address))
        {
            throw new ArgumentException(
                $"Bind address '{options.BindAddress}' is not a valid IP literal.",
                nameof(options));
        }

        _client = new UdpClient(new IPEndPoint(address, options.Port));

        if (options.ReceiveBufferBytes > 0)
        {
            _client.Client.ReceiveBufferSize = options.ReceiveBufferBytes;
        }

        LocalEndPoint = (IPEndPoint)_client.Client.LocalEndPoint!;
    }

    public IPEndPoint LocalEndPoint { get; }

    public async IAsyncEnumerable<UdpTelemetryDatagram> ReceiveAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        while (!cancellationToken.IsCancellationRequested)
        {
            UdpReceiveResult result;
            try
            {
                result = await _client.ReceiveAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                yield break;
            }
            catch (SocketException ex) when (ex.SocketErrorCode == SocketError.OperationAborted)
            {
                yield break;
            }

            yield return new UdpTelemetryDatagram(
                result.Buffer,
                result.RemoteEndPoint,
                DateTimeOffset.UtcNow);
        }
    }

    public ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return ValueTask.CompletedTask;
        }

        _disposed = true;
        _client.Dispose();
        return ValueTask.CompletedTask;
    }
}

/// <summary>
/// Default factory that binds a real UDP socket per call.
/// </summary>
public sealed class UdpTelemetryListenerFactory : IUdpTelemetryListenerFactory
{
    public IUdpTelemetryListener Bind(UdpTelemetryListenerOptions options)
        => new UdpTelemetryListener(options);
}
