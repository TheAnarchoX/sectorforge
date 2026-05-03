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
        Assert.NotNull(details.Samples[0].Participants);
        Assert.Equal(6, details.Samples[0].Participants?.Count);
        Assert.Contains(
            details.Samples[0].Participants ?? [],
            participant => participant.IsPlayer && participant.TeamName == "SectorForge Works");
    }

    [Fact]
    public async Task SaveSamplePrunesOlderRawBlobsButKeepsSessionSummaryAndLaps()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", $"{Guid.NewGuid():N}.db");
        var connectionString = new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString();
        var store = new SqliteTelemetrySessionStore(connectionString, retainedSampleBlobLimit: 3);
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();
        var otherSessionId = Guid.NewGuid();

        for (var sequence = 1L; sequence <= 5; sequence++)
        {
            var sample = adapter.CreateSample(TimeSpan.FromSeconds(sequence * 95), sequence, sessionId);
            await store.SaveSampleAsync(sample);
        }

        for (var sequence = 1L; sequence <= 2; sequence++)
        {
            var sample = adapter.CreateSample(TimeSpan.FromSeconds(sequence * 45), sequence, otherSessionId);
            await store.SaveSampleAsync(sample);
        }

        var details = await store.GetSessionAsync(sessionId);
        var otherDetails = await store.GetSessionAsync(otherSessionId);

        Assert.NotNull(details);
        Assert.Equal(5, details.Session.SampleCount);
        Assert.Equal([3L, 4L, 5L], details.Samples.Select(sample => sample.Sequence).ToArray());
        Assert.Equal(5, details.Laps.Count);
        Assert.Equal(3, await CountRawSampleBlobsAsync(connectionString, sessionId));

        Assert.NotNull(otherDetails);
        Assert.Equal(2, otherDetails.Session.SampleCount);
        Assert.Equal([1L, 2L], otherDetails.Samples.Select(sample => sample.Sequence).ToArray());
        Assert.Equal(2, await CountRawSampleBlobsAsync(connectionString, otherSessionId));
    }

    [Fact]
    public async Task DeleteSessionRemovesSummaryAndBlobs()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", $"{Guid.NewGuid():N}.db");
        var connectionString = new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString();
        var store = new SqliteTelemetrySessionStore(connectionString);
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();
        var keepId = Guid.NewGuid();

        await store.SaveSampleAsync(adapter.CreateSample(TimeSpan.FromSeconds(10), 1, sessionId));
        await store.SaveSampleAsync(adapter.CreateSample(TimeSpan.FromSeconds(20), 2, sessionId));
        await store.SaveSampleAsync(adapter.CreateSample(TimeSpan.FromSeconds(15), 1, keepId));

        var deleted = await store.DeleteSessionAsync(sessionId);

        Assert.True(deleted);
        Assert.Null(await store.GetSessionAsync(sessionId));
        Assert.Equal(0, await CountRawSampleBlobsAsync(connectionString, sessionId));

        var remaining = await store.ListSessionsAsync();
        Assert.Single(remaining);
        Assert.Equal(keepId, remaining[0].Id);

        var missingDelete = await store.DeleteSessionAsync(Guid.NewGuid());
        Assert.False(missingDelete);
    }

    private static async Task<int> CountRawSampleBlobsAsync(string connectionString, Guid sessionId)
    {
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM telemetry_sample_blobs WHERE session_id = $sessionId;";
        command.Parameters.AddWithValue("$sessionId", sessionId.ToString());

        var result = await command.ExecuteScalarAsync();
        return result is long count ? (int)count : 0;
    }
}
