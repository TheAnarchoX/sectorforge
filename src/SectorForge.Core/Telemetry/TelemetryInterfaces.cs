namespace SectorForge.Core.Telemetry;

public interface ITelemetryAdapter
{
    TelemetrySource Source { get; }

    IAsyncEnumerable<TelemetrySample> RunAsync(CancellationToken cancellationToken);
}

public interface ITelemetryReceiver
{
    Task StartAsync(string adapterId, CancellationToken cancellationToken = default);

    Task StopAsync(CancellationToken cancellationToken = default);

    TelemetryReceiverStatus GetStatus();
}

public interface ITelemetryNormalizer<in TRawPacket>
{
    TelemetrySample Normalize(TRawPacket packet);
}

public interface ITelemetrySessionStore
{
    Task UpsertSessionAsync(TelemetrySample sample, CancellationToken cancellationToken = default);

    Task SaveSampleAsync(TelemetrySample sample, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<TelemetrySessionSummary>> ListSessionsAsync(CancellationToken cancellationToken = default);

    Task<TelemetrySessionDetails?> GetSessionAsync(Guid sessionId, CancellationToken cancellationToken = default);
}

public interface ILiveTelemetryPublisher
{
    Task PublishAsync(TelemetrySample sample, CancellationToken cancellationToken = default);

    Task PublishStatusAsync(TelemetryReceiverStatus status, CancellationToken cancellationToken = default);
}
