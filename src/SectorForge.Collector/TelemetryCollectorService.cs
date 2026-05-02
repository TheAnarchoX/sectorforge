using SectorForge.Core.Telemetry;

namespace SectorForge.Collector;

public sealed class TelemetryCollectorService : ITelemetryReceiver, IAsyncDisposable
{
    private readonly IReadOnlyDictionary<string, ITelemetryAdapter> _adapters;
    private readonly ILiveTelemetryPublisher _publisher;
    private readonly ITelemetrySessionStore _sessionStore;
    private readonly ILogger<TelemetryCollectorService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private CancellationTokenSource? _runCancellation;
    private Task? _runTask;
    private ITelemetryAdapter? _activeAdapter;
    private DateTimeOffset? _startedAt;
    private DateTimeOffset? _lastSampleAt;
    private TelemetrySample? _latestSample;
    private long _samplesPublished;
    private string? _lastError;

    public TelemetryCollectorService(
        IEnumerable<ITelemetryAdapter> adapters,
        ILiveTelemetryPublisher publisher,
        ITelemetrySessionStore sessionStore,
        ILogger<TelemetryCollectorService> logger)
    {
        _adapters = adapters.ToDictionary(adapter => adapter.Source.AdapterId, StringComparer.OrdinalIgnoreCase);
        _publisher = publisher;
        _sessionStore = sessionStore;
        _logger = logger;
    }

    public IReadOnlyCollection<TelemetrySource> Sources => _adapters.Values.Select(adapter => adapter.Source).ToArray();

    public async Task StartAsync(string adapterId, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!_adapters.TryGetValue(adapterId, out var adapter))
            {
                throw new KeyNotFoundException($"Telemetry adapter '{adapterId}' is not registered.");
            }

            if (adapter.Source.Status == TelemetrySourceStatus.NotImplemented)
            {
                throw new InvalidOperationException($"{adapter.Source.DisplayName} is registered but not implemented yet.");
            }

            if (_runTask is { IsCompleted: false } && string.Equals(_activeAdapter?.Source.AdapterId, adapterId, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            await StopLockedAsync(cancellationToken);

            _activeAdapter = adapter;
            _startedAt = DateTimeOffset.UtcNow;
            _lastError = null;
            _samplesPublished = 0;
            _latestSample = null;
            _lastSampleAt = null;
            _runCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            _runTask = Task.Run(() => RunAdapterAsync(adapter, _runCancellation.Token), CancellationToken.None);

            await _publisher.PublishStatusAsync(GetStatus(), cancellationToken);
            _logger.LogInformation("Started telemetry adapter {AdapterId}", adapterId);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await StopLockedAsync(cancellationToken);
            await _publisher.PublishStatusAsync(GetStatus(), cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    public TelemetryReceiverStatus GetStatus()
    {
        var isRunning = _runTask is { IsCompleted: false };
        var source = _activeAdapter?.Source;

        return new TelemetryReceiverStatus(
            IsRunning: isRunning,
            ActiveAdapterId: _activeAdapter?.Source.AdapterId,
            Source: source is null ? null : source with { Status = isRunning ? TelemetrySourceStatus.Running : source.Status },
            StartedAt: _startedAt,
            LastSampleAt: _lastSampleAt,
            SamplesPublished: Interlocked.Read(ref _samplesPublished),
            LastError: _lastError,
            LatestSample: _latestSample);
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
        _gate.Dispose();
        _runCancellation?.Dispose();
    }

    private async Task RunAdapterAsync(ITelemetryAdapter adapter, CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var sample in adapter.RunAsync(cancellationToken))
            {
                _latestSample = sample;
                _lastSampleAt = sample.Timestamp;
                Interlocked.Increment(ref _samplesPublished);

                await _sessionStore.SaveSampleAsync(sample, cancellationToken);
                await _publisher.PublishAsync(sample, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            _logger.LogError(ex, "Telemetry adapter {AdapterId} stopped unexpectedly", adapter.Source.AdapterId);
            await _publisher.PublishStatusAsync(GetStatus(), CancellationToken.None);
        }
    }

    private async Task StopLockedAsync(CancellationToken cancellationToken)
    {
        if (_runCancellation is null || _runTask is null)
        {
            return;
        }

        await _runCancellation.CancelAsync();

        try
        {
            await _runTask.WaitAsync(TimeSpan.FromSeconds(2), cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is TimeoutException or OperationCanceledException)
        {
            _logger.LogDebug(ex, "Telemetry adapter did not stop before the graceful timeout.");
        }
        finally
        {
            _runCancellation.Dispose();
            _runCancellation = null;
            _runTask = null;
        }
    }
}
