using System.Buffers.Binary;
using System.Net;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Options;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.F125.Packets;
using SectorForge.Core.Telemetry;
using SectorForge.Core.Telemetry.Configuration;
using SectorForge.Core.Telemetry.Udp;

namespace SectorForge.Protocol.Tests.F125;

public sealed class F125UdpTelemetryAdapterTests
{
    private const int CarCount = 22;
    private const int MotionDataSize = 60;
    private const int LapDataSize = 57;
    private const int CarTelemetryDataSize = 60;
    private const int CarStatusDataSize = 55;
    private const int CarDamageDataSize = 42;

    [Fact]
    public async Task EnabledAdapterBindsConfiguredListenerAndPublishesNormalizedSamples()
    {
        var playerCarIndex = (byte)4;
        var listener = new TestUdpTelemetryListener(
            [
                BuildPacket(F125PacketIds.Motion, playerCarIndex, BuildMotionPayload(playerCarIndex)),
                BuildPacket(F125PacketIds.LapData, playerCarIndex, BuildLapDataPayload(playerCarIndex)),
                BuildPacket(F125PacketIds.CarTelemetry, playerCarIndex, BuildCarTelemetryPayload(playerCarIndex))
            ]);
        var listenerFactory = new RecordingUdpTelemetryListenerFactory(listener);
        var adapterOptions = Options.Create(new TelemetryAdaptersOptions
        {
            Items =
            {
                [F125UdpTelemetryAdapter.AdapterId] = new TelemetryAdapterOptions
                {
                    Enabled = true,
                    BindAddress = "0.0.0.0",
                    Port = 0,
                    ReceiveBufferBytes = 65_536
                }
            }
        });
        var adapter = new F125UdpTelemetryAdapter(
            adapterOptions,
            listenerFactory,
            new F125PacketReader(),
            new F125Normalizer());
        var samples = new List<TelemetrySample>();

        await foreach (var sample in adapter.RunAsync(CancellationToken.None))
        {
            samples.Add(sample);
        }

        var publishedSample = Assert.Single(samples);
        Assert.Equal(TelemetrySourceStatus.Available, adapter.Source.Status);
        Assert.Equal("0.0.0.0", listenerFactory.BoundOptions?.BindAddress);
        Assert.Equal(0, listenerFactory.BoundOptions?.Port);
        Assert.Equal(65_536, listenerFactory.BoundOptions?.ReceiveBufferBytes);
        Assert.Equal(GameId.F125, publishedSample.Source.Game);
        Assert.Equal(F125UdpTelemetryAdapter.AdapterId, publishedSample.Source.AdapterId);
        Assert.Equal(213, publishedSample.Vehicle.SpeedKph.GetValueOrDefault(), precision: 3);
        Assert.Equal(11_250, publishedSample.Vehicle.Rpm.GetValueOrDefault(), precision: 3);
        Assert.Equal(7, publishedSample.Lap.LapNumber);
        Assert.Equal(TimeSpan.FromMilliseconds(12_345), publishedSample.Lap.CurrentLapTime);
        Assert.Null(publishedSample.PowerUnit);
        Assert.Null(publishedSample.Damage);
    }

    [Fact]
    public async Task OptionalStatusCanArriveAfterFirstPublishedSample()
    {
        var playerCarIndex = (byte)4;
        var listener = new TestUdpTelemetryListener(
            [
                BuildPacket(F125PacketIds.Motion, playerCarIndex, BuildMotionPayload(playerCarIndex)),
                BuildPacket(F125PacketIds.LapData, playerCarIndex, BuildLapDataPayload(playerCarIndex)),
                BuildPacket(F125PacketIds.CarTelemetry, playerCarIndex, BuildCarTelemetryPayload(playerCarIndex)),
                BuildPacket(F125PacketIds.CarStatus, playerCarIndex, BuildCarStatusPayload(playerCarIndex)),
                BuildPacket(F125PacketIds.CarTelemetry, playerCarIndex, BuildCarTelemetryPayload(playerCarIndex))
            ]);
        var adapter = CreateEnabledAdapter(listener);
        var samples = new List<TelemetrySample>();

        await foreach (var sample in adapter.RunAsync(CancellationToken.None))
        {
            samples.Add(sample);
        }

        Assert.Equal(2, samples.Count);
        Assert.Null(samples[0].PowerUnit);
        Assert.Null(samples[0].DriverInput.DrsAllowed);
        Assert.NotNull(samples[1].PowerUnit);
        Assert.Equal(ErsDeployMode.Overtake, samples[1].PowerUnit?.ErsDeployMode);
        Assert.True(samples[1].DriverInput.DrsAllowed);
        Assert.Equal(TyreCompound.Medium, samples[1].Tyres.Compound);
    }

    [Fact]
    public async Task SessionUidChangeClearsCachedOptionalPackets()
    {
        var playerCarIndex = (byte)4;
        var firstSessionUid = 0x0102_0304_0506_0708UL;
        var secondSessionUid = 0x1112_1314_1516_1718UL;
        var listener = new TestUdpTelemetryListener(
            [
                BuildPacket(F125PacketIds.CarStatus, playerCarIndex, BuildCarStatusPayload(playerCarIndex), firstSessionUid),
                BuildPacket(F125PacketIds.CarDamage, playerCarIndex, BuildCarDamagePayload(playerCarIndex), firstSessionUid),
                BuildPacket(F125PacketIds.Motion, playerCarIndex, BuildMotionPayload(playerCarIndex), firstSessionUid),
                BuildPacket(F125PacketIds.LapData, playerCarIndex, BuildLapDataPayload(playerCarIndex), firstSessionUid),
                BuildPacket(F125PacketIds.CarTelemetry, playerCarIndex, BuildCarTelemetryPayload(playerCarIndex), firstSessionUid),
                BuildPacket(F125PacketIds.Motion, playerCarIndex, BuildMotionPayload(playerCarIndex), secondSessionUid),
                BuildPacket(F125PacketIds.LapData, playerCarIndex, BuildLapDataPayload(playerCarIndex), secondSessionUid),
                BuildPacket(F125PacketIds.CarTelemetry, playerCarIndex, BuildCarTelemetryPayload(playerCarIndex), secondSessionUid)
            ]);
        var adapter = CreateEnabledAdapter(listener);
        var samples = new List<TelemetrySample>();

        await foreach (var sample in adapter.RunAsync(CancellationToken.None))
        {
            samples.Add(sample);
        }

        Assert.Equal(2, samples.Count);
        Assert.NotNull(samples[0].PowerUnit);
        Assert.NotNull(samples[0].Damage);
        Assert.Null(samples[1].PowerUnit);
        Assert.Null(samples[1].Damage);
        Assert.NotEqual(samples[0].SessionId, samples[1].SessionId);
    }

    [Fact]
    public async Task DisabledAdapterStaysOfflineAndDoesNotBindListener()
    {
        var listenerFactory = new RecordingUdpTelemetryListenerFactory(new TestUdpTelemetryListener([]));
        var adapter = new F125UdpTelemetryAdapter(
            new TelemetryAdapterOptions { Enabled = false },
            listenerFactory);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => DrainAsync(adapter.RunAsync(CancellationToken.None)));

        Assert.Equal(TelemetrySourceStatus.Offline, adapter.Source.Status);
        Assert.Contains("disabled", exception.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Null(listenerFactory.BoundOptions);
    }

    private static async Task DrainAsync(IAsyncEnumerable<TelemetrySample> samples)
    {
        await foreach (var sample in samples)
        {
            _ = sample;
        }
    }

    private static F125UdpTelemetryAdapter CreateEnabledAdapter(IUdpTelemetryListener listener)
    {
        var adapterOptions = Options.Create(new TelemetryAdaptersOptions
        {
            Items =
            {
                [F125UdpTelemetryAdapter.AdapterId] = new TelemetryAdapterOptions { Enabled = true }
            }
        });

        return new F125UdpTelemetryAdapter(
            adapterOptions,
            new RecordingUdpTelemetryListenerFactory(listener),
            new F125PacketReader(),
            new F125Normalizer());
    }

    private static byte[] BuildPacket(
        byte packetId,
        byte playerCarIndex,
        ReadOnlySpan<byte> payload,
        ulong sessionUid = 0x0102_0304_0506_0708UL)
    {
        var buffer = new byte[F125PacketHeader.Size + payload.Length];
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(0, sizeof(ushort)), F125PacketHeader.ExpectedPacketFormat);
        buffer[2] = 25;
        buffer[3] = 1;
        buffer[4] = 2;
        buffer[5] = 3;
        buffer[6] = packetId;
        BinaryPrimitives.WriteUInt64LittleEndian(buffer.AsSpan(7, sizeof(ulong)), sessionUid);
        BinaryPrimitives.WriteSingleLittleEndian(buffer.AsSpan(15, sizeof(float)), 42.5f);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(19, sizeof(uint)), 1234);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(23, sizeof(uint)), 5678);
        buffer[27] = playerCarIndex;
        buffer[28] = 255;
        payload.CopyTo(buffer.AsSpan(F125PacketHeader.Size));
        return buffer;
    }

    private static byte[] BuildMotionPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * MotionDataSize];
        var playerOffset = playerCarIndex * MotionDataSize;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset, sizeof(float)), 12.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 36, sizeof(float)), 1.25f);
        return payload;
    }

    private static byte[] BuildLapDataPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * LapDataSize];
        var playerOffset = playerCarIndex * LapDataSize;
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset, sizeof(uint)), 83_210);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(playerOffset + 4, sizeof(uint)), 12_345);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 18, sizeof(float)), 1234.5f);
        payload[playerOffset + 30] = 1;
        payload[playerOffset + 31] = 7;
        payload[playerOffset + 34] = 2;
        return payload;
    }

    private static byte[] BuildCarTelemetryPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarTelemetryDataSize];
        var playerOffset = playerCarIndex * CarTelemetryDataSize;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset, sizeof(ushort)), 213);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 2, sizeof(float)), 0.72f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 6, sizeof(float)), -0.34f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 10, sizeof(float)), 0.18f);
        payload[playerOffset + 14] = 64;
        payload[playerOffset + 15] = 6;
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(playerOffset + 16, sizeof(ushort)), 11_250);
        return payload;
    }

    private static byte[] BuildCarStatusPayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarStatusDataSize];
        var playerOffset = playerCarIndex * CarStatusDataSize;
        payload[playerOffset] = 2;
        payload[playerOffset + 1] = 1;
        payload[playerOffset + 4] = 1;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 5, sizeof(float)), 34.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 9, sizeof(float)), 110.0f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 13, sizeof(float)), 12.75f);
        payload[playerOffset + 22] = 1;
        payload[playerOffset + 25] = 17;
        payload[playerOffset + 26] = 17;
        payload[playerOffset + 27] = 8;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 37, sizeof(float)), 3_200_000f);
        payload[playerOffset + 41] = 3;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 42, sizeof(float)), 1_100f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 46, sizeof(float)), 2_200f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 50, sizeof(float)), 3_300f);
        return payload;
    }

    private static byte[] BuildCarDamagePayload(byte playerCarIndex)
    {
        var payload = new byte[CarCount * CarDamageDataSize];
        var playerOffset = playerCarIndex * CarDamageDataSize;
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset, sizeof(float)), 11.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 4, sizeof(float)), 12.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 8, sizeof(float)), 13.5f);
        BinaryPrimitives.WriteSingleLittleEndian(payload.AsSpan(playerOffset + 12, sizeof(float)), 14.5f);
        payload[playerOffset + 16] = 19;
        payload[playerOffset + 17] = 20;
        payload[playerOffset + 18] = 21;
        payload[playerOffset + 19] = 22;
        payload[playerOffset + 20] = 17;
        payload[playerOffset + 21] = 18;
        payload[playerOffset + 22] = 23;
        payload[playerOffset + 23] = 24;
        payload[playerOffset + 24] = 2;
        payload[playerOffset + 25] = 3;
        payload[playerOffset + 26] = 4;
        payload[playerOffset + 27] = 5;
        payload[playerOffset + 28] = 6;
        payload[playerOffset + 29] = 7;
        payload[playerOffset + 32] = 8;
        payload[playerOffset + 33] = 9;
        return payload;
    }

    private sealed class RecordingUdpTelemetryListenerFactory(IUdpTelemetryListener listener) : IUdpTelemetryListenerFactory
    {
        public UdpTelemetryListenerOptions? BoundOptions { get; private set; }

        public IUdpTelemetryListener Bind(UdpTelemetryListenerOptions options)
        {
            BoundOptions = options;
            return listener;
        }
    }

    private sealed class TestUdpTelemetryListener(IReadOnlyList<byte[]> payloads) : IUdpTelemetryListener
    {
        public IPEndPoint LocalEndPoint { get; } = new(IPAddress.Loopback, 20777);

        public async IAsyncEnumerable<UdpTelemetryDatagram> ReceiveAsync(
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            foreach (var payload in payloads)
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return new UdpTelemetryDatagram(
                    payload,
                    new IPEndPoint(IPAddress.Loopback, 50000),
                    DateTimeOffset.UtcNow);
            }

            await Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            return ValueTask.CompletedTask;
        }
    }
}
