using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;

namespace SectorForge.Protocol.Tests;

public sealed class WorkerTests
{
    [Fact]
    public async Task WorkerLogsProgressWhenTelemetryStreamAdvances()
    {
        var adapter = new FakeTelemetryAdapter(TimeSpan.FromMilliseconds(1));
        var logger = new RecordingLogger<Worker>();
        var worker = new Worker(adapter, logger);

        try
        {
            await worker.StartAsync(CancellationToken.None);
            await WaitForConditionAsync(
                () => logger.Messages.Any(message => message.Contains("kph", StringComparison.OrdinalIgnoreCase)),
                TimeSpan.FromSeconds(2));
        }
        finally
        {
            await worker.StopAsync(CancellationToken.None);
        }

        Assert.Contains(logger.Messages, message => message.Contains("Fake telemetry", StringComparison.OrdinalIgnoreCase));
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

    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public ConcurrentQueue<string> Messages { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        {
            return NullScope.Instance;
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return true;
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Messages.Enqueue(formatter(state, exception));
        }
    }

    private sealed class NullScope : IDisposable
    {
        public static NullScope Instance { get; } = new();

        public void Dispose()
        {
        }
    }
}
