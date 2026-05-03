using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using SectorForge.Core.Telemetry;

namespace SectorForge.Api.Tests;

public sealed class CollectorEndpointsTests
{
    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

    [Fact]
    public async Task CollectorControlEndpointsStartAndStopFakeCollector()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var startResponse = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "fake" });
            startResponse.EnsureSuccessStatusCode();

            var startedStatus = await startResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(startedStatus);
            Assert.True(startedStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Live, startedStatus.RunMode);
            Assert.Equal("fake", startedStatus.ActiveAdapterId);

            var statusResponse = await client.GetAsync("/api/collector/status");
            statusResponse.EnsureSuccessStatusCode();

            var runningStatus = await statusResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(runningStatus);
            Assert.True(runningStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Live, runningStatus.RunMode);
            Assert.Equal("fake", runningStatus.ActiveAdapterId);

            var stopResponse = await client.PostAsync("/api/collector/stop", content: null);
            stopResponse.EnsureSuccessStatusCode();

            var stoppedStatus = await stopResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(stoppedStatus);
            Assert.False(stoppedStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Idle, stoppedStatus.RunMode);

            var finalStatusResponse = await client.GetAsync("/api/collector/status");
            finalStatusResponse.EnsureSuccessStatusCode();

            var finalStatus = await finalStatusResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(finalStatus);
            Assert.False(finalStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Idle, finalStatus.RunMode);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    [Fact]
    public async Task ReplayStartReturnsNotFoundForMissingSession()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var response = await client.PostAsync($"/api/replay/start/{Guid.NewGuid()}", content: null);

            Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    [Fact]
    public async Task CollectorStartReturnsNotFoundForUnknownAdapter()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "missing" });

            Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    [Fact]
    public async Task CollectorStartReturnsBadRequestForUnavailableAdapter()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "f1-25-udp" });

            Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    [Fact]
    public async Task GamesEndpointListsRegisteredSourcesAndMarksActiveAdapterRunning()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var startResponse = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "fake" });
            startResponse.EnsureSuccessStatusCode();

            var response = await client.GetAsync("/api/games");
            response.EnsureSuccessStatusCode();

            var sources = await response.Content.ReadFromJsonAsync<IReadOnlyList<TelemetrySource>>(JsonOptions);
            Assert.NotNull(sources);
            Assert.Contains(sources, source => source.AdapterId == "fake" && source.Status == TelemetrySourceStatus.Running);
            Assert.Contains(sources, source => source.AdapterId == "f1-25-udp" && source.Status == TelemetrySourceStatus.Offline);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    [Fact]
    public async Task ReplayStartReturnsRunningStatusForStoredSession()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var startResponse = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "fake" });
            startResponse.EnsureSuccessStatusCode();

            var session = await WaitForSavedSessionAsync(client, TimeSpan.FromSeconds(2));

            var stopResponse = await client.PostAsync("/api/collector/stop", content: null);
            stopResponse.EnsureSuccessStatusCode();

            var replayResponse = await client.PostAsync($"/api/replay/start/{session.Id}", content: null);
            replayResponse.EnsureSuccessStatusCode();

            var replayStatus = await replayResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(replayStatus);
            Assert.True(replayStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Replay, replayStatus.RunMode);
            Assert.Equal("replay", replayStatus.ActiveAdapterId);
            Assert.NotNull(replayStatus.Source);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    [Fact]
    public async Task DeleteSessionRemovesSessionFromList()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var startResponse = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "fake" });
            startResponse.EnsureSuccessStatusCode();

            var session = await WaitForSavedSessionAsync(client, TimeSpan.FromSeconds(2));

            var stopResponse = await client.PostAsync("/api/collector/stop", content: null);
            stopResponse.EnsureSuccessStatusCode();

            var deleteResponse = await client.DeleteAsync($"/api/sessions/{session.Id}");
            Assert.Equal(System.Net.HttpStatusCode.NoContent, deleteResponse.StatusCode);

            var detailResponse = await client.GetAsync($"/api/sessions/{session.Id}");
            Assert.Equal(System.Net.HttpStatusCode.NotFound, detailResponse.StatusCode);

            var listResponse = await client.GetAsync("/api/sessions");
            listResponse.EnsureSuccessStatusCode();
            var sessions = await listResponse.Content.ReadFromJsonAsync<IReadOnlyList<TelemetrySessionSummary>>(JsonOptions);
            Assert.NotNull(sessions);
            Assert.DoesNotContain(sessions, candidate => candidate.Id == session.Id);

            var missing = await client.DeleteAsync($"/api/sessions/{Guid.NewGuid()}");
            Assert.Equal(System.Net.HttpStatusCode.NotFound, missing.StatusCode);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    private static WebApplicationFactory<Program> CreateFactory(string connectionString)
    {
        return ApiTestFactory.Create(new Dictionary<string, string?>
        {
            ["ConnectionStrings:SectorForge"] = connectionString
        });
    }

    private static async Task<TelemetrySessionSummary> WaitForSavedSessionAsync(HttpClient client, TimeSpan timeout)
    {
        var startedAt = DateTimeOffset.UtcNow;

        while (DateTimeOffset.UtcNow - startedAt <= timeout)
        {
            var response = await client.GetAsync("/api/sessions");
            response.EnsureSuccessStatusCode();

            var sessions = await response.Content.ReadFromJsonAsync<IReadOnlyList<TelemetrySessionSummary>>(JsonOptions);
            var session = sessions?.FirstOrDefault(candidate => candidate.SampleCount > 0);
            if (session is not null)
            {
                return session;
            }

            await Task.Delay(20);
        }

        throw new TimeoutException("Timed out waiting for a stored telemetry session.");
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
