using System.Buffers.Binary;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.F125.Packets;
using SectorForge.Core.Telemetry;

namespace SectorForge.Protocol.Tests;

public sealed class CollectorProgramTests
{
    [Fact]
    public void CreateHostRegistersConfigGatedAdaptersAndWorker()
    {
        using var host = CollectorProgram.CreateHost([]);

        var adapter = host.Services.GetRequiredService<FakeTelemetryAdapter>();
        var adapters = host.Services.GetServices<ITelemetryAdapter>().ToArray();
        var hostedServices = host.Services.GetServices<IHostedService>();

        Assert.NotNull(adapter);
        Assert.Contains(adapters, service => service.Source.AdapterId == "fake");
        var f125Adapter = Assert.Single(adapters, service => service.Source.AdapterId == F125UdpTelemetryAdapter.AdapterId);
        Assert.Equal(TelemetrySourceStatus.Offline, f125Adapter.Source.Status);
        Assert.Contains(hostedServices, service => service is Worker);
    }

    [Fact]
    public void CreateHostResolvesF125PacketReaderWithDefaultPayloadReaders()
    {
        using var host = CollectorProgram.CreateHost([]);

        var reader = host.Services.GetRequiredService<F125PacketReader>();
        var result = reader.Read(BuildMotionPacket());

        Assert.Equal(F125PacketReadStatus.Parsed, result.Status);
        Assert.IsType<F125MotionPacket>(result.Packet);
    }

    private static byte[] BuildMotionPacket()
    {
        const int carCount = 22;
        const int motionDataSize = 60;
        var payload = new byte[carCount * motionDataSize];
        var buffer = new byte[F125PacketHeader.Size + payload.Length];
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(0, sizeof(ushort)), F125PacketHeader.ExpectedPacketFormat);
        buffer[2] = 25;
        buffer[3] = 1;
        buffer[4] = 18;
        buffer[5] = 1;
        buffer[6] = F125PacketIds.Motion;
        BinaryPrimitives.WriteUInt64LittleEndian(buffer.AsSpan(7, sizeof(ulong)), 0x0102_0304_0506_0708UL);
        BinaryPrimitives.WriteSingleLittleEndian(buffer.AsSpan(15, sizeof(float)), 42.5f);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(19, sizeof(uint)), 1234);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(23, sizeof(uint)), 5678);
        buffer[27] = 4;
        buffer[28] = 255;
        payload.CopyTo(buffer.AsSpan(F125PacketHeader.Size));
        return buffer;
    }
}
