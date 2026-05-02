using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;
using SectorForge.Core.Telemetry;

namespace SectorForge.Api.Tests;

internal static class TelemetryTestHarness
{
    public static TelemetryCollectorService CreateCollector(
        ITelemetryAdapter adapter,
        ILiveTelemetryPublisher? publisher = null,
        ITelemetrySessionStore? sessionStore = null)
    {
        return new TelemetryCollectorService(
            [adapter],
            publisher ?? new RecordingTelemetryPublisher(),
            sessionStore ?? new EmptyTelemetrySessionStore(),
            NullLogger<TelemetryCollectorService>.Instance);
    }

    public static async Task WaitForConditionAsync(Func<bool> condition, TimeSpan timeout)
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
}


internal sealed class BlockingTelemetryAdapter(string adapterId = "fake") : ITelemetryAdapter
{
    private readonly FakeTelemetryAdapter _sampleFactory = new(TimeSpan.FromMilliseconds(1));
    private readonly Guid _sessionId = Guid.NewGuid();

    public TelemetrySource Source { get; } = new(
        AdapterId: adapterId,
        Game: GameId.Fake,
        DisplayName: "Blocking fake telemetry",
        InputKind: "Test stream",
        IsSimulated: true,
        Status: TelemetrySourceStatus.Available,
        Notes: "Test adapter that emits one sample and waits for cancellation.");

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

internal sealed class EmptyTelemetrySessionStore : ITelemetrySessionStore
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

internal sealed class RecordingTelemetryPublisher : ILiveTelemetryPublisher
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

internal sealed record HubInvocation(string Method, object?[] Arguments);

internal sealed class RecordingClientProxy : ISingleClientProxy
{
    public ConcurrentQueue<HubInvocation> Invocations { get; } = new();

    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
    {
        Invocations.Enqueue(new HubInvocation(method, args));
        return Task.CompletedTask;
    }

    public Task<TResult> InvokeCoreAsync<TResult>(string method, object?[] args, CancellationToken cancellationToken = default)
    {
        Invocations.Enqueue(new HubInvocation(method, args));
        return Task.FromResult(default(TResult)!);
    }
}

internal sealed class TestHubCallerClients(RecordingClientProxy proxy) : IHubCallerClients
{
    public IClientProxy All => proxy;

    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => proxy;

    public IClientProxy Caller => proxy;

    public IClientProxy Client(string connectionId) => proxy;

    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => proxy;

    public IClientProxy Group(string groupName) => proxy;

    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => proxy;

    public IClientProxy Groups(IReadOnlyList<string> groupNames) => proxy;

    public IClientProxy Others => proxy;

    public IClientProxy OthersInGroup(string groupName) => proxy;

    public IClientProxy User(string userId) => proxy;

    public IClientProxy Users(IReadOnlyList<string> userIds) => proxy;
}

internal sealed class TestHubCallerContext(CancellationToken connectionAborted) : HubCallerContext
{
    private readonly Dictionary<object, object?> _items = [];

    public override string ConnectionId => "test-connection";

    public override string? UserIdentifier => "test-user";

    public override ClaimsPrincipal? User { get; } = new(new ClaimsIdentity());

    public override IDictionary<object, object?> Items => _items;

    public override IFeatureCollection Features { get; } = new FeatureCollection();

    public override CancellationToken ConnectionAborted => connectionAborted;

    public override void Abort()
    {
    }
}

internal sealed class NoOpGroupManager : IGroupManager
{
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }

    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
    {
        return Task.CompletedTask;
    }
}
