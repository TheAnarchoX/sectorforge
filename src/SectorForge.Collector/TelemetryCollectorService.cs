using System.Threading.Channels;
using SectorForge.Core.Telemetry;

namespace SectorForge.Collector;

public sealed class TelemetryCollectorService : ITelemetryReceiver, IAsyncDisposable
{
    private const int PendingSampleBufferCapacity = 120;
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
    private long _samplesDropped;
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
            _samplesDropped = 0;
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
            SamplesDropped: Interlocked.Read(ref _samplesDropped),
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
        using var processingCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var processingToken = processingCancellation.Token;
        var sampleBuffer = CreateSampleBuffer();
        var deliveryTask = ProcessBufferedSamplesAsync(sampleBuffer.Reader, processingToken);
        var cancelOnDeliveryFaultTask = deliveryTask.ContinueWith(
            static (task, state) =>
            {
                if (task.IsFaulted)
                {
                    ((CancellationTokenSource)state!).Cancel();
                }
            },
            processingCancellation,
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
        Exception? runException = null;

        try
        {
            await foreach (var sample in adapter.RunAsync(processingToken))
            {
                _latestSample = sample;
                _lastSampleAt = sample.Timestamp;
                QueueSample(sampleBuffer, sample);
            }
        }
        catch (OperationCanceledException) when (processingToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            runException = ex;
        }
        finally
        {
            sampleBuffer.Writer.TryComplete();

            try
            {
                await deliveryTask;
            }
            catch (OperationCanceledException) when (processingToken.IsCancellationRequested && cancellationToken.IsCancellationRequested)
            {
            }
            catch (Exception ex) when (runException is null)
            {
                runException = ex;
            }

            await cancelOnDeliveryFaultTask;
        }

        if (runException is not null)
        {
            _lastError = runException.Message;
            _logger.LogError(runException, "Telemetry adapter {AdapterId} stopped unexpectedly", adapter.Source.AdapterId);
            await _publisher.PublishStatusAsync(GetStatus(), CancellationToken.None);
        }
    }

    private async Task ProcessBufferedSamplesAsync(ChannelReader<TelemetrySample> sampleReader, CancellationToken cancellationToken)
    {
        await foreach (var sample in sampleReader.ReadAllAsync(cancellationToken))
        {
            await _sessionStore.SaveSampleAsync(sample, cancellationToken);
            await _publisher.PublishAsync(sample, cancellationToken);
            Interlocked.Increment(ref _samplesPublished);
        }
    }

    private static Channel<TelemetrySample> CreateSampleBuffer()
    {
        return Channel.CreateBounded<TelemetrySample>(new BoundedChannelOptions(PendingSampleBufferCapacity)
        {
            AllowSynchronousContinuations = false,
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = true
        });
    }

    private void QueueSample(Channel<TelemetrySample> sampleBuffer, TelemetrySample sample)
    {
        while (true)
        {
            if (sampleBuffer.Writer.TryWrite(sample))
            {
                return;
            }

            if (sampleBuffer.Reader.TryRead(out _))
            {
                Interlocked.Increment(ref _samplesDropped);
                continue;
            }

            if (sampleBuffer.Reader.Completion.IsCompleted)
            {
                return;
            }
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
