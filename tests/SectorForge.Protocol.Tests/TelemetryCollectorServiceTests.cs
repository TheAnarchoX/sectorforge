using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging.Abstractions;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Core.Telemetry;
using SectorForge.Core.Telemetry.Configuration;
using SectorForge.Core.Telemetry.Udp;

namespace SectorForge.Protocol.Tests;

public sealed class TelemetryCollectorServiceTests
{
    [Fact]
    public async Task StartingSameAdapterTwiceDoesNotRepublishStatus()
    {
        var adapter = new BlockingTelemetryAdapter();
        var publisher = new RecordingTelemetryPublisher();

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new TestTelemetrySessionStore(TimeSpan.Zero));

        try
        {
            await collector.StartAsync(adapter.Source.AdapterId);
            await WaitForConditionAsync(() => collector.GetStatus().IsRunning, TimeSpan.FromSeconds(1));

            var statusUpdateCount = publisher.StatusUpdates.Count;

            await collector.StartAsync(adapter.Source.AdapterId);

            Assert.Equal(statusUpdateCount, publisher.StatusUpdates.Count);
            Assert.True(collector.GetStatus().IsRunning);
        }
        finally
        {
            await collector.StopAsync();
        }
    }

    [Fact]
    public async Task CollectorKeepsReadingSamplesWhenDownstreamWorkFallsBehind()
    {
        const int sampleCount = 250;
        var adapter = new BurstTelemetryAdapter(sampleCount);

        await using var collector = CreateCollector(
            adapter,
            new NoOpTelemetryPublisher(),
            new TestTelemetrySessionStore(TimeSpan.FromMilliseconds(10)));

        await collector.StartAsync(adapter.Source.AdapterId);
        await WaitForConditionAsync(
            () => collector.GetStatus().LatestSample?.Sequence == sampleCount,
            TimeSpan.FromSeconds(1));

        var responsiveStatus = collector.GetStatus();
        Assert.Equal(sampleCount, responsiveStatus.LatestSample?.Sequence);
        Assert.True(responsiveStatus.SamplesPublished < sampleCount);

        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var completedStatus = collector.GetStatus();
        Assert.True(completedStatus.SamplesDropped > 0);
        Assert.Equal(sampleCount, completedStatus.SamplesPublished + completedStatus.SamplesDropped);
        Assert.Null(completedStatus.LastError);
    }

    [Fact]
    public async Task CollectorReportsPublisherFailuresInStatus()
    {
        const string failureMessage = "Simulated publisher failure";
        var adapter = new BurstTelemetryAdapter(sampleCount: 5);
        var publisher = new FailingTelemetryPublisher(failureMessage);

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new TestTelemetrySessionStore(TimeSpan.Zero));

        await collector.StartAsync(adapter.Source.AdapterId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.Equal(failureMessage, status.LastError);
        Assert.Contains(publisher.StatusUpdates, update => update.LastError == failureMessage);
    }

    [Fact]
    public async Task ReplayPublishesStoredSessionSamplesThroughLivePublisher()
    {
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();
        var storedSamples = new[]
        {
            adapter.CreateSample(TimeSpan.FromSeconds(1), 1, sessionId),
            adapter.CreateSample(TimeSpan.FromSeconds(2), 2, sessionId),
            adapter.CreateSample(TimeSpan.FromSeconds(3), 3, sessionId)
        };
        var publisher = new RecordingTelemetryPublisher();

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new ReplayTelemetrySessionStore(storedSamples));

        await collector.StartReplayAsync(sessionId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.Equal(TelemetryRunMode.Idle, status.RunMode);
        Assert.Equal(3, status.SamplesPublished);
        Assert.Equal([1L, 2L, 3L], publisher.PublishedSamples.Select(sample => sample.Sequence).ToArray());
        Assert.All(
            publisher.PublishedSamples,
            sample => Assert.Contains(sample.Participants ?? [], participant => participant.DriverName == "Avery Cole"));
        Assert.Contains(publisher.StatusUpdates, update => update.IsRunning && update.RunMode == TelemetryRunMode.Replay);
    }

    [Fact]
    public async Task ReplayHandlesNonIncreasingAndSubTickSampleIntervals()
    {
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();
        var baseTimestamp = DateTimeOffset.UtcNow;
        var sample1 = adapter.CreateSample(TimeSpan.Zero, 1, sessionId) with { Timestamp = baseTimestamp };
        var sample2 = adapter.CreateSample(TimeSpan.Zero, 2, sessionId) with { Timestamp = baseTimestamp };
        var sample3 = adapter.CreateSample(TimeSpan.Zero, 3, sessionId) with { Timestamp = baseTimestamp.AddTicks(1) };
        var publisher = new RecordingTelemetryPublisher();

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new ReplayTelemetrySessionStore([sample1, sample2, sample3]));

        await collector.StartReplayAsync(sessionId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.Null(status.LastError);
        Assert.Equal(3, status.SamplesPublished);
        Assert.Equal([1L, 2L, 3L], publisher.PublishedSamples.Select(sample => sample.Sequence).ToArray());
    }

    [Fact]
    public async Task ReplayWithoutStoredSamplesUsesFallbackReplaySource()
    {
        var sessionId = Guid.NewGuid();
        var session = new TelemetrySessionDetails(
            new TelemetrySessionSummary(
                Id: sessionId,
                Game: GameId.Fake,
                SourceName: null,
                TrackName: "Silverstone GP",
                CarName: "SectorForge GT Prototype",
                StartedAt: DateTimeOffset.UtcNow,
                LastSeenAt: DateTimeOffset.UtcNow,
                BestLapTime: null,
                SampleCount: 0),
            [],
            []);

        await using var collector = CreateCollector(
            new FakeTelemetryAdapter(),
            new RecordingTelemetryPublisher(),
            new PreloadedReplayTelemetrySessionStore(session));

        await collector.StartReplayAsync(sessionId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.Equal("replay", status.ActiveAdapterId);
        Assert.NotNull(status.Source);
        Assert.Equal("Stored session replay", status.Source.DisplayName);
        Assert.Equal(TelemetrySourceStatus.Available, status.Source.Status);
        Assert.Equal(0, status.SamplesPublished);
    }

    [Fact]
    public async Task ReplayReportsStoreFailuresInStatus()
    {
        const string failureMessage = "Simulated replay store failure";
        var sessionId = Guid.NewGuid();
        var adapter = new FakeTelemetryAdapter();
        var firstSample = adapter.CreateSample(TimeSpan.Zero, 1, sessionId);
        var session = new TelemetrySessionDetails(
            new TelemetrySessionSummary(
                Id: sessionId,
                Game: firstSample.Source.Game,
                SourceName: firstSample.Source.DisplayName,
                TrackName: firstSample.Track.TrackName,
                CarName: firstSample.Vehicle.CarName,
                StartedAt: firstSample.Session.StartedAt,
                LastSeenAt: firstSample.Timestamp,
                BestLapTime: firstSample.Lap.BestLapTime,
                SampleCount: 1),
            [],
            [firstSample]);
        var publisher = new RecordingTelemetryPublisher();

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new PreloadedReplayTelemetrySessionStore(
                session,
                [firstSample],
                new InvalidOperationException(failureMessage)));

        await collector.StartReplayAsync(sessionId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.Equal(failureMessage, status.LastError);
        Assert.Contains(publisher.StatusUpdates, update => update.LastError == failureMessage);
    }

    [Fact]
    public async Task CollectorSwallowsStatusPublishFailuresWhenStopping()
    {
        var adapter = new BurstTelemetryAdapter(sampleCount: 1);
        var publisher = new StatusFailsOnSecondUpdateTelemetryPublisher();

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new TestTelemetrySessionStore(TimeSpan.Zero));

        await collector.StartAsync(adapter.Source.AdapterId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.Null(status.LastError);
        Assert.True(publisher.StatusPublishCount >= 2);
    }

    [Fact]
    public async Task CollectorReportsF125ListenerBindFailuresInStatus()
    {
        const string failureMessage = "Simulated F1 UDP bind failure";
        var adapter = new F125UdpTelemetryAdapter(
            CreateEnabledF125Options(),
            new ThrowingUdpTelemetryListenerFactory(new InvalidOperationException(failureMessage)));
        var publisher = new RecordingTelemetryPublisher();

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new TestTelemetrySessionStore(TimeSpan.Zero));

        await collector.StartAsync(adapter.Source.AdapterId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.Equal(failureMessage, status.LastError);
        Assert.Contains(publisher.StatusUpdates, update => update.LastError == failureMessage);
    }

    [Fact]
    public async Task CollectorReportsF125ParseFailuresInStatus()
    {
        var listener = new TestUdpTelemetryListener([[0x01, 0x02, 0x03]]);
        var adapter = new F125UdpTelemetryAdapter(
            CreateEnabledF125Options(),
            new TestUdpTelemetryListenerFactory(listener));
        var publisher = new RecordingTelemetryPublisher();

        await using var collector = CreateCollector(
            adapter,
            publisher,
            new TestTelemetrySessionStore(TimeSpan.Zero));

        await collector.StartAsync(adapter.Source.AdapterId);
        await WaitForConditionAsync(() => !collector.GetStatus().IsRunning, TimeSpan.FromSeconds(5));

        var status = collector.GetStatus();
        Assert.NotNull(status.LastError);
        Assert.Contains("F1 25 UDP packet failed to parse", status.LastError, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("header requires", status.LastError, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(publisher.StatusUpdates, update => update.LastError == status.LastError);
    }

    [Fact]
    public async Task StopAsyncCancelsF125ListenerPromptly()
    {
        var listener = new TestUdpTelemetryListener([], waitForCancellation: true);
        var adapter = new F125UdpTelemetryAdapter(
            CreateEnabledF125Options(),
            new TestUdpTelemetryListenerFactory(listener));

        await using var collector = CreateCollector(
            adapter,
            new NoOpTelemetryPublisher(),
            new TestTelemetrySessionStore(TimeSpan.Zero));

        await collector.StartAsync(adapter.Source.AdapterId);
        await WaitForConditionAsync(() => collector.GetStatus().IsRunning, TimeSpan.FromSeconds(1));

        await collector.StopAsync();

        var status = collector.GetStatus();
        Assert.False(status.IsRunning);
        Assert.Null(status.LastError);
        Assert.True(listener.CancellationObserved);
        Assert.True(listener.Disposed);
    }

    private static TelemetryCollectorService CreateCollector(
        ITelemetryAdapter adapter,
        ILiveTelemetryPublisher publisher,
        ITelemetrySessionStore sessionStore)
    {
        return new TelemetryCollectorService(
            [adapter],
            publisher,
            sessionStore,
            NullLogger<TelemetryCollectorService>.Instance);
    }

    private static TelemetryAdapterOptions CreateEnabledF125Options()
    {
        return new TelemetryAdapterOptions
        {
            Enabled = true,
            BindAddress = "127.0.0.1",
            Port = 0
        };
    }

    private static async Task WaitForConditionAsync(Func<bool> condition, TimeSpan timeout)
    {
        var startedAt = DateTimeOffset.UtcNow;

        while (!condition())
        {
            if (DateTimeOffset.UtcNow - startedAt > timeout)
            {
                break;
            }

            await Task.Delay(10);
        }

        Assert.True(condition(), $"Condition was not met within {timeout}.");
    }

    private sealed class BurstTelemetryAdapter(int sampleCount) : ITelemetryAdapter
    {
        private readonly FakeTelemetryAdapter _sampleFactory = new(TimeSpan.FromMilliseconds(1));
        private readonly Guid _sessionId = Guid.NewGuid();

        public int SampleCount { get; } = sampleCount;

        public TelemetrySource Source { get; } = new(
            AdapterId: "burst",
            Game: GameId.Fake,
            DisplayName: "Burst test adapter",
            InputKind: "Burst test stream",
            IsSimulated: true,
            Status: TelemetrySourceStatus.Available,
            Notes: "Emits a fixed number of telemetry samples as quickly as possible for collector tests.");

        public async IAsyncEnumerable<TelemetrySample> RunAsync([EnumeratorCancellation] CancellationToken cancellationToken)
        {
            for (var index = 0; index < SampleCount; index++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                yield return _sampleFactory.CreateSample(TimeSpan.FromMilliseconds(index), index + 1, _sessionId) with
                {
                    Source = Source with { Status = TelemetrySourceStatus.Running }
                };
            }

            await Task.CompletedTask;
        }
    }

    private sealed class BlockingTelemetryAdapter : ITelemetryAdapter
    {
        private readonly FakeTelemetryAdapter _sampleFactory = new(TimeSpan.FromMilliseconds(1));
        private readonly Guid _sessionId = Guid.NewGuid();

        public TelemetrySource Source { get; } = new(
            AdapterId: "blocking",
            Game: GameId.Fake,
            DisplayName: "Blocking test adapter",
            InputKind: "Blocking test stream",
            IsSimulated: true,
            Status: TelemetrySourceStatus.Available,
            Notes: "Emits one sample and waits for cancellation.");

        public async IAsyncEnumerable<TelemetrySample> RunAsync([EnumeratorCancellation] CancellationToken cancellationToken)
        {
            yield return _sampleFactory.CreateSample(TimeSpan.Zero, 1, _sessionId) with
            {
                Source = Source with { Status = TelemetrySourceStatus.Running }
            };

            try
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
            }
        }
    }

    private sealed class TestTelemetrySessionStore(TimeSpan saveDelay) : ITelemetrySessionStore
    {
        public Task UpsertSessionAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public async Task SaveSampleAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            if (saveDelay > TimeSpan.Zero)
            {
                await Task.Delay(saveDelay, cancellationToken);
            }
        }

        public async IAsyncEnumerable<TelemetrySample> StreamSessionSamplesAsync(Guid sessionId, [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            await Task.CompletedTask;
            yield break;
        }

        public Task<IReadOnlyList<TelemetrySessionSummary>> ListSessionsAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<TelemetrySessionSummary>>([]);
        }

        public Task<TelemetrySessionDetails?> GetSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<TelemetrySessionDetails?>(null);
        }

        public Task<TelemetryLapSamples?> GetLapSamplesAsync(Guid sessionId, int lapNumber, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<TelemetryLapSamples?>(null);
        }

        public Task<bool> DeleteSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(false);
        }
    }

    private sealed class ReplayTelemetrySessionStore(IReadOnlyList<TelemetrySample> samples) : ITelemetrySessionStore
    {
        public Task UpsertSessionAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task SaveSampleAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public async IAsyncEnumerable<TelemetrySample> StreamSessionSamplesAsync(Guid sessionId, [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            foreach (var sample in samples.Where(sample => sample.SessionId == sessionId))
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return sample;
            }

            await Task.CompletedTask;
        }

        public Task<IReadOnlyList<TelemetrySessionSummary>> ListSessionsAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<TelemetrySessionSummary>>([]);
        }

        public Task<TelemetrySessionDetails?> GetSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
        {
            var sessionSamples = samples.Where(sample => sample.SessionId == sessionId).ToArray();
            if (sessionSamples.Length == 0)
            {
                return Task.FromResult<TelemetrySessionDetails?>(null);
            }

            var lastSample = sessionSamples[^1];
            var summary = new TelemetrySessionSummary(
                Id: sessionId,
                Game: lastSample.Source.Game,
                SourceName: lastSample.Source.DisplayName,
                TrackName: lastSample.Track.TrackName,
                CarName: lastSample.Vehicle.CarName,
                StartedAt: sessionSamples[0].Session.StartedAt,
                LastSeenAt: lastSample.Timestamp,
                BestLapTime: lastSample.Lap.BestLapTime,
                SampleCount: sessionSamples.Length);

            return Task.FromResult<TelemetrySessionDetails?>(new TelemetrySessionDetails(summary, [], sessionSamples));
        }

        public Task<TelemetryLapSamples?> GetLapSamplesAsync(Guid sessionId, int lapNumber, CancellationToken cancellationToken = default)
        {
            var sessionSamples = samples.Where(sample => sample.SessionId == sessionId).ToArray();
            if (sessionSamples.Length == 0)
            {
                return Task.FromResult<TelemetryLapSamples?>(null);
            }

            var lastSample = sessionSamples[^1];
            var summary = new TelemetrySessionSummary(
                Id: sessionId,
                Game: lastSample.Source.Game,
                SourceName: lastSample.Source.DisplayName,
                TrackName: lastSample.Track.TrackName,
                CarName: lastSample.Vehicle.CarName,
                StartedAt: sessionSamples[0].Session.StartedAt,
                LastSeenAt: lastSample.Timestamp,
                BestLapTime: lastSample.Lap.BestLapTime,
                SampleCount: sessionSamples.Length);

            var lapSamples = sessionSamples.Where(sample => sample.Lap.LapNumber == lapNumber).ToArray();
            var lap = lapSamples.Length == 0
                ? null
                : new LapSummary(
                    SessionId: sessionId,
                    LapNumber: lapNumber,
                    LapTime: lapSamples[^1].Lap.LastLapTime ?? lapSamples[^1].Lap.CurrentLapTime,
                    BestLapTime: lapSamples[^1].Lap.BestLapTime,
                    UpdatedAt: lapSamples[^1].Timestamp);

            return Task.FromResult<TelemetryLapSamples?>(new TelemetryLapSamples(summary, lap, lapSamples));
        }

        public Task<bool> DeleteSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(false);
        }
    }

    private sealed class PreloadedReplayTelemetrySessionStore(
        TelemetrySessionDetails session,
        IReadOnlyList<TelemetrySample>? streamedSamples = null,
        Exception? streamFailure = null) : ITelemetrySessionStore
    {
        public Task UpsertSessionAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task SaveSampleAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public async IAsyncEnumerable<TelemetrySample> StreamSessionSamplesAsync(Guid sessionId, [EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            if (session.Session.Id != sessionId)
            {
                await Task.CompletedTask;
                yield break;
            }

            foreach (var sample in streamedSamples ?? [])
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return sample;
            }

            if (streamFailure is not null)
            {
                throw streamFailure;
            }

            await Task.CompletedTask;
        }

        public Task<IReadOnlyList<TelemetrySessionSummary>> ListSessionsAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<TelemetrySessionSummary>>([session.Session]);
        }

        public Task<TelemetrySessionDetails?> GetSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult<TelemetrySessionDetails?>(session.Session.Id == sessionId ? session : null);
        }

        public Task<TelemetryLapSamples?> GetLapSamplesAsync(Guid sessionId, int lapNumber, CancellationToken cancellationToken = default)
        {
            if (session.Session.Id != sessionId)
            {
                return Task.FromResult<TelemetryLapSamples?>(null);
            }

            var lap = session.Laps.FirstOrDefault(candidate => candidate.LapNumber == lapNumber);
            var lapSamples = session.Samples.Where(sample => sample.Lap.LapNumber == lapNumber).ToArray();

            return Task.FromResult<TelemetryLapSamples?>(new TelemetryLapSamples(session.Session, lap, lapSamples));
        }

        public Task<bool> DeleteSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(false);
        }
    }

    private sealed class NoOpTelemetryPublisher : ILiveTelemetryPublisher
    {
        public Task PublishAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task PublishStatusAsync(TelemetryReceiverStatus status, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingTelemetryPublisher : ILiveTelemetryPublisher
    {
        public ConcurrentQueue<TelemetrySample> PublishedSamples { get; } = new();
        public ConcurrentQueue<TelemetryReceiverStatus> StatusUpdates { get; } = new();

        public Task PublishAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            PublishedSamples.Enqueue(sample);
            return Task.CompletedTask;
        }

        public Task PublishStatusAsync(TelemetryReceiverStatus status, CancellationToken cancellationToken = default)
        {
            StatusUpdates.Enqueue(status);
            return Task.CompletedTask;
        }
    }

    private sealed class FailingTelemetryPublisher(string failureMessage) : ILiveTelemetryPublisher
    {
        public ConcurrentQueue<TelemetryReceiverStatus> StatusUpdates { get; } = new();

        public Task PublishAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException(failureMessage);
        }

        public Task PublishStatusAsync(TelemetryReceiverStatus status, CancellationToken cancellationToken = default)
        {
            StatusUpdates.Enqueue(status);
            return Task.CompletedTask;
        }
    }

    private sealed class StatusFailsOnSecondUpdateTelemetryPublisher : ILiveTelemetryPublisher
    {
        private int _statusPublishCount;

        public int StatusPublishCount => _statusPublishCount;

        public Task PublishAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task PublishStatusAsync(TelemetryReceiverStatus status, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref _statusPublishCount) == 2)
            {
                throw new InvalidOperationException("Simulated status publish failure");
            }

            return Task.CompletedTask;
        }
    }

    private sealed class ThrowingUdpTelemetryListenerFactory(Exception exception) : IUdpTelemetryListenerFactory
    {
        public IUdpTelemetryListener Bind(UdpTelemetryListenerOptions options)
        {
            throw exception;
        }
    }

    private sealed class TestUdpTelemetryListenerFactory(IUdpTelemetryListener listener) : IUdpTelemetryListenerFactory
    {
        public IUdpTelemetryListener Bind(UdpTelemetryListenerOptions options)
        {
            return listener;
        }
    }

    private sealed class TestUdpTelemetryListener(
        IReadOnlyList<byte[]> payloads,
        bool waitForCancellation = false) : IUdpTelemetryListener
    {
        public System.Net.IPEndPoint LocalEndPoint { get; } = new(System.Net.IPAddress.Loopback, 20777);

        public bool CancellationObserved { get; private set; }

        public bool Disposed { get; private set; }

        public async IAsyncEnumerable<UdpTelemetryDatagram> ReceiveAsync(
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            foreach (var payload in payloads)
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return new UdpTelemetryDatagram(
                    payload,
                    new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 50000),
                    DateTimeOffset.UtcNow);
            }

            if (waitForCancellation)
            {
                try
                {
                    await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    CancellationObserved = true;
                }
            }
        }

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }
}
