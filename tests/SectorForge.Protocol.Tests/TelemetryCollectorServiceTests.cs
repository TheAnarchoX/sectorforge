using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging.Abstractions;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;
using SectorForge.Core.Telemetry;

namespace SectorForge.Protocol.Tests;

public sealed class TelemetryCollectorServiceTests
{
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
        Assert.Contains(publisher.StatusUpdates, update => update.IsRunning && update.RunMode == TelemetryRunMode.Replay);
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
}
