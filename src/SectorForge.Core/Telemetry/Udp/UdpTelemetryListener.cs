using System.Net;

namespace SectorForge.Core.Telemetry.Udp;

/// <summary>
/// Configuration for binding a UDP telemetry listener.
/// </summary>
/// <param name="BindAddress">IPv4/IPv6 address literal to bind to. Use "127.0.0.1" for loopback only or "0.0.0.0" for all interfaces.</param>
/// <param name="Port">UDP port to bind to. Use 0 to request an ephemeral port (useful for tests).</param>
/// <param name="ReceiveBufferBytes">Optional socket receive buffer size in bytes. Values &lt;= 0 leave the OS default.</param>
public sealed record UdpTelemetryListenerOptions(
    string BindAddress,
    int Port,
    int ReceiveBufferBytes = 0);

/// <summary>
/// A single UDP datagram received by an <see cref="IUdpTelemetryListener"/>.
/// The payload is owned by the receiver and is safe to retain after the iteration step completes.
/// </summary>
/// <param name="Payload">Raw UDP payload bytes. Game-specific parsing is intentionally out of scope.</param>
/// <param name="RemoteEndPoint">Remote endpoint that sent the datagram.</param>
/// <param name="ReceivedAt">UTC timestamp captured immediately after the datagram was read.</param>
public sealed record UdpTelemetryDatagram(
    ReadOnlyMemory<byte> Payload,
    IPEndPoint RemoteEndPoint,
    DateTimeOffset ReceivedAt);

/// <summary>
/// Reusable UDP receive plumbing for telemetry adapters such as F1 25 UDP.
/// Implementations bind a socket, expose the resolved local endpoint, and stream datagrams
/// until the caller cancels. No game-specific packet parsing is performed at this layer.
/// </summary>
public interface IUdpTelemetryListener : IAsyncDisposable
{
    /// <summary>
    /// The local endpoint the underlying socket is bound to. When <see cref="UdpTelemetryListenerOptions.Port"/>
    /// is 0, this exposes the ephemeral port assigned by the OS.
    /// </summary>
    IPEndPoint LocalEndPoint { get; }

    /// <summary>
    /// Streams datagrams as they arrive. Honours <paramref name="cancellationToken"/> to stop cleanly.
    /// Socket errors are surfaced to the caller (so the collector can record them in its status)
    /// rather than being swallowed.
    /// </summary>
    IAsyncEnumerable<UdpTelemetryDatagram> ReceiveAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Creates and binds <see cref="IUdpTelemetryListener"/> instances. Bind errors (for example, port in use)
/// are thrown from <see cref="Bind"/> so callers can surface them through their own status reporting.
/// </summary>
public interface IUdpTelemetryListenerFactory
{
    IUdpTelemetryListener Bind(UdpTelemetryListenerOptions options);
}
