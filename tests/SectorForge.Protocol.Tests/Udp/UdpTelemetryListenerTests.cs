using System.Net;
using System.Net.Sockets;
using SectorForge.Collector.Adapters.Udp;
using SectorForge.Core.Telemetry.Udp;

namespace SectorForge.Protocol.Tests.Udp;

public sealed class UdpTelemetryListenerTests
{
    [Fact]
    public async Task ReceivesDatagramsSentToBoundEndpoint()
    {
        await using var listener = new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("127.0.0.1", Port: 0));

        Assert.Equal(IPAddress.Loopback, listener.LocalEndPoint.Address);
        Assert.NotEqual(0, listener.LocalEndPoint.Port);

        using var sender = new UdpClient(AddressFamily.InterNetwork);
        var payload = new byte[] { 0x01, 0x02, 0x03, 0x04, 0x05 };

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var enumerator = listener.ReceiveAsync(cts.Token).GetAsyncEnumerator(cts.Token);

        try
        {
            // Send a few times to ride past any timing race between bind completion and the receive loop entering.
            var moveNextTask = enumerator.MoveNextAsync().AsTask();
            for (var attempt = 0; attempt < 5 && !moveNextTask.IsCompleted; attempt++)
            {
                await sender.SendAsync(payload, listener.LocalEndPoint);
                var winner = await Task.WhenAny(moveNextTask, Task.Delay(200, cts.Token));
                if (winner == moveNextTask)
                {
                    break;
                }
            }

            Assert.True(await moveNextTask, "Listener did not yield a datagram before the timeout.");

            var datagram = enumerator.Current;
            Assert.Equal(payload, datagram.Payload.ToArray());
            Assert.Equal(IPAddress.Loopback, datagram.RemoteEndPoint.Address);
            Assert.True(datagram.ReceivedAt <= DateTimeOffset.UtcNow);
        }
        finally
        {
            await enumerator.DisposeAsync();
        }
    }

    [Fact]
    public async Task StopsCleanlyWhenCancellationRequested()
    {
        await using var listener = new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("127.0.0.1", Port: 0));

        using var cts = new CancellationTokenSource();
        var pumpTask = Task.Run(async () =>
        {
            await foreach (var _ in listener.ReceiveAsync(cts.Token))
            {
            }
        });

        cts.CancelAfter(TimeSpan.FromMilliseconds(50));

        await pumpTask.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(pumpTask.IsCompletedSuccessfully);
    }

    [Fact]
    public void ThrowsWhenBindAddressIsInvalid()
    {
        Assert.Throws<ArgumentException>(() => new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("not-an-ip", Port: 0)));
    }

    [Fact]
    public void ThrowsWhenBindAddressIsMissing()
    {
        Assert.Throws<ArgumentException>(() => new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("   ", Port: 0)));
    }

    [Fact]
    public void ThrowsWhenPortOutOfRange()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("127.0.0.1", Port: -1)));

        Assert.Throws<ArgumentOutOfRangeException>(() => new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("127.0.0.1", Port: 70_000)));
    }

    [Fact]
    public void SurfacesBindFailureAsSocketException()
    {
        // Bind once to grab a port, then try to bind a second listener to the same port to force a conflict.
        using var holder = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var port = ((IPEndPoint)holder.Client.LocalEndPoint!).Port;

        var failure = Assert.Throws<SocketException>(() => new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("127.0.0.1", port)));

        // Don't assert specific socket error code because it can differ across Windows/Linux,
        // but it must surface so the collector can record it as LastError.
        Assert.NotEqual(0, failure.ErrorCode);
    }

    [Fact]
    public async Task FactoryReturnsBoundListener()
    {
        var factory = new UdpTelemetryListenerFactory();

        await using var listener = factory.Bind(new UdpTelemetryListenerOptions("127.0.0.1", Port: 0));

        Assert.NotNull(listener);
        Assert.NotEqual(0, listener.LocalEndPoint.Port);
    }

    [Fact]
    public async Task BindsWhenReceiveBufferOverrideIsProvided()
    {
        await using var listener = new UdpTelemetryListener(
            new UdpTelemetryListenerOptions("127.0.0.1", Port: 0, ReceiveBufferBytes: 64 * 1024));

        Assert.Equal(IPAddress.Loopback, listener.LocalEndPoint.Address);
        Assert.NotEqual(0, listener.LocalEndPoint.Port);
    }

    [Fact]
    public async Task ReceiveAsyncThrowsAfterListenerIsDisposed()
    {
        var listener = new UdpTelemetryListener(new UdpTelemetryListenerOptions("127.0.0.1", Port: 0));
        await listener.DisposeAsync();

        var enumerator = listener.ReceiveAsync(CancellationToken.None).GetAsyncEnumerator();

        try
        {
            await Assert.ThrowsAsync<ObjectDisposedException>(() => enumerator.MoveNextAsync().AsTask());
        }
        finally
        {
            await enumerator.DisposeAsync();
        }
    }

    [Fact]
    public async Task DisposeAsyncIsIdempotent()
    {
        var listener = new UdpTelemetryListener(new UdpTelemetryListenerOptions("127.0.0.1", Port: 0));

        await listener.DisposeAsync();
        await listener.DisposeAsync();
    }
}
