using Microsoft.Data.Sqlite;
using SectorForge.Collector.Adapters;
using SectorForge.Infrastructure.Storage;

namespace SectorForge.Core.Tests;

public sealed class SqliteTelemetrySessionStoreTests
{
    [Fact]
    public async Task SaveSampleCreatesQueryableSessionDetails()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", $"{Guid.NewGuid():N}.db");
        var connectionString = new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString();
        var store = new SqliteTelemetrySessionStore(connectionString);
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();
        var sample = adapter.CreateSample(TimeSpan.FromSeconds(12), 1, sessionId);

        await store.SaveSampleAsync(sample);

        var sessions = await store.ListSessionsAsync();
        var details = await store.GetSessionAsync(sessionId);

        Assert.Single(sessions);
        Assert.NotNull(details);
        Assert.Equal(sessionId, details.Session.Id);
        Assert.Single(details.Samples);
        Assert.Equal("Silverstone GP", details.Session.TrackName);
    }
}
